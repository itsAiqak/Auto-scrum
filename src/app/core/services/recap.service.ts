import { Injectable, signal } from '@angular/core';
import { DailyRecap } from '../../shared/models/recap.models';

@Injectable({ providedIn: 'root' })
export class RecapService {
  readonly recap = signal<DailyRecap>({
    dateLabel: 'Thursday, September 24, 2026',
    completedWork: [
      {
        title: 'Organized the Angular application',
        description: 'Removed legacy module scaffolding and kept the app on standalone routing.',
        project: 'auto-scrum',
        filesChanged: 4,
        completedAt: '4:40 PM'
      },
      {
        title: 'Built the dashboard foundation',
        description: 'Added the main workspace shell with dashboard, tasks, and settings routes.',
        project: 'auto-scrum',
        filesChanged: 8,
        completedAt: '2:15 PM'
      },
      {
        title: 'Reviewed the daily workflow',
        description: 'Defined the first version of yesterday recap and today planning.',
        project: 'product discovery',
        filesChanged: 1,
        completedAt: '11:20 AM'
      }
    ],
    activity: [
      { time: '4:40 PM', kind: 'commit', title: 'Cleaned up app structure', detail: 'Removed unused module files', project: 'auto-scrum' },
      { time: '3:05 PM', kind: 'file', title: 'Updated dashboard routes', detail: 'Added lazy-loaded feature pages', project: 'auto-scrum' },
      { time: '1:32 PM', kind: 'note', title: 'Captured product direction', detail: 'Defined the dummy recap experience', project: 'product discovery' },
      { time: '10:15 AM', kind: 'file', title: 'Styled task tracker', detail: 'Refined task progress cards', project: 'auto-scrum' }
    ],
    blockers: [],
    todayFocus: 'Turn the daily activity into a useful recap without manual reporting.'
  });
}
