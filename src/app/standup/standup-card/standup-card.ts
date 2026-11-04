import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Standup } from '../../shared/models/standup.models';

@Component({
  selector: 'app-standup-card',
  templateUrl: './standup-card.html',
  styleUrl: './standup-card.scss',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StandupCardComponent {
  readonly standup = input.required<Standup>();

  protected readonly showCommits = signal(false);
  protected readonly commitCount = computed(() => this.standup().yesterday.reduce((total, item) => total + item.commits.length, 0));
  protected readonly planDone = computed(() => this.standup().planReview.filter(item => item.done).length);
  protected readonly isBlocked =computed(() => this.standup().blockers.length > 0);
}
