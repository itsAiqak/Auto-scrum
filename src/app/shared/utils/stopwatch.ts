import { computed, signal } from '@angular/core';

/** Default speaking time per person at the scrum, in seconds. The timers count down from this. */
export const SPEAKING_TARGET_SECONDS = 30;
/** Speaking times the team can pick from. */
export const SPEAKING_OPTIONS = [30, 45, 60, 90];
/** Seconds of "Moving on in…" after time is up before team scrum auto-advances. */
export const AUTO_NEXT_GRACE_SECONDS = 3;
/** Remaining seconds at which the countdown turns to a warning colour. */
export const SPEAKING_WARNING_SECONDS = 10;

export type CountdownState = 'ok' | 'warning' | 'over';

/** Countdown view of elapsed seconds: '0:12' left, or '+0:05' once time is up. */
export function countdown(elapsed: number, target = SPEAKING_TARGET_SECONDS): { label: string; state: CountdownState; percentLeft: number } {
  const left = target - elapsed;
  return {
    label: left >= 0 ? formatSeconds(left) : `+${formatSeconds(-left)}`,
    state: left <= 0 ? 'over' : left <= SPEAKING_WARNING_SECONDS ? 'warning' : 'ok',
    percentLeft: Math.max(0, Math.round((left / target) * 100))
  };
}

/** Seconds counter backed by a signal. Call stop() when the owner is destroyed. */
export class Stopwatch {
  readonly seconds = signal(0);
  readonly label = computed(() => formatSeconds(this.seconds()));
  private timer?: ReturnType<typeof setInterval>;

  start(onTick?: () => void): void {
    this.stop();
    this.timer = setInterval(() => {
      this.seconds.update(s => s + 1);
      onTick?.();
    }, 1000);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  reset(): void {
    this.seconds.set(0);
  }
}

/** 75 -> '1:15' */
export function formatSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
