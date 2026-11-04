import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { BranchWork, Commit } from '../../shared/models/standup.models';
import { isWorkday, toIsoDate } from '../../shared/utils/workday';

const DAYS = 14;

/** Swimlanes: one row per branch, one column per day, a dot on each day with pushes. Shows what was worked on, and when. */
@Component({
  selector: 'app-push-timeline',
  templateUrl: './push-timeline.html',
  styleUrl: './push-timeline.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PushTimelineComponent {
  readonly branches = input.required<BranchWork[]>();
  readonly open = output<BranchWork>();

  protected readonly days = computed(() => {
    const now = new Date();
    return Array.from({ length: DAYS }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DAYS - 1 - i));
      const iso = toIsoDate(date);
      const label = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      return { iso, label, weekday: label.charAt(0), day: date.getDate(), weekend: !isWorkday(iso), today: i === DAYS - 1 };
    });
  });

  /** Branches with pushes in the window. `first`/`last` are the day indexes the lane line runs between. */
  protected readonly rows = computed(() => {
    const days = this.days();
    return this.branches()
      .map(branch => {
        const cells = days.map(day => branch.commits.filter(c => c.timestamp.startsWith(day.iso)));
        const active = cells.flatMap((commits, i) => (commits.length ? [i] : []));
        return { branch, cells, first: active[0] ?? -1, last: active.at(-1) ?? -1 };
      })
      .filter(row => row.first >= 0);
  });

  protected describe(branch: BranchWork, dayIndex: number, commits: Commit[]): string {
    const lines = commits.map(c => `${c.timestamp.slice(11)}  ${c.message}`);
    return `${branch.branch} · ${this.days()[dayIndex].label} · ${commits.length} ${commits.length === 1 ? 'commit' : 'commits'}\n${lines.join('\n')}`;
  }
}
