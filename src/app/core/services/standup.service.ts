import { Injectable, computed, inject, signal } from '@angular/core';
import { BranchWork, Commit, DayPlan, HistoryDay, Member, PlanReviewItem, PlanSource, Standup, Suggestion, WorkItem } from '../../shared/models/standup.models';
import { addWorkdays, latestWorkday } from '../../shared/utils/workday';
import { SPEAKING_TARGET_SECONDS } from '../../shared/utils/stopwatch';
import { MOCK_CURRENT_USER_ID, MOCK_HISTORY_DAYS, MOCK_MEMBERS, MOCK_SUGGESTIONS, buildMockData } from '../data/standup.mock';
import { AuthService } from './auth.service';
import { PUSH_API_URL, PushFeedService } from './push-feed.service';

export const ALL_TEAMS = 'All';

export type PlanList = 'notes' | 'today' | 'blockers';

/** How far Looking Back goes: two weeks of workdays. */
export const LOOKING_BACK_WORKDAYS = 10;

@Injectable({ providedIn: 'root' })
export class StandupService {
  readonly latestDate = latestWorkday();
  readonly oldestDate = addWorkdays(this.latestDate, -MOCK_HISTORY_DAYS);

  // TODO: load members from /api/members too. Teammates' plans and commits are still dummy data;
  // my plans load from and save to /api/plans once `connect()` runs (main.ts).
  private readonly members: Member[] = MOCK_MEMBERS;
  private readonly mock = buildMockData(this.latestDate);
  private readonly pushFeed = inject(PushFeedService);
  /** Dummy commits plus the real ones pushed through the Ascrum VS Code extension. */
  private readonly commits = computed<Commit[]>(() => [...this.mock.commits, ...this.pushFeed.commits()]);
  private readonly plans = signal<DayPlan[]>(this.mock.plans);

  // ---- Scrum settings ----

  /** Seconds each person gets at the scrum; the countdowns use this. */
  readonly speakingSeconds = signal(SPEAKING_TARGET_SECONDS);
  /** Team scrum moves to the next person automatically when time is up. */
  readonly autoNext = signal(true);

  // ---- Team board ----

  readonly selectedDate = signal(this.latestDate);
  readonly selectedTeam = signal(ALL_TEAMS);

  readonly teams = [ALL_TEAMS, ...new Set(this.members.map(m => m.team))];
  readonly yesterdayDate = computed(() => addWorkdays(this.selectedDate(), -1));
  readonly canGoBack = computed(() => this.selectedDate() > this.oldestDate);
  readonly canGoForward = computed(() => this.selectedDate() < this.latestDate);
  readonly isLatest = computed(() => this.selectedDate() === this.latestDate);

  readonly board = computed<Standup[]>(() => {
    const team = this.selectedTeam();
    return this.members
      .filter(member => team === ALL_TEAMS || member.team === team)
      .map(member => this.buildStandup(member, this.selectedDate()));
  });

  readonly stats = computed(() => {
    const board = this.board();
    const commits = board.flatMap(s => s.yesterday.flatMap(w => w.commits));
    return {
      members: board.length,
      submitted: board.filter(s => s.submittedAt).length,
      commits: commits.length,
      repos: new Set(commits.map(c => c.repo)).size,
      blocked: board.filter(s => s.blockers.length > 0).length
    };
  });

  previousDay(): void {
    if (this.canGoBack()) this.selectedDate.update(date => addWorkdays(date, -1));
  }

  nextDay(): void {
    if (this.canGoForward()) this.selectedDate.update(date => addWorkdays(date, 1));
  }

  goToLatest(): void {
    this.selectedDate.set(this.latestDate);
  }

  // ---- My standup (dashboard) ----

  /** The logged-in member (pages need a login). Unit tests run without one and get the dummy user. */
  private readonly loggedIn = inject(AuthService).member();
  readonly me: Member = this.members.find(m => m.id === (this.loggedIn?.id ?? MOCK_CURRENT_USER_ID)) ?? this.loggedIn!;
  readonly myStandup = computed(() => this.buildStandup(this.me, this.latestDate));

  /** Ideas for today not yet added: unfinished items from yesterday's plan first, then git activity. */
  readonly mySuggestions = computed<Suggestion[]>(() => {
    const standup = this.myStandup();
    const carried = standup.planReview.filter(item => !item.done).map((item): Suggestion => ({ text: item.text, source: 'carried' }));
    const fromGit = (MOCK_SUGGESTIONS[this.me.id] ?? []).map((text): Suggestion => ({ text, source: 'suggested' }));
    const taken = new Set(standup.today.map(item => item.text));
    return [...carried, ...fromGit].filter(suggestion => {
      if (taken.has(suggestion.text)) return false;
      taken.add(suggestion.text);
      return true;
    });
  });

