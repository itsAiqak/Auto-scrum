import { Commit, DayPlan, Member, PlanItem } from '../../shared/models/standup.models';
import { addWorkdays } from '../../shared/utils/workday';

// Dummy data until the git push webhook is ready.
// `day` is a workday offset from the latest workday: 0 = today, 1 = yesterday, ...

export const MOCK_MEMBERS: Member[] = [
  // The 2nd email is the real `git config user.email`, so pushes sent by the Ascrum extension land on My Standup.
  { id: 'haiqal', name: 'Haiqal', initials: 'HQ', role: 'Frontend Developer', team: 'Frontend', avatarColor: '#7050e8', gitEmails: ['haiqal@example.com', 'haiqal.hazhari@tmrnd.com.my'] },
  { id: 'aina', name: 'Aina Rahman', initials: 'AR', role: 'Backend Developer', team: 'Backend', avatarColor: '#dc1bb9', gitEmails: ['aina@example.com'] },
  { id: 'farid', name: 'Farid Ismail', initials: 'FI', role: 'Backend Developer', team: 'Backend', avatarColor: '#3534df', gitEmails: ['farid@example.com'] },
  { id: 'meiling', name: 'Mei Ling Tan', initials: 'ML', role: 'Frontend Developer', team: 'Frontend', avatarColor: '#277d78', gitEmails: ['meiling@example.com'] }
];

type MockCommit = [memberId: string, day: number, time: string, repo: string, branch: string, message: string, filesChanged: number];

const MOCK_COMMITS: MockCommit[] = [
  // Haiqal (the signed-in user) has none: their commits are real pushes only, from Ascrum through the API.

  // Aina
  ['aina', 4, '10:10', 'payment-service', 'feature/payment-webhook', 'feat(webhook): receive gateway callbacks', 4],
  ['aina', 4, '15:40', 'payment-service', 'feature/payment-webhook', 'feat(webhook): verify callback signature', 2],
  ['aina', 3, '09:30', 'payment-service', 'feature/payment-webhook', 'test(webhook): signature mismatch cases', 1],
  ['aina', 3, '12:20', 'payment-service', 'feature/payment-webhook', 'fix(webhook): handle duplicate callbacks', 2],
  ['aina', 3, '16:45', 'payment-service', 'feature/payment-webhook', 'docs: webhook setup in README', 1],
  ['aina', 2, '11:00', 'payment-service', 'feature/refund-api', 'feat(refund): POST /refunds endpoint', 5],
  ['aina', 2, '18:05', 'payment-service', 'feature/refund-api', 'WIP refund status polling', 3],
  ['aina', 1, '10:20', 'payment-service', 'feature/refund-api', 'feat(refund): refund status enum', 2],

  // Farid (no commits on day 2: sprint planning)
  ['farid', 4, '09:15', 'auth-service', 'feature/jwt-refresh', 'feat(auth): refresh token rotation', 4],
  ['farid', 4, '13:50', 'auth-service', 'feature/jwt-refresh', 'feat(auth): revoke tokens on logout', 3],
  ['farid', 4, '17:30', 'auth-service', 'feature/jwt-refresh', 'fix(auth): clock skew tolerance', 1],
  ['farid', 3, '10:40', 'auth-service', 'feature/jwt-refresh', 'test(auth): refresh rotation e2e', 2],
  ['farid', 3, '15:10', 'auth-service', 'hotfix/login-rate-limit', 'fix(auth): rate limit login to 5 per minute', 2],
  ['farid', 1, '10:00', 'auth-service', 'feature/sso-google', 'feat(sso): Google OAuth callback', 4],
  ['farid', 1, '14:25', 'auth-service', 'feature/sso-google', 'feat(sso): map Google profile to user', 3],
  ['farid', 1, '16:00', 'auth-service', 'feature/sso-google', 'chore(deps): bump passport to 0.7', 2],

  // Mei Ling
  ['meiling', 4, '10:30', 'customer-portal', 'feature/profile-page', 'feat(profile): profile page layout', 5],
  ['meiling', 4, '15:20', 'customer-portal', 'feature/profile-page', 'feat(profile): avatar upload', 3],
  ['meiling', 3, '09:45', 'customer-portal', 'feature/profile-page', 'fix(profile): validate image size', 1],
  ['meiling', 3, '13:30', 'customer-portal', 'feature/profile-page', 'style(profile): dark mode colours', 2],
  ['meiling', 3, '17:00', 'customer-portal', 'feature/profile-page', 'feat(profile): save changes toast', 2],
  ['meiling', 2, '11:10', 'customer-portal', 'bugfix/checkout-total', 'fix(checkout): rounding on discounted total', 2],
  ['meiling', 2, '14:40', 'customer-portal', 'bugfix/checkout-total', 'test(checkout): discount rounding cases', 1],
  ['meiling', 1, '10:15', 'customer-portal', 'feature/i18n', 'feat(i18n): add Malay translations', 6],
  ['meiling', 1, '15:30', 'customer-portal', 'feature/i18n', 'feat(i18n): language switcher in header', 2]
];

