import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { formatDate } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SidebarComponent } from '../layout/sidebar/sidebar';
import { TopbarComponent } from '../layout/topbar/topbar';
import { PlanList, StandupService, summarizeCommit } from '../core/services/standup.service';
import { ScrumSessionService } from '../core/services/scrum-session.service';
import { StandupNoteCardComponent } from './standup-note-card/standup-note-card';
import { MyWorkComponent } from './my-work/my-work';
import { EditDialogComponent } from './edit-dialog/edit-dialog';
import { ScrumDialogComponent } from './scrum-dialog/scrum-dialog';
import { LookingBackComponent } from './looking-back/looking-back';
import { standupToText } from '../shared/utils/standup-text';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  imports: [RouterLink, SidebarComponent, TopbarComponent, StandupNoteCardComponent, MyWorkComponent, EditDialogComponent, ScrumDialogComponent, LookingBackComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent {
  protected readonly standup = inject(StandupService);
  protected readonly live = inject(ScrumSessionService);
  protected readonly mine = this.standup.myStandup;

  private readonly editDialog = viewChild.required(EditDialogComponent);
  private readonly scrumDialog = viewChild.required(ScrumDialogComponent);

  protected readonly yesterday = computed(() => {
    const { yesterday, notes, planReview } = this.mine();
    const commits = yesterday.reduce((total, work) => total + work.commits.length, 0);
    const branches = `${yesterday.length} ${yesterday.length === 1 ? 'branch' : 'branches'}`;
    const planChip = planReview.length ? [`Plan ${planReview.filter(item => item.done).length}/${planReview.length} done`] : [];
    return {
      // Every commit, under its branch, then what the coder added by hand.
      groups: [
        ...yesterday.map(work => ({ title: `${work.branch} · ${work.repo}`, items: work.commits.map(commit => summarizeCommit(commit.message)) })),
        ...(notes.length ? [{ title: 'Added by you', items: notes }] : [])
      ],
      meta: `${commits} ${commits === 1 ? 'commit' : 'commits'}${commits ? ` on ${branches}` : ''}`,
      chips: [...planChip, ...new Set(yesterday.map(work => work.repo))]
    };
  });

  protected readonly today = computed(() => {
    const { today } = this.mine();
    const fromGit = today.filter(item => item.source === 'suggested').length;
    const carried = today.filter(item => item.source === 'carried').length;
    return {
      items: today.map(item => item.text),
      meta: `${today.length} ${today.length === 1 ? 'item' : 'items'}`,
      chips: [...(carried ? [`${carried} carried over`] : []), ...(fromGit ? [`${fromGit} from git`] : [])]
    };
  });

  protected readonly blockers = computed(() => {
    const { blockers, resolvedBlockers } = this.mine();
    return {
      items: blockers,
      meta: blockers.length ? `${blockers.length} ${blockers.length === 1 ? 'blocker' : 'blockers'}` : 'All clear',
      chips: resolvedBlockers.length ? [`${resolvedBlockers.length} resolved since yesterday`] : []
    };
  });

  protected readonly submittedCount = computed(() => this.standup.teamStatus().filter(s => s.submittedAt).length);

  protected readonly suggestionLabel = computed(() => {
    const count = this.standup.mySuggestions().length;
    return count ? `Use ${count} ${count === 1 ? 'suggestion' : 'suggestions'}` : '';
  });

  protected readonly copied = signal(false);

  protected async copyForChat(): Promise<void> {
    const text = standupToText(this.mine(), formatDate(this.mine().date, 'EEE, d MMM', 'en-US'));
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      window.prompt('Copy your standup:', text);
    }
  }

  protected edit(list: PlanList): void {
    this.editDialog().open(list);
  }

  protected startScrum(): void {
    this.scrumDialog().open();
  }
}
