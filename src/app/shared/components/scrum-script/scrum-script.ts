import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Standup } from '../../models/standup.models';

/** The short Yesterday / Today / Blockers lines a coder reads out at the scrum. */
@Component({
  selector: 'app-scrum-script',
  templateUrl: './scrum-script.html',
  styleUrl: './scrum-script.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScrumScriptComponent {
  readonly standup = input.required<Standup>();

  /** One line per branch worked on, plus manual notes. */
  protected readonly yesterday = computed(() => [...this.standup().yesterday.map(work => work.summary), ...this.standup().notes]);
  protected readonly notFinished = computed(() => this.standup().planReview.filter(item => !item.done).map(item => item.text));
  protected readonly today = computed(() => this.standup().today.map(item => item.text));
}