const manual = (text: string): PlanItem => ({ text, source: 'manual' });
const suggested = (text: string): PlanItem => ({ text, source: 'suggested' });

type MockPlan = { memberId: string; day: number; today: PlanItem[]; notes?: string[]; blockers?: string[]; submittedAt?: string | null };

const MOCK_PLANS: MockPlan[] = [
  { memberId: 'haiqal', day: 3, today: [manual('Define standup models and dummy data')] },
  { memberId: 'haiqal', day: 2, today: [manual('Build standup board cards'), suggested('Open PR for feature/standup-models')], submittedAt: '09:41' },
  { memberId: 'haiqal', day: 1, today: [manual('Add date navigation to the board'), suggested('Respond to review on PR #12')], blockers: ['Waiting for design review of the board layout'] },
  // Today's standup is still a draft, so the dashboard has something to fill in.
  { memberId: 'haiqal', day: 0, today: [], submittedAt: null },

  { memberId: 'aina', day: 3, today: [manual('Finish webhook tests'), manual('Write webhook setup docs')] },
  { memberId: 'aina', day: 2, today: [manual('Start refund API'), suggested('Merge feature/payment-webhook (PR #31)')] },
  { memberId: 'aina', day: 1, today: [suggested('Continue WIP: refund status polling')], blockers: ['Waiting for payment gateway sandbox API key from vendor'] },
  { memberId: 'aina', day: 0, today: [manual('Integrate refunds with gateway sandbox'), suggested('Continue WIP: refund status polling')], blockers: ['Still waiting for sandbox API key (day 2)'], submittedAt: '08:55' },

  { memberId: 'farid', day: 3, today: [manual('Finish refresh token tests')] },
  { memberId: 'farid', day: 2, today: [manual('Sprint planning'), manual("Review Aina's PR #31")] },
  { memberId: 'farid', day: 1, today: [manual('Start Google SSO')], notes: ['Sprint planning (2h)', "Reviewed Aina's PR #31"] },
  { memberId: 'farid', day: 0, today: [manual('Finish SSO account linking'), suggested('Open PR for feature/sso-google')], submittedAt: '09:05' },

  { memberId: 'meiling', day: 3, today: [manual('Polish profile page')] },
  { memberId: 'meiling', day: 2, today: [manual('Fix checkout total bug (ABC-212)')] },
  { memberId: 'meiling', day: 1, today: [manual('Start Malay translations')], blockers: ['Need final Malay copy from content team'] },
  { memberId: 'meiling', day: 0, today: [], submittedAt: null }
];

/** Git-based ideas for today's plan (open PRs, WIP commits, unmerged branches), keyed by member. */
export const MOCK_SUGGESTIONS: Record<string, string[]> = {
  haiqal: ['Get PR #14 (feature/date-picker) reviewed and merged', 'Continue feature/date-picker: 1 TODO left in standup.service.ts'],
  aina: ['Continue WIP: refund status polling'],
  farid: ['Open PR for feature/sso-google'],
  meiling: ['Open PR for feature/i18n', 'Continue feature/i18n: checkout pages not translated yet']
};

/** Who `me` is when nobody is logged in: only in unit tests, since every page needs a login. */
export const MOCK_CURRENT_USER_ID = 'haiqal';

/** Oldest standup day the dummy data can fully show (its "yesterday" still has commits). */
export const MOCK_HISTORY_DAYS = 3;

/** Turns the day offsets above into real dates, counted back from `anchor`. */
export function buildMockData(anchor: string): { commits: Commit[]; plans: DayPlan[] } {
  const emailOf = (memberId: string) => MOCK_MEMBERS.find(m => m.id === memberId)?.gitEmails[0] ?? '';

  const commits = MOCK_COMMITS.map(([memberId, day, time, repo, branch, message, filesChanged], index): Commit => ({
    sha: (0x3a1f9c0 + index * 104729).toString(16).slice(0, 7),
    authorEmail: emailOf(memberId),
    repo,
    branch,
    message,
    timestamp: `${addWorkdays(anchor, -day)}T${time}`,
    filesChanged
  }));

  const plans = MOCK_PLANS.map(({ memberId, day, today, notes, blockers, submittedAt }): DayPlan => ({
    memberId,
    date: addWorkdays(anchor, -day),
    notes: notes ?? [],
    today,
    blockers: blockers ?? [],
    resolvedBlockers: [],
    // Submitted plans were reviewed; drafts (today) start unreviewed.
    reviewed: { yesterday: submittedAt !== null, blockers: submittedAt !== null },
    submittedAt: submittedAt === undefined ? '09:10' : submittedAt
  }));

  return { commits, plans };
}