  /** Start time of the daily standup, 'HH:mm' (editable in Settings). */
  readonly standupTime = signal('09:30');

  /** Yesterday's blockers I haven't kept or resolved yet. */
  readonly pendingBlockers = computed(() => {
    const standup = this.myStandup();
    return standup.previousBlockers.filter(text => !standup.blockers.includes(text) && !standup.resolvedBlockers.includes(text));
  });

  /** The three steps of getting ready for the standup. */
  readonly readiness = computed(() => {
    const standup = this.myStandup();
    const steps = {
      yesterday: standup.reviewed.yesterday,
      today: standup.today.length > 0,
      blockers: this.pendingBlockers().length === 0 && (standup.reviewed.blockers || standup.blockers.length > 0)
    };
    return { ...steps, done: Object.values(steps).filter(Boolean).length, total: 3 };
  });

  /**
   * Looking Back: my last two weeks of workdays with a saved plan or a push, newest first. Real data only (plans saved
   * in the API, pushes from Ascrum), never the dummy plans: what I planned, what got done, blockers, and whether I finished on time.
   */
  readonly myHistory = computed<HistoryDay[]>(() => {
    const days: HistoryDay[] = [];
    const myPushes = this.pushFeed.commits().filter(c => this.me.gitEmails.includes(c.authorEmail));
    for (let offset = 1; offset <= LOOKING_BACK_WORKDAYS; offset++) {
      const date = addWorkdays(this.latestDate, -offset);
      const plan = this.realPlanDates().has(date) ? this.findPlan(this.me.id, date) : undefined;
      const commits = myPushes.filter(c => c.timestamp.startsWith(date));
      if (!plan && !commits.length) continue;
      days.push({
        date,
        plan: reviewPlan(plan, commits),
        blockers: plan?.blockers ?? [],
        commitCount: commits.length,
        submittedAt: plan?.submittedAt ?? null,
        onTime: !!plan?.submittedAt && plan.submittedAt <= this.standupTime()
      });
    }
    return days;
  });

  readonly myStats = computed(() => {
    const history = this.myHistory();
    const planItems = history.flatMap(day => day.plan);
    const planDone = planItems.filter(item => item.done).length;
    const commits = history.reduce((total, day) => total + day.commitCount, 0);
    return {
      days: history.length,
      onTime: history.filter(day => day.onTime).length,
      onTimePercent: history.length ? Math.round((history.filter(day => day.onTime).length / history.length) * 100) : 0,
      planDone,
      planTotal: planItems.length,
      planPercent: planItems.length ? Math.round((planDone / planItems.length) * 100) : 0,
      commitsPerDay: history.length ? Math.round((commits / history.length) * 10) / 10 : 0,
      blockers: history.reduce((total, day) => total + day.blockers.length, 0)
    };
  });

  readonly teamStatus = computed(() =>
    this.members.map(member => {
      const plan = this.findPlan(member.id, this.latestDate);
      return { member, submittedAt: plan?.submittedAt ?? null, blocked: (plan?.blockers.length ?? 0) > 0 };
    })
  );

  /** My Work: every branch I really pushed to (through Ascrum, not dummy data), most recently pushed first. */
  readonly myBranches = computed<BranchWork[]>(() => {
    const branches = new Map<string, BranchWork>();
    const mine = this.pushFeed.commits().filter(c => this.me.gitEmails.includes(c.authorEmail));
    for (const commit of mine.sort((a, b) => b.timestamp.localeCompare(a.timestamp))) {
      const key = `${commit.repo}/${commit.branch}`;
      const branch = branches.get(key) ?? { repo: commit.repo, branch: commit.branch, commits: [], lastPush: commit.timestamp };
      branch.commits.push(commit);
      branches.set(key, branch);
    }
    return [...branches.values()];
  });

  /** Who wrote a commit: the git author name when the source sent it, else the team member with that email, else the email. */
  authorOf(commit: Commit): { name: string; initials: string; email: string } {
    const name = commit.authorName || this.members.find(m => m.gitEmails.includes(commit.authorEmail))?.name || commit.authorEmail;
    const words = name.split(/[\s@._-]+/).filter(Boolean);
    return { name, initials: words.slice(0, 2).map(word => word[0].toUpperCase()).join(''), email: commit.authorEmail };
  }

