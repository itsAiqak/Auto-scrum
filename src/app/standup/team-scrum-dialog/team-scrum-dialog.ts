import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { StandupService } from '../../core/services/standup.service';
import { ScrumSessionService } from '../../core/services/scrum-session.service';
import { ScrumScriptComponent } from '../../shared/components/scrum-script/scrum-script';
import { AUTO_NEXT_GRACE_SECONDS, SPEAKING_OPTIONS, countdown, formatSeconds } from '../../shared/utils/stopwatch';

/**
 * Scrum master's view of the live team scrum: one member at a time, then a summary.
 * Each speaker's countdown only starts when that coder presses Start Scrum on their own page.
 */
@Component({
  selector: 'app-team-scrum-dialog',
  templateUrl: './team-scrum-dialog.html',
  styleUrl: './team-scrum-dialog.scss',
  imports: [DatePipe, ScrumScriptComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TeamScrumDialogComponent {
  protected readonly standup = inject(StandupService);
  protected readonly live = inject(ScrumSessionService);
  protected readonly formatSeconds = formatSeconds;
  protected readonly speakingOptions = SPEAKING_OPTIONS;

  protected readonly targetSeconds = computed(() => this.live.session()?.speakingSeconds ?? this.standup.speakingSeconds());
  protected readonly index = computed(() => this.live.session()?.index ?? 0);
  protected readonly finished = this.live.isFinished;

  /** Live standups (edits show up immediately), arranged in speaking order. */
  protected readonly speakers = computed(() => {
    const byId = new Map(this.standup.board().map(s => [s.member.id, s]));
    return (this.live.session()?.order ?? []).map(id => byId.get(id)!).filter(Boolean);
  });
  protected readonly current = computed(() => this.speakers()[this.index()]);
  protected readonly isLast = computed(() => this.index() === this.speakers().length - 1);
  protected readonly timer = computed(() => countdown(this.live.currentSeconds(), this.targetSeconds()));
  /** Seconds until auto-next moves on, or null when it will not. */
  protected readonly movingOnIn = computed(() => {
    const left = this.targetSeconds() + AUTO_NEXT_GRACE_SECONDS - this.live.currentSeconds();
    return this.standup.autoNext() && !this.live.waiting() && this.timer().state === 'over' && left > 0 ? left : null;
  });
  protected readonly onTimeCount = computed(() => this.speakers().filter(s => this.spokenBy(s.member.id) <= this.targetSeconds()).length);
  protected readonly blockers = computed(() => this.speakers().flatMap(s => s.blockers.map(text => ({ member: s.member, text }))));

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(): void {
    if (!this.live.isLive()) this.live.start(this.standup.board().map(s => s.member.id));
    this.dialog().nativeElement.showModal();
  }

  protected spokenBy(memberId: string): number {
    return this.live.spoken()[memberId] ?? 0;
  }

  protected shuffle(): void {
    const ids = [...(this.live.session()?.order ?? [])];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    this.live.start(ids);
  }

  protected onKey(event: KeyboardEvent): void {
    if (this.finished()) return;
    if (event.key === 'ArrowRight') this.live.next();
    if (event.key === 'ArrowLeft') this.live.goTo(this.index() - 1);
  }

  protected restart(): void {
    this.live.start(this.live.session()?.order ?? []);
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  /** Closing the dialog (button or Esc) ends the scrum for everyone. */
  protected onClosed(): void {
    this.live.end();
  }
}
