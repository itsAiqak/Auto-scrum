import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { StandupService } from '../core/services/standup.service';
import { SidebarComponent } from '../layout/sidebar/sidebar';
import { TopbarComponent } from '../layout/topbar/topbar';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  imports: [SidebarComponent, TopbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsComponent {
  protected readonly standup = inject(StandupService);

  protected setTime(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) this.standup.standupTime.set(value);
  }
}
