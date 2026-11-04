import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { StandupService } from './standup.service';
import { AUTO_NEXT_GRACE_SECONDS } from '../../shared/utils/stopwatch';

/**
 * A live team scrum shared between the scrum master's screen and each coder's screen.
 * The scrum master starts it; each speaker's countdown only runs once that coder presses Start on their own page.
 * Times are stored as timestamps so every screen computes the same countdown.
 */
export type ScrumSession = {
  date: string;
  /** Member ids in speaking order. */
  order: string[];
  index: number;
  speakingSeconds: number;
  /** Epoch ms when the current speaker pressed Start; null while waiting for them. */
  startedAt: number | null;
  /** Seconds the current speaker had already used when they pressed Start (going back to someone keeps their time). */
  startedWith: number;
  /** Seconds used per member id, not counting the running turn. */
  spoken: Record<string, number>;
  sessionStartedAt: number;
  finishedAt: number | null;
  /** The tab that runs the session (scrum master); only it auto-advances. */
  ownerTab: string;
};

// TODO: replace localStorage syncing with the backend (e.g. WebSocket) so it works across machines.
const STORAGE_KEY = 'auto-scrum.session';
const TAB_ID = Math.random().toString(36).slice(2);

@Injectable({ providedIn: 'root' })
export class ScrumSessionService {
  private readonly standup = inject(StandupService);
  readonly session = signal<ScrumSession | null>(readStored());
  /** Clock that ticks while a speaker is talking, so countdowns re-render. */
  private readonly now = signal(Date.now());
  private ticker?: ReturnType<typeof setInterval>;

  readonly isLive = computed(() => !!this.session() && !this.session()!.finishedAt);
  readonly isFinished = computed(() => !!this.session()?.finishedAt);
  readonly isOwner = computed(() => this.session()?.ownerTab === TAB_ID);
  readonly currentId = computed(() => {
    const session = this.session();
    return session ? session.order[session.index] ?? null : null;
  });
  readonly currentMember = computed(() => this.memberById(this.currentId()));
  readonly nextMember = computed(() => {
    const session = this.session();
    return session ? this.memberById(session.order[session.index + 1] ?? null) : null;
  });
  readonly waiting = computed(() => this.isLive() && this.session()!.startedAt === null);
  readonly isMyTurn = computed(() => this.isLive() && this.currentId() === this.standup.me.id);
  /** My place in the speaking order (1-based), or 0 when I'm not in it. */
  readonly myPosition = computed(() => (this.session()?.order.indexOf(this.standup.me.id) ?? -1) + 1);

  /** Seconds used per member, including the running turn. */
  readonly spoken = computed<Record<string, number>>(() => {
    const session = this.session();
    if (!session) return {};
    const result = { ...session.spoken };
    const id = session.order[session.index];
    if (session.startedAt && !session.finishedAt) result[id] = session.startedWith + secondsBetween(session.startedAt, this.now());
    return result;
  });
  readonly currentSeconds = computed(() => this.spoken()[this.currentId() ?? ''] ?? 0);
  readonly totalSeconds = computed(() => {
    const session = this.session();
    return session ? secondsBetween(session.sessionStartedAt, session.finishedAt ?? this.now()) : 0;
  });

  constructor() {
    // Another tab changed the session.
    window.addEventListener('storage', event => {
      if (event.key === STORAGE_KEY) this.session.set(readStored());
    });

    // Tick only while the scrum is live.
    effect(() => {
      if (this.isLive()) this.startTicker();
      else this.stopTicker();
    });
  }

  /** Scrum master: go live with this speaking order. Nobody's timer runs until they press Start. */
  start(order: string[]): void {
    const now = Date.now();
    this.write({
      date: this.standup.selectedDate(),
      order,
      index: 0,
      speakingSeconds: this.standup.speakingSeconds(),
      startedAt: null,
      startedWith: 0,
      spoken: {},
      sessionStartedAt: now,
      finishedAt: null,
      ownerTab: TAB_ID
    });
  }

  /** Coder: start my turn. Ignored unless it's that member's turn and they haven't started yet. */
  speakerStart(memberId: string): void {
    const session = this.session();
    if (!session || session.finishedAt || session.startedAt || this.currentId() !== memberId) return;
    this.write({ ...session, startedAt: Date.now(), startedWith: session.spoken[memberId] ?? 0 });
  }

  goTo(index: number): void {
    const session = this.session();
    if (!session || index < 0 || index >= session.order.length) return;
    this.write({ ...this.banked(session), index, startedAt: null, startedWith: 0 });
  }

  next(): void {
    const session = this.session();
    if (!session) return;
    if (session.index >= session.order.length - 1) this.finish();
    else this.goTo(session.index + 1);
  }

  finish(): void {
    const session = this.session();
    if (session) this.write({ ...this.banked(session), startedAt: null, finishedAt: Date.now() });
  }

  setSpeakingSeconds(seconds: number): void {
    this.standup.speakingSeconds.set(seconds);
    const session = this.session();
    if (session) this.write({ ...session, speakingSeconds: seconds });
  }

  /** Close the session for everyone. */
  end(): void {
    this.session.set(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable: this tab only */ }
  }

  private banked(session: ScrumSession): ScrumSession {
    const id = session.order[session.index];
    if (!session.startedAt) return session;
    return { ...session, spoken: { ...session.spoken, [id]: session.startedWith + secondsBetween(session.startedAt, Date.now()) } };
  }

  private tick(): void {
    this.now.set(Date.now());
    const session = this.session();
    // Only the scrum master's tab advances, so two screens never skip twice.
    if (!session?.startedAt || !this.isOwner() || !this.standup.autoNext()) return;
    const limit = session.speakingSeconds + AUTO_NEXT_GRACE_SECONDS;
    // Someone who was already over the limit when they restarted is not bounced straight on.
    if (session.startedWith < limit && this.currentSeconds() >= limit) this.next();
  }

  private startTicker(): void {
    if (this.ticker) return;
    this.ticker = setInterval(() => this.tick(), 250);
  }

  private stopTicker(): void {
    clearInterval(this.ticker);
    this.ticker = undefined;
  }

  private write(session: ScrumSession): void {
    this.session.set(session);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch { /* storage unavailable: this tab only */ }
  }

  private memberById(id: string | null) {
    return id ? this.standup.teamStatus().find(s => s.member.id === id)?.member ?? null : null;
  }
}

function secondsBetween(from: number, to: number): number {
  return Math.max(0, Math.floor((to - from) / 1000));
}

function readStored(): ScrumSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScrumSession) : null;
  } catch {
    return null;
  }
}
