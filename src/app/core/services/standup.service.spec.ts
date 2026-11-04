import { TestBed } from '@angular/core/testing';
import { StandupService } from './standup.service';
import { addWorkdays, daysAgo, isWorkday, relativeDay } from '../../shared/utils/workday';
import { countdown } from '../../shared/utils/stopwatch';
import { standupToText } from '../../shared/utils/standup-text';
import { StandupReminderService } from './standup-reminder.service';
import { PUSH_API_URL, PushFeedService } from './push-feed.service';
import { Commit, DayPlan } from '../../shared/models/standup.models';

/** A commit really pushed through Ascrum: mine unless another email is given. My commits come only from these. */
const pushed = (sha: string, branch: string, timestamp: string, authorEmail = 'haiqal.hazhari@tmrnd.com.my'): Commit => ({
  sha, authorEmail, repo: 'auto-scrum', branch, message: 'feat(feed): show pushes from VS Code', timestamp, filesChanged: 2
});
/** My push on `date` that finishes 'Add date navigation to the board' (my dummy plan for yesterday). */
const dateNavigation = (date: string): Commit => ({ ...pushed('d1', 'feature/date-picker', `${date}T09:50`), message: 'feat(board): workday date navigation' });

/** A stand-in API that already has these plans saved; it answers PUTs and keeps a record of them. */
const api = (saved: DayPlan[]) =>
  vi.fn(async (_url: string, init?: RequestInit) => (init?.method === 'PUT' ? new Response(init.body) : Response.json(saved)));
/** My plan for `date` as saved in the API. */
const savedPlan = (date: string, today: string[], more: Partial<DayPlan> = {}): DayPlan => ({
  memberId: 'haiqal', date, notes: [], today: today.map(text => ({ text, source: 'manual' })), blockers: ['Saved blocker'],
  resolvedBlockers: [], reviewed: { yesterday: false, blockers: false }, submittedAt: null, ...more
});

describe('StandupService', () => {
  let service: StandupService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StandupService);
  });

  it('starts with my standup as an unsubmitted draft', () => {
    expect(service.myStandup().submittedAt).toBeNull();
    expect(service.myStandup().today).toEqual([]);
  });

  it('adds a suggestion to today and removes it from the suggestion list', () => {
    const [first] = service.mySuggestions();
    service.addItem('today', first.text, first.source);

    expect(service.myStandup().today).toEqual([{ text: first.text, source: first.source }]);
    expect(service.mySuggestions().map(s => s.text)).not.toContain(first.text);
  });

  it("checks yesterday's plan against commits and carries unfinished items over", () => {
    // 'Add date navigation to the board' matches the pushed date-picker commit; 'Respond to review on PR #12' has none.
    TestBed.inject(PushFeedService).commits.set([dateNavigation(service.myStandup().yesterdayDate)]);
    const review = service.myStandup().planReview;
    expect(review).toEqual([
      { text: 'Add date navigation to the board', done: true, auto: true },
      { text: 'Respond to review on PR #12', done: false, auto: true }
    ]);
    expect(service.mySuggestions()[0]).toEqual({ text: 'Respond to review on PR #12', source: 'carried' });
  });

  it('lets the owner override the auto-detected plan status', () => {
    TestBed.inject(PushFeedService).commits.set([dateNavigation(service.myStandup().yesterdayDate)]);
    service.setPlanReviewDone(1, true);
    expect(service.myStandup().planReview[1]).toEqual({ text: 'Respond to review on PR #12', done: true, auto: false });
    expect(service.mySuggestions().some(s => s.source === 'carried')).toBe(false);
  });

  it('shows submitted edits on the team board', () => {
    service.addItem('today', '  Build member detail page  ');
    service.addItem('blockers', 'Waiting for repo access');
    service.addItem('notes', '   ');
    service.submit();

    const myCard = service.board().find(s => s.member.id === service.me.id)!;
    expect(myCard.today).toEqual([{ text: 'Build member detail page', source: 'manual' }]);
    expect(myCard.blockers).toEqual(['Waiting for repo access']);
    expect(myCard.notes).toEqual([]);
    expect(myCard.submittedAt).toMatch(/^\d{2}:\d{2}$/);
    expect(service.teamStatus().find(s => s.member.id === service.me.id)!.blocked).toBe(true);
  });

  it('removes items, and edits after submitting still reach the board', () => {
    service.addItem('today', 'A');
    service.submit();
    service.addItem('today', 'B');
    service.removeItem('today', 0);

    const myCard = service.board().find(s => s.member.id === service.me.id)!;
    expect(myCard.today.map(i => i.text)).toEqual(['B']);
    expect(myCard.submittedAt).not.toBeNull();
  });

  it('has no dummy commits for me: my Yesterday and My Work are real pushes only, teammates keep theirs', () => {
    expect(service.myStandup().yesterday).toEqual([]);
    expect(service.myBranches()).toEqual([]);
    expect(service.board().find(s => s.member.id === 'farid')!.yesterday.length).toBeGreaterThan(0);
  });
});

