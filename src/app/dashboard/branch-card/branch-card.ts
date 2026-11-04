import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { BranchWork } from '../../shared/models/standup.models';
import { daysAgo, relativeDay } from '../../shared/utils/workday';

/** Commits shown on the card; the rest are in the details dialog. */
const PREVIEW = 3;

/** One branch in My Work: when it was last pushed and its latest commits. */
@Component({
  selector: 'app-branch-card',
  templateUrl: './branch-card.html',
  styleUrl: './branch-card.scss',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BranchCardComponent {
  readonly branch = input.required<BranchWork>();
  /** The whole card is clickable; opens the commit details. */
  readonly open = output<void>();

  protected readonly preview = computed(() => this.branch().commits.slice(0, PREVIEW));
  protected readonly more = computed(() => Math.max(0, this.branch().commits.length - PREVIEW));
  protected readonly pushedToday = computed(() => daysAgo(this.branch().lastPush) === 0);
  protected readonly pushed = computed(() => `Pushed ${relativeDay(this.branch().lastPush)}`);
  protected isToday(timestamp: string): boolean {
    return daysAgo(timestamp) === 0;
  }
}
