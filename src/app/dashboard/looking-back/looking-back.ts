import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { StandupService } from '../../core/services/standup.service';

/** Days listed before "Show older"; the stats always cover all of them. */
const RECENT_DAYS = 5;

/** My last two weeks from real data (saved plans and pushes): on-time finishes, plan completion, commits, blockers. */
@Component({
  selector: 'app-looking-back',
  templateUrl: './looking-back.html',
  styleUrl: './looking-back.scss',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LookingBackComponent {
  protected readonly standup = inject(StandupService);
  protected readonly stats = this.standup.myStats;
  protected readonly showOlder = signal(false);
  protected readonly history = computed(() => (this.showOlder() ? this.standup.myHistory() : this.standup.myHistory().slice(0, RECENT_DAYS)));
  protected readonly olderCount = computed(() => Math.max(0, this.standup.myHistory().length - RECENT_DAYS));

  protected doneCount(plan: { done: boolean }[]): number {
    return plan.filter(item => item.done).length;
  }
}
