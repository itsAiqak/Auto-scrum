import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TiltDirective } from '../../shared/directives/tilt.directive';

export type NoteAccent = 'violet' | 'blue' | 'teal' | 'tertiary' | 'red';

/** Items under a small heading, e.g. one branch's commits. No title: the items show without a heading. */
export type NoteGroup = { title: string; items: string[] };

const MAX_VISIBLE = 3;

@Component({
  selector: 'app-standup-note-card',
  templateUrl: './standup-note-card.html',
  styleUrl: './standup-note-card.scss',
  imports: [TiltDirective],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StandupNoteCardComponent {
  readonly title = input.required<string>();
  readonly accent = input.required<NoteAccent>();
  readonly meta = input('');
  readonly items = input<string[]>([]);
  /** Shown instead of `items` when given, every item (no "+N more"). */
  readonly groups = input<NoteGroup[]>([]);
  readonly emptyText = input('Nothing yet');
  readonly chips = input<string[]>([]);
  /** Bootstrap icon shown large and faint in the corner, e.g. "bi-clock-history". */
  readonly icon = input("bi-card-text");
  /** Optional one-click button shown while the card is empty (e.g. "Use 3 suggestions"). */
  readonly actionLabel = input('');

  readonly add = output<void>();
  readonly edit = output<void>();
  readonly action = output<void>();

  protected readonly count = computed(() =>
    this.groups().length ? this.groups().reduce((total, group) => total + group.items.length, 0) : this.items().length
  );
  protected readonly visibleItems = computed(() => this.items().slice(0, MAX_VISIBLE));
  protected readonly hiddenCount = computed(() => Math.max(0, this.items().length - MAX_VISIBLE));
}
