import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { StandupService } from './standup.service';
import { toIsoDate } from '../../shared/utils/workday';

/** Minutes before the standup when the reminder fires and the bar turns orange. */
export const REMIND_MINUTES_BEFORE = 10;
const SOON_MINUTES = 15;

export type StandupTimeStatus = 'none' | 'upcoming' | 'soon' | 'late' | 'done';

/** Tracks time until today's standup and reminds the coder until they finish their scrum. */
@Injectable({ providedIn: 'root' })
export class StandupReminderService {
  private readonly standup = inject(StandupService);
  private readonly now = signal(new Date());
  /** Browser notification opted in by the user. */
  readonly enabled = signal(false);
  readonly supported = typeof window !== 'undefined' && 'Notification' in window;
  private notifiedFor: string | null = null;

  /** Whole minutes until the standup starts (negative once it has started); null on non-standup days. */
  readonly minutesUntil = computed(() => {
    const now = this.now();
    if (toIsoDate(now) !== this.standup.latestDate) return null;
    const [hours, minutes] = this.standup.standupTime().split(':').map(Number);
    const start = new Date(now);
    start.setHours(hours, minutes, 0, 0);
    return Math.ceil((start.getTime() - now.getTime()) / 60000);
  });

  readonly status = computed<StandupTimeStatus>(() => {
    const minutes = this.minutesUntil();
    if (this.standup.myStandup().submittedAt) return 'done';
    if (minutes === null) return 'none';
    if (minutes < 0) return 'late';
    return minutes <= SOON_MINUTES ? 'soon' : 'upcoming';
  });

  /** '25 min', '1 h 5 min' */
  readonly relative = computed(() => {
    const minutes = Math.abs(this.minutesUntil() ?? 0);
    const hours = Math.floor(minutes / 60);
    return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
  });

  constructor() {
    setInterval(() => this.now.set(new Date()), 20_000);

    effect(() => {
      const minutes = this.minutesUntil();
      if (!this.enabled() || this.status() === 'done' || minutes === null) return;
      if (minutes <= REMIND_MINUTES_BEFORE && minutes >= 0 && this.notifiedFor !== this.standup.latestDate) {
        this.notifiedFor = this.standup.latestDate;
        new Notification('Standup soon', { body: `Standup starts in ${minutes} min.` });
      }
    });
  }

  /** Asks for notification permission; returns whether reminders are now on. */
  async enable(): Promise<boolean> {
    if (!this.supported) return false;
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    this.enabled.set(permission === 'granted');
    return this.enabled();
  }

  disable(): void {
    this.enabled.set(false);
  }
}
