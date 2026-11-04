import { TestBed } from '@angular/core/testing';
import { ScrumSessionService } from './scrum-session.service';
import { StandupService } from './standup.service';

describe('ScrumSessionService', () => {
  let live: ScrumSessionService;
  let standup: StandupService;
  const order = ['haiqal', 'aina', 'farid'];

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 28, 9, 30, 0));
    TestBed.configureTestingModule({});
    live = TestBed.inject(ScrumSessionService);
    standup = TestBed.inject(StandupService);
  });

  afterEach(() => {
    live.end();
    vi.useRealTimers();
  });

  it('goes live waiting for the first speaker; the timer does not move until they press Start', () => {
    live.start(order);
    expect(live.isLive()).toBe(true);
    expect(live.currentId()).toBe('haiqal');
    expect(live.waiting()).toBe(true);
    expect(live.isMyTurn()).toBe(true);

    vi.advanceTimersByTime(10_000);
    expect(live.currentSeconds()).toBe(0);
  });

  it("only the current speaker can start their turn", () => {
    live.start(order);
    live.speakerStart('aina');
    expect(live.waiting()).toBe(true);

    live.speakerStart('haiqal');
    expect(live.waiting()).toBe(false);
    vi.advanceTimersByTime(7_000);
    expect(live.currentSeconds()).toBe(7);
  });

  it('banks the time used on Next and waits again for the next speaker', () => {
    live.start(order);
    live.speakerStart('haiqal');
    vi.advanceTimersByTime(12_000);
    live.next();

    expect(live.currentId()).toBe('aina');
    expect(live.waiting()).toBe(true);
    expect(live.spoken()['haiqal']).toBe(12);
    vi.advanceTimersByTime(5_000);
    expect(live.currentSeconds()).toBe(0);
  });

  it('auto-advances after time is up plus the grace period, then waits for the next speaker', () => {
    standup.speakingSeconds.set(30);
    live.start(order);
    live.speakerStart('haiqal');
    vi.advanceTimersByTime(32_000);
    expect(live.currentId()).toBe('haiqal');

    vi.advanceTimersByTime(2_000);
    expect(live.currentId()).toBe('aina');
    expect(live.waiting()).toBe(true);
  });

  it('finishes after the last speaker and ends for everyone', () => {
    live.start(['haiqal']);
    live.next();
    expect(live.isFinished()).toBe(true);
    expect(live.isLive()).toBe(false);

    live.end();
    expect(live.session()).toBeNull();
    expect(localStorage.getItem('auto-scrum.session')).toBeNull();
  });
});
