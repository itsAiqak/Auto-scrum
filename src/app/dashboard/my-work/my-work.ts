import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { StandupService } from '../../core/services/standup.service';
import { PushFeedService } from '../../core/services/push-feed.service';
import { BranchWork } from '../../shared/models/standup.models';
import { daysAgo } from '../../shared/utils/workday';
import { BranchCardComponent } from '../branch-card/branch-card';
import { PushTimelineComponent } from '../push-timeline/push-timeline';
import { WorkDialogComponent } from '../work-dialog/work-dialog';

/** Branches not pushed for longer than this hide behind "Show older". */
const RECENT_DAYS = 14;

/** My Work panel: the branches I pushed to, as cards or as a timeline, with commit details on click. */
@Component({
  selector: 'app-my-work',
  templateUrl: './my-work.html',
  styleUrl: './my-work.scss',
  imports: [BranchCardComponent, PushTimelineComponent, WorkDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyWorkComponent {
  protected readonly standup = inject(StandupService);
  protected readonly pushFeed = inject(PushFeedService);

  protected readonly recentDays = RECENT_DAYS;
  protected readonly view = signal<'branches' | 'timeline'>('branches');
  /** null = all repos. */
  protected readonly repo = signal<string | null>(null);
  protected readonly showOlder = signal(false);

  protected readonly repos = computed(() => [...new Set(this.standup.myBranches().map(b => b.repo))].sort());
  protected readonly branches = computed(() => this.standup.myBranches().filter(b => !this.repo() || b.repo === this.repo()));
  private readonly recent = computed(() => this.branches().filter(b => daysAgo(b.lastPush) <= RECENT_DAYS));
  protected readonly olderCount = computed(() => this.branches().length - this.recent().length);
  protected readonly shown = computed(() => (this.showOlder() ? this.branches() : this.recent()));

  private readonly dialog = viewChild.required(WorkDialogComponent);

  protected openBranch(branch: BranchWork): void {
    this.dialog().open(branch.repo, branch.branch);
  }
}
