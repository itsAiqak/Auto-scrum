import { Routes } from '@angular/router';
import { loggedInGuard, loggedOutGuard } from './core/services/auth.service';

export const routes: Routes = [
  { path: 'login', canActivate: [loggedOutGuard], loadComponent: () => import('./login/login').then(({ LoginComponent }) => LoginComponent) },
  {
    // Everything else needs a login.
    path: '',
    canActivate: [loggedInGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'standup', loadComponent: () => import('./standup/standup').then(({ StandupComponent }) => StandupComponent) },
      { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard').then(({ DashboardComponent }) => DashboardComponent) },
      { path: 'tasks', loadComponent: () => import('./tasks/tasks').then(({ TasksComponent }) => TasksComponent) },
      { path: 'settings', loadComponent: () => import('./settings/settings').then(({ SettingsComponent }) => SettingsComponent) }
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