describe('StandupService: real pushes from Ascrum', () => {
  let service: StandupService;
  let feed: PushFeedService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StandupService);
    feed = TestBed.inject(PushFeedService);
  });

  it('groups my pushes by branch, most recently pushed branch first, newest commit first', () => {
    const day = service.latestDate;
    feed.commits.set([pushed('a1', 'feature/push-feed', `${day}T10:15`), pushed('b1', 'main', `${day}T12:00`), pushed('a2', 'feature/push-feed', `${day}T11:30`)]);
    expect(service.myBranches().map(b => b.branch)).toEqual(['main', 'feature/push-feed']);
    const feedBranch = service.myBranches()[1];
    expect(feedBranch.commits.map(c => c.sha)).toEqual(['a2', 'a1']);
    expect(feedBranch.lastPush).toBe(`${day}T11:30`);
  });

  it('keeps the same branch name in two repos apart', () => {
    feed.commits.set([pushed('a1', 'main', `${service.latestDate}T10:15`), { ...pushed('b1', 'main', `${service.latestDate}T10:20`), repo: 'intt-portal' }]);
    expect(service.myBranches().map(b => `${b.repo}/${b.branch}`)).toEqual(['intt-portal/main', 'auto-scrum/main']);
  });

  it('names the author: git name if sent, else the member, else the email', () => {
    const commit = pushed('d1', 'main', `${service.latestDate}T09:00`);
    expect(service.authorOf({ ...commit, authorName: 'Muhammad Haiqal bin Hazhari' })).toMatchObject({ name: 'Muhammad Haiqal bin Hazhari', initials: 'MH' });
    expect(service.authorOf(commit)).toMatchObject({ name: 'Haiqal', initials: 'H', email: 'haiqal.hazhari@tmrnd.com.my' });
    expect(service.authorOf({ ...commit, authorEmail: 'someone@else.com' })).toMatchObject({ name: 'someone@else.com', initials: 'SE' });
  });

  it("puts yesterday's real pushes in Yesterday, and ignores other people's", () => {
    const yesterday = service.myStandup().yesterdayDate;
    feed.commits.set([pushed('c1', 'feature/push-feed', `${yesterday}T16:00`), pushed('c2', 'feature/other', `${yesterday}T16:05`, 'someone@else.com')]);
    expect(service.myStandup().yesterday.map(w => w.branch)).toContain('feature/push-feed');
    expect(service.myStandup().yesterday.map(w => w.branch)).not.toContain('feature/other');
    expect(service.myBranches().map(w => w.branch)).not.toContain('feature/other');
  });
});