  addItem(list: PlanList, text: string, source: PlanSource = 'manual'): void {
    const value = text.trim();
    if (!value) return;
    this.updateMyPlan(plan =>
      list === 'today' ? { ...plan, today: [...plan.today, { text: value, source }] } : { ...plan, [list]: [...plan[list], value] }
    );
  }

  removeItem(list: PlanList, index: number): void {
    const keep = (_: unknown, i: number) => i !== index;
    this.updateMyPlan(plan =>
      list === 'today' ? { ...plan, today: plan.today.filter(keep) } : { ...plan, [list]: plan[list].filter(keep) }
    );
  }

  /** Adds every current suggestion (carried-over first, then git) to today's plan. */
  addAllSuggestions(): void {
    const suggestions = this.mySuggestions();
    if (!suggestions.length) return;
    this.updateMyPlan(plan => ({ ...plan, today: [...plan.today, ...suggestions.map(({ text, source }) => ({ text, source }))] }));
  }

  /** Yesterday's blocker still applies: carry it into today. */
  keepBlocker(text: string): void {
    this.updateMyPlan(plan => ({ ...plan, blockers: [...plan.blockers, text], reviewed: { ...plan.reviewed, blockers: true } }));
  }

  resolveBlocker(text: string): void {
    this.updateMyPlan(plan => ({ ...plan, resolvedBlockers: [...plan.resolvedBlockers, text], reviewed: { ...plan.reviewed, blockers: true } }));
  }

  markReviewed(part: 'yesterday' | 'blockers'): void {
    if (this.myStandup().reviewed[part]) return;
    this.updateMyPlan(plan => ({ ...plan, reviewed: { ...plan.reviewed, [part]: true } }));
  }

  /** Owner's correction of the auto-detected done / not done for an item of yesterday's plan. */
  setPlanReviewDone(index: number, done: boolean): void {
    this.updateMyPlan(
      plan => ({ ...plan, today: plan.today.map((item, i) => (i === index ? { ...item, done } : item)) }),
      this.myStandup().yesterdayDate
    );
  }

  submit(): void {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    this.updateMyPlan(plan => ({ ...plan, submittedAt: time }));
  }

  // ---- Saving my plans (FastAPI /api/plans) ----

  /** False until my saved plans have loaded. Nothing is saved before that, and `connect()` never runs in tests. */
  private loaded = false;
  /** Edits made before loading, redone on top of the saved plans so neither is lost. */
  private readonly earlyEdits: { change: (plan: DayPlan) => DayPlan; date: string }[] = [];
  /** Days of my plan changed here and not saved yet. */
  private readonly unsaved = new Set<string>();
  /** Days whose plan of mine is real: saved in the API, or changed here (and so being saved). The others are dummy data. */
  private readonly realPlanDates = signal<ReadonlySet<string>>(new Set());
  private saving = Promise.resolve();
  private retry?: ReturnType<typeof setTimeout>;

  /** Loads my saved plans over the dummy ones, then saves every edit. While the API is down it keeps trying, backing off to once a minute. */
  async connect(): Promise<void> {
    for (let delay = 5_000; !(await this.loadMyPlans()); delay = Math.min(delay * 2, 60_000)) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    this.save();
  }

  private async loadMyPlans(): Promise<boolean> {
    try {
      const response = await fetch(`${PUSH_API_URL}/plans?memberId=${encodeURIComponent(this.me.id)}`, { credentials: 'include' });
      if (!response.ok) return false;
      const saved: DayPlan[] = await response.json();
      const days = new Set(saved.map(plan => plan.date));
      this.realPlanDates.update(dates => new Set([...dates, ...days]));
      this.plans.set([...this.mock.plans.filter(p => p.memberId !== this.me.id || !days.has(p.date)), ...saved]);
      for (const { change, date } of this.earlyEdits.splice(0)) this.applyToMyPlan(change, date);
      this.loaded = true;
      return true;
    } catch {
      return false;
    }
  }

  /** PUTs each unsaved day, one request at a time, with the plan as it is when sent. Tries again in 10 s if that fails. */
  private save(): void {
    if (!this.loaded) return;
    this.saving = this.saving.then(async () => {
      for (const date of this.unsaved) {
        const plan = this.findPlan(this.me.id, date)!;
        if (!(await this.put(plan))) {
          clearTimeout(this.retry);
          this.retry = setTimeout(() => this.save(), 10_000);
          return;
        }
        // Edited again while saving: the save() queued by that edit sends it.
        if (this.findPlan(this.me.id, date) === plan) this.unsaved.delete(date);
      }
    });
  }

