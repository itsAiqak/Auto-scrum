import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SidebarComponent } from '../layout/sidebar/sidebar';
import { TopbarComponent } from '../layout/topbar/topbar';

@Component({
  selector: 'app-tasks',
  templateUrl: './tasks.html',
  styleUrl: './tasks.scss',
  imports: [SidebarComponent, TopbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TasksComponent {}
