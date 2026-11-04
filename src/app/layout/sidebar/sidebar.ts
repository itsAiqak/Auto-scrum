import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NavigationItem } from '../../shared/models/dashboard.models';
import { StandupService } from '../../core/services/standup.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarComponent {
  private readonly standup = inject(StandupService);
  protected readonly me = this.standup.me;
  protected readonly auth = inject(AuthService);
  protected readonly navigationItems: NavigationItem[] = [
    { id: 'dashboard', icon: 'bi-grid-1x2-fill', label: 'My standup', route: '/dashboard' },
    { id: 'standup', icon: 'bi-people-fill', label: 'Team board', route: '/standup' },
    { id: 'tasks', icon: 'bi-check2-square', label: 'Tasks', route: '/tasks' },
    { id: 'settings', icon: 'bi-gear-fill', label: 'Settings', route: '/settings' }
  ];

  protected readonly today = computed(() => {
    const status = this.standup.teamStatus();
    const submitted = status.filter(s => s.submittedAt).length;
    return {
      total: status.length,
      submitted,
      pending: status.length - submitted,
      blocked: status.filter(s => s.blocked).length
    };
  });
}