  private async put(plan: DayPlan): Promise<boolean> {
    try {
      const response = await fetch(`${PUSH_API_URL}/plans/${encodeURIComponent(plan.memberId)}/${plan.date}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan)
      });
      if (!response.ok) console.warn(`Saving the plan for ${plan.date} failed: ${response.status} ${await response.text()}`);
      return response.ok;
    } catch {
      return false;
    }
  }

  // ---- Helpers ----

  private findPlan(memberId: string, date: string): DayPlan | undefined {
    return this.plans().find(p => p.memberId === memberId && p.date === date);
  }

  private updateMyPlan(change: (plan: DayPlan) => DayPlan, date = this.latestDate): void {
    this.applyToMyPlan(change, date);
    if (!this.loaded) this.earlyEdits.push({ change, date });
    if (!this.realPlanDates().has(date)) this.realPlanDates.update(dates => new Set([...dates, date]));
    this.unsaved.add(date);
    this.save();
  }

  private applyToMyPlan(change: (plan: DayPlan) => DayPlan, date: string): void {
    const empty: DayPlan = { memberId: this.me.id, date, notes: [], today: [], blockers: [], resolvedBlockers: [], reviewed: { yesterday: false, blockers: false }, submittedAt: null };
    this.plans.update(plans => {
      const current = plans.find(p => p.memberId === this.me.id && p.date === date);
      const updated = change(current ?? empty);
      return current ? plans.map(p => (p === current ? updated : p)) : [...plans, updated];
    });
  }

  private buildStandup(member: Member, date: string): Standup {
    const yesterdayDate = addWorkdays(date, -1);
    const commits = this.commits()
      .filter(c => member.gitEmails.includes(c.authorEmail) && c.timestamp.startsWith(yesterdayDate))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const plan = this.findPlan(member.id, date);
    const previousPlan = this.findPlan(member.id, yesterdayDate);

    return {
      member,
      date,
      yesterdayDate,
      yesterday: groupByBranch(commits),
      planReview: reviewPlan(previousPlan, commits),
      notes: plan?.notes ?? [],
      today: plan?.today ?? [],
      blockers: plan?.blockers ?? [],
      previousBlockers: previousPlan?.blockers ?? [],
      resolvedBlockers: plan?.resolvedBlockers ?? [],
      reviewed: plan?.reviewed ?? { yesterday: false, blockers: false },
      submittedAt: plan?.submittedAt ?? null
    };
  }
}

function groupByBranch(commits: Commit[]): WorkItem[] {
  const groups = new Map<string, WorkItem>();
  for (const commit of commits) {
    const key = `${commit.repo}/${commit.branch}`;
    const group = groups.get(key) ?? { repo: commit.repo, branch: commit.branch, summary: summarizeCommit(commit.message), commits: [] };
    group.commits.push(commit);
    groups.set(key, group);
  }
  return [...groups.values()];
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'add', 'start', 'continue', 'finish', 'wip', 'open', 'get', 'make', 'work',
  'feat', 'fix', 'test', 'chore', 'refactor', 'style', 'doc', 'feature', 'bugfix', 'hotfix'
]);

function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(word => word.replace(/s$/, ''))
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

/** A day's plan items, done as the owner marked them, else as guessed from that day's commits. */
function reviewPlan(plan: DayPlan | undefined, commits: Commit[]): PlanReviewItem[] {
  return (plan?.today ?? []).map(item => ({ text: item.text, done: item.done ?? matchesCommits(item.text, commits), auto: item.done === undefined }));
}

/** Rough guess until the backend links plans to tickets: done if 2+ of the item's keywords show up in that day's commits. */
function matchesCommits(text: string, commits: Commit[]): boolean {
  const pushed = new Set(commits.flatMap(c => keywords(`${c.message} ${c.branch}`)));
  const words = keywords(text);
  const hits = words.filter(word => pushed.has(word)).length;
  return hits > 0 && hits >= Math.min(2, words.length);
}

/** 'feat(sso): Google OAuth callback' -> 'Google OAuth callback'. A placeholder for a smarter (AI) summary later. */
export function summarizeCommit(message: string): string {
  const text = message.replace(/^\w+(\([^)]*\))?!?:\s*/, '').replace(/^WIP\s+/i, '').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
