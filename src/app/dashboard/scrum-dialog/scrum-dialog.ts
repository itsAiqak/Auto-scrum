import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { StandupService } from '../../core/services/standup.service';
import { ScrumSessionService } from '../../core/services/scrum-session.service';
import { ScrumScriptComponent } from '../../shared/components/scrum-script/scrum-script';
import { Stopwatch, countdown } from '../../shared/utils/stopwatch';

/**
 * The coder's own reading view. When the team scrum is live and it's their turn, opening it starts
 * their shared countdown (the scrum master sees it too); otherwise it's a private practice run.
 */
@Component({
  selector: 'app-scrum-dialog',
  templateUrl: './scrum-dialog.html',
  styleUrl: './scrum-dialog.scss',
  imports: [DatePipe, ScrumScriptComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScrumDialogComponent {
  protected readonly standup = inject(StandupService);
  protected readonly live = inject(ScrumSessionService);
  protected readonly mine = this.standup.myStandup;
  protected readonly stopwatch = new Stopwatch();
  /** true while speaking in the live team scrum. */
  protected readonly liveTurn = signal(false);

  protected readonly targetSeconds = computed(() => (this.liveTurn() ? this.live.session()?.speakingSeconds : undefined) ?? this.standup.speakingSeconds());
  protected readonly timer = computed(() => countdown(this.liveTurn() ? this.live.currentSeconds() : this.stopwatch.seconds(), this.targetSeconds()));

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopwatch.stop());
    // The scrum moved on (auto-next, scrum master pressed Next, or it ended): my turn is over.
    effect(() => {
      if (this.liveTurn() && !this.live.isMyTurn()) this.close();
    });
  }

  open(): void {
    const myTurn = this.live.isMyTurn();
    this.liveTurn.set(myTurn);
    if (myTurn) {
      this.live.speakerStart(this.standup.me.id);
    } else {
      this.stopwatch.reset();
      this.stopwatch.start();
    }
    this.dialog().nativeElement.showModal();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected onClosed(): void {
    this.stopwatch.stop();
    this.liveTurn.set(false);
  }

  /** Practice: close. Live: hand over to the next speaker. Either way today's standup counts as done (there is no separate Submit for now). */
  protected finish(): void {
    if (!this.mine().submittedAt) this.standup.submit();
    if (this.liveTurn() && this.live.isMyTurn()) this.live.next();
    this.close();
  }
}
