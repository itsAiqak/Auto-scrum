import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { StandupService } from '../../core/services/standup.service';
import { Commit } from '../../shared/models/standup.models';
import { daysAgo, relativeDay } from '../../shared/utils/workday';

/** One My Work branch in detail: its commits on a timeline, with date and time, message, author and a link to GitLab. Updates live. */
@Component({
  selector: 'app-work-dialog',
  templateUrl: './work-dialog.html',
  styleUrl: './work-dialog.scss',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkDialogComponent {
  protected readonly standup = inject(StandupService);

  private readonly selected = signal<{ repo: string; branch: string } | null>(null);
  protected readonly branch = computed(() => {
    const open = this.selected();
    return open ? (this.standup.myBranches().find(b => b.repo === open.repo && b.branch === open.branch) ?? null) : null;
  });
  protected readonly pushed = computed(() => (this.branch() ? `Pushed ${relativeDay(this.branch()!.lastPush)}` : ''));
  protected readonly pushedToday = computed(() => !!this.branch() && daysAgo(this.branch()!.lastPush) === 0);

  /** Commits grouped by day, newest first. */
  protected readonly days = computed(() => {
    const days = new Map<string, Commit[]>();
    for (const commit of this.branch()?.commits ?? []) {
      const date = commit.timestamp.slice(0, 10);
      days.set(date, [...(days.get(date) ?? []), commit]);
    }
    return [...days].map(([date, commits]) => ({ date, commits }));
  });

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(repo: string, branch: string): void {
    this.selected.set({ repo, branch });
    this.dialog().nativeElement.showModal();
  }

  /** 'GitLab' / 'GitHub' for the link label, from the commit URL. */
  protected hostName(url: string): string {
    return url.includes('github') ? 'GitHub' : url.includes('bitbucket') ? 'Bitbucket' : url.includes('azure') ? 'Azure DevOps' : 'GitLab';
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected closeOnBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
