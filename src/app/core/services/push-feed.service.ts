import { Injectable, signal } from '@angular/core';
import { Commit } from '../../shared/models/standup.models';

/**
 * The FastAPI backend (../../backend/Auto-scrum-be). The Ascrum VS Code extension posts each push here.
 * Reads need a login: calls send the session cookie (`credentials: 'include'`). The Node mock API has no login, so the app no longer works with it.
 */
export const PUSH_API_URL = 'http://localhost:4310/api';

/** Commits really pushed through Ascrum, kept live. StandupService adds them to the dummy data. */
@Injectable({ providedIn: 'root' })
export class PushFeedService {
  readonly commits = signal<Commit[]>([]);
  /** False while the API is not running; the app then shows dummy data only. */
  readonly connected = signal(false);

  /** Loads the pushed commits, then listens for new ones. While the API is down it keeps trying, backing off to once a minute. */
  async connect(): Promise<void> {
    for (let delay = 5_000; !(await this.load()); delay = Math.min(delay * 2, 60_000)) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    const events = new EventSource(`${PUSH_API_URL}/events`, { withCredentials: true });
    events.addEventListener('commits', event => this.add(JSON.parse((event as MessageEvent<string>).data)));
    // EventSource reconnects by itself; reload then to catch pushes made while it was down.
    events.addEventListener('error', () => this.connected.set(false));
    events.addEventListener('open', () => {
      if (!this.connected()) void this.load();
    });
  }

  private async load(): Promise<boolean> {
    try {
      const response = await fetch(`${PUSH_API_URL}/commits`, { credentials: 'include' });
      if (!response.ok) return false;
      this.commits.set(await response.json());
      this.connected.set(true);
      return true;
    } catch {
      return false;
    }
  }

  /** New commits are added; known ones are replaced (e.g. they got a GitLab link later). */
  private add(commits: Commit[]): void {
    this.commits.update(current => {
      const incoming = new Map(commits.map(c => [c.sha, c]));
      return [...current.filter(c => !incoming.has(c.sha)), ...incoming.values()];
    });
  }
}
