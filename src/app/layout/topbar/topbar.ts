import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { StandupService } from '../../core/services/standup.service';
import { StandupReminderService } from '../../core/services/standup-reminder.service';

@Component({
  selector: 'app-topbar',
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
  imports: [DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TopbarComponent {
  /** Text after the date under the greeting. */
  readonly subtitle = input("Here's your standup for today");

  protected readonly me = inject(StandupService).me;
  protected readonly reminder = inject(StandupReminderService);
  protected readonly today = new Date();
  protected readonly greeting = greetingFor(this.today.getHours());
}

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
