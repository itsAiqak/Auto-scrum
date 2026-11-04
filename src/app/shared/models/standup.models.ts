// Shape of the data Auto-Scrum expects. The backend (git push webhook) should
// eventually return Member[], Commit[] and DayPlan[] in exactly this form.

export type Member = {
  id: string;
  name: string;
  initials: string;
  role: string;
  team: string;
  avatarColor: string;
  gitEmails: string[];
};

export type Commit = {
  sha: string;
  authorEmail: string;
  /** Git author name, when the source sends it (Ascrum does). */
  authorName?: string;
  repo: string;
  branch: string;
  message: string;
  /** Local date-time, 'YYYY-MM-DDTHH:mm' */
  timestamp: string;
  filesChanged: number;
  /** Web page of the commit (GitLab, GitHub...), built by the backend from the push's remote URL. */
  url?: string;
};

/** manual = typed, suggested = from git activity, carried = unfinished item from the previous plan. */
export type PlanSource = 'suggested' | 'manual' | 'carried';

export type PlanItem = {
  text: string;
  source: PlanSource;
  /** Set by the owner when reviewing it the next day; unset means auto-detect from commits. */
  done?: boolean;
};

/** A previous-day plan item, checked against what was actually pushed. */
export type PlanReviewItem = {
  text: string;
  done: boolean;
  /** true when `done` was guessed from commits, false when the owner set it. */
  auto: boolean;
};

export type Suggestion = {
  text: string;
  source: Exclude<PlanSource, 'manual'>;
};

/** What a member typed (or accepted) for a given standup day. */
export type DayPlan = {
  memberId: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** Extra "yesterday" work that is not in git (meetings, reviews, research). */
  notes: string[];
  today: PlanItem[];
  blockers: string[];
  /** Yesterday's blockers the owner marked as resolved today. */
  resolvedBlockers: string[];
  /** Parts of the standup the owner has looked at (for the readiness bar). */
  reviewed: { yesterday: boolean; blockers: boolean };
  /** 'HH:mm' when submitted, null while still a draft. */
  submittedAt: string | null;
};

/** Commits on one repo/branch, grouped into a single "yesterday" bullet. */
export type WorkItem = {
  repo: string;
  branch: string;
  summary: string;
  commits: Commit[];
};

/** One branch I pushed to, for My Work. */
export type BranchWork = {
  repo: string;
  branch: string;
  /** Newest first. */
  commits: Commit[];
  /** Timestamp of the newest commit. */
  lastPush: string;
};

export type Standup = {
  member: Member;
  date: string;
  yesterdayDate: string;
  yesterday: WorkItem[];
  /** The plan made on `yesterdayDate`, marked done / not done. */
  planReview: PlanReviewItem[];
  notes: string[];
  today: PlanItem[];
  blockers: string[];
  /** Blockers from the previous standup, to keep or resolve. */
  previousBlockers: string[];
  resolvedBlockers: string[];
  reviewed: { yesterday: boolean; blockers: boolean };
  submittedAt: string | null;
};

/** One past day in "Looking back". */
export type HistoryDay = {
  date: string;
  plan: PlanReviewItem[];
  blockers: string[];
  commitCount: number;
  submittedAt: string | null;
  onTime: boolean;
};