describe('StandupService: saving my plans to the API', () => {
  let service: StandupService;
  /** [url, plan] of each PUT so far. */
  const puts = (fetch: ReturnType<typeof api>) =>
    fetch.mock.calls.filter(([, init]) => init?.method === 'PUT').map(([url, init]): [string, DayPlan] => [url, JSON.parse(init!.body as string)]);

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StandupService);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('saves nothing before connect(), so tests never reach the API', () => {
    const fetch = api([]);
    vi.stubGlobal('fetch', fetch);
    service.addItem('today', 'Not saved');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads my saved plan over the dummy one', async () => {
    vi.stubGlobal('fetch', api([savedPlan(service.latestDate, ['Saved item'])]));
    await service.connect();
    expect(service.myStandup().today.map(item => item.text)).toEqual(['Saved item']);
    expect(service.myStandup().blockers).toEqual(['Saved blocker']);
  });

  it('saves the whole plan for the day after each edit', async () => {
    const fetch = api([]);
    vi.stubGlobal('fetch', fetch);
    await service.connect();
    service.addItem('today', 'Build member detail page');
    service.addItem('blockers', 'Waiting for repo access');
    await vi.waitFor(() =>
      expect(puts(fetch).at(-1)).toEqual([
        `${PUSH_API_URL}/plans/haiqal/${service.latestDate}`,
        expect.objectContaining({ today: [{ text: 'Build member detail page', source: 'manual' }], blockers: ['Waiting for repo access'] })
      ])
    );
  });

  it('keeps an edit made while loading, on top of the saved plan, and saves both', async () => {
    const fetch = api([savedPlan(service.latestDate, ['Saved item'])]);
    vi.stubGlobal('fetch', fetch);
    service.addItem('today', 'Typed while loading');
    await service.connect();
    expect(service.myStandup().today.map(item => item.text)).toEqual(['Saved item', 'Typed while loading']);
    await vi.waitFor(() => expect(puts(fetch).at(-1)?.[1].today.map(item => item.text)).toEqual(['Saved item', 'Typed while loading']));
  });
});

describe('StandupService: Looking Back, real data only', () => {
  let service: StandupService;
  const workdaysAgo = (days: number) => addWorkdays(service.latestDate, -days);

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StandupService);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('leaves out the dummy plans', () => {
    expect(service.myHistory()).toEqual([]);
    expect(service.myStats()).toMatchObject({ days: 0, planTotal: 0 });
  });

  it('builds history and stats from my saved plans and my pushes', async () => {
    vi.stubGlobal('fetch', api([
      savedPlan(workdaysAgo(1), ['Add date navigation to the board', 'Respond to review on PR #12'], { submittedAt: '09:20' }),
      savedPlan(workdaysAgo(3), ['Define standup models and dummy data'], { blockers: [], submittedAt: '09:45' })
    ]));
    await service.connect();
    // 1 and 3 workdays ago finish a plan item each; 2 workdays ago has a push but no saved plan (its dummy one is left out).
    TestBed.inject(PushFeedService).commits.set([
      dateNavigation(workdaysAgo(1)),
      pushed('p2', 'main', `${workdaysAgo(2)}T15:00`),
      pushed('x2', 'main', `${workdaysAgo(2)}T15:10`, 'someone@else.com'),
      { ...pushed('m1', 'feature/standup-models', `${workdaysAgo(3)}T10:05`), message: 'feat(models): add Member, Commit, Standup types' }
    ]);

    const history = service.myHistory();
    expect(history.map(day => [day.date, day.commitCount, day.plan.length, day.submittedAt, day.onTime])).toEqual([
      [workdaysAgo(1), 1, 2, '09:20', true],
      [workdaysAgo(2), 1, 0, null, false],
      [workdaysAgo(3), 1, 1, '09:45', false]
    ]);
    expect(history[0].plan.map(item => item.done)).toEqual([true, false]);
    expect(service.myStats()).toEqual({
      days: 3, onTime: 1, onTimePercent: 33, planDone: 2, planTotal: 3, planPercent: 67, commitsPerDay: 1, blockers: 1
    });
  });

  it('goes back two weeks of workdays', () => {
    TestBed.inject(PushFeedService).commits.set([pushed('a', 'main', `${workdaysAgo(10)}T10:00`), pushed('b', 'main', `${workdaysAgo(11)}T10:00`)]);
    expect(service.myHistory().map(day => day.date)).toEqual([workdaysAgo(10)]);
  });
});

