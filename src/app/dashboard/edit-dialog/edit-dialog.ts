import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { PlanList, StandupService, summarizeCommit } from '../../core/services/standup.service';

const CONFIG: Record<PlanList, { title: string; hint: string; placeholder: string; accent: string }> = {
  notes: {
    title: 'Yesterday',
    hint: 'Work from git is filled in automatically. Add anything else you did.',
    placeholder: "Meeting, code review, research... (not in git)",
    accent: 'var(--violet)'
  },
  today: {
    title: 'Today',
    hint: 'What will you work on today? Pick a suggestion or type your own.',
    placeholder: 'What will you work on today?',
    accent: 'var(--primary)'
  },
  blockers: {
    title: 'Blockers',
    hint: 'Anything stopping you? Leave empty if all is clear.',
    placeholder: 'Waiting for API key, access, review...',
    accent: 'var(--teal)'
  }
};

@Component({
  selector: 'app-edit-dialog',
  templateUrl: './edit-dialog.html',
  styleUrl: './edit-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditDialogComponent {
  protected readonly standup = inject(StandupService);
  protected readonly mine = this.standup.myStandup;
  protected readonly list = signal<PlanList>('today');
  protected readonly config = computed(() => CONFIG[this.list()]);
  protected readonly summarize = summarizeCommit;

  protected readonly items = computed(() => {
    const standup = this.mine();
    const list = this.list();
    return list === 'today' ? standup.today : standup[list].map(text => ({ text, source: 'manual' as const }));
  });

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(list: PlanList): void {
    this.list.set(list);
    this.dialog().nativeElement.showModal();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  /** Looking at Yesterday or Blockers counts as reviewing it (readiness bar). */
  protected onClosed(): void {
    const list = this.list();
    if (list === 'notes') this.standup.markReviewed('yesterday');
    if (list === 'blockers') this.standup.markReviewed('blockers');
  }

  protected closeOnBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  protected add(input: HTMLInputElement): void {
    this.standup.addItem(this.list(), input.value);
    input.value = '';
    input.focus();
  }
}
