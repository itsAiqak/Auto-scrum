import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SidebarComponent } from '../layout/sidebar/sidebar';
import { TopbarComponent } from '../layout/topbar/topbar';
import { StandupService } from '../core/services/standup.service';
import { StandupCardComponent } from './standup-card/standup-card';
import { TeamScrumDialogComponent } from './team-scrum-dialog/team-scrum-dialog';

@Component({
  selector: 'app-standup',
  templateUrl: './standup.html',
  styleUrl: './standup.scss',
  imports: [DatePipe, SidebarComponent, TopbarComponent, StandupCardComponent, TeamScrumDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StandupComponent {
  protected readonly standup = inject(StandupService);
  protected readonly submittedPercent = computed(() => {
    const { submitted, members } = this.standup.stats();
    return members ? Math.round((submitted / members) * 100) : 0;
  });
}