describe('StandupService: getting ready', () => {
  let service: StandupService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StandupService);
  });

  it('tracks readiness: yesterday reviewed, today planned, blockers reviewed', () => {
    expect(service.readiness().done).toBe(0);
    service.markReviewed('yesterday');
    service.addItem('today', 'Build member detail page');
    expect(service.readiness()).toMatchObject({ yesterday: true, today: true, blockers: false, done: 2 });

    // Yesterday's blocker must be kept or resolved before blockers count as reviewed.
    service.markReviewed('blockers');
    expect(service.readiness().blockers).toBe(false);
    service.resolveBlocker('Waiting for design review of the board layout');
    expect(service.readiness()).toMatchObject({ blockers: true, done: 3 });
  });

  it("asks about yesterday's blocker: keep carries it into today, resolve records it", () => {
    expect(service.pendingBlockers()).toEqual(['Waiting for design review of the board layout']);
    service.keepBlocker('Waiting for design review of the board layout');
    expect(service.myStandup().blockers).toEqual(['Waiting for design review of the board layout']);
    expect(service.pendingBlockers()).toEqual([]);
  });

  it('adds every suggestion in one click, carried-over first', () => {
    // No pushes yesterday, so both items of yesterday's plan carry over.
    service.addAllSuggestions();
    expect(service.myStandup().today.map(item => item.source)).toEqual(['carried', 'carried', 'suggested', 'suggested']);
    expect(service.mySuggestions()).toEqual([]);
  });

  it('formats the standup as Slack / Teams text', () => {
    TestBed.inject(PushFeedService).commits.set([dateNavigation(service.myStandup().yesterdayDate)]);
    service.addItem('today', 'Build member detail page');
    service.resolveBlocker('Waiting for design review of the board layout');
    expect(standupToText(service.myStandup(), 'Mon, 28 Sep')).toBe([
      '*Standup: Haiqal, Mon, 28 Sep*', '',
      '*Yesterday*', '• Workday date navigation', '_Not finished:_ Respond to review on PR #12', '',
      '*Today*', '• Build member detail page', '',
      '*Blockers*', '• None', '_Resolved:_ Waiting for design review of the board layout'
    ].join('\n'));
  });
});

describe('StandupReminderService', () => {
  const at = (hours: number, minutes: number) => {
    vi.setSystemTime(new Date(2026, 8, 28, hours, minutes)); // a Monday
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(StandupReminderService);
  };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is upcoming, then soon within 15 min, then late after the start time', () => {
    expect(at(9, 0).status()).toBe('upcoming');
    expect(at(9, 20).status()).toBe('soon');
    expect(at(9, 20).minutesUntil()).toBe(10);
    expect(at(9, 45).status()).toBe('late');
  });

  it('is done once submitted', () => {
    const reminder = at(9, 20);
    const standup = TestBed.inject(StandupService);
    standup.addItem('today', 'Something');
    standup.submit();
    expect(reminder.status()).toBe('done');
  });
});

describe('speaking countdown', () => {
  it('counts down from 30 seconds, warns in the last 10, then shows overtime', () => {
    expect(countdown(0)).toEqual({ label: '0:30', state: 'ok', percentLeft: 100 });
    expect(countdown(21)).toEqual({ label: '0:09', state: 'warning', percentLeft: 30 });
    expect(countdown(30)).toEqual({ label: '0:00', state: 'over', percentLeft: 0 });
    expect(countdown(95)).toEqual({ label: '+1:05', state: 'over', percentLeft: 0 });
  });
});

describe('workday helpers', () => {
  it('skips the weekend when going back from Monday', () => {
    expect(addWorkdays('2026-09-28', -1)).toBe('2026-09-25');
    expect(addWorkdays('2026-09-25', 1)).toBe('2026-09-28');
    expect(isWorkday('2026-09-26')).toBe(false);
  });

  it('says how long ago a push was, in calendar days', () => {
    expect(relativeDay('2026-10-30T10:58', '2026-10-30')).toBe('today');
    expect(relativeDay('2026-10-29T23:59', '2026-10-30')).toBe('yesterday');
    expect(relativeDay('2026-10-26', '2026-10-30')).toBe('4 days ago');
    expect(relativeDay('2026-10-12', '2026-10-30')).toBe('12 Oct');
    // Across the end of daylight saving (Europe, 25 Oct 2026) still counts whole days.
    expect(daysAgo('2026-10-24', '2026-10-26')).toBe(2);
  });
});
