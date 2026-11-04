import { Injectable, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Member } from '../../shared/models/standup.models';
import { PUSH_API_URL } from './push-feed.service';

/**
 * Who is logged in. The API keeps the session in an httpOnly cookie (the app never sees the token),
 * so every API call sends `credentials: 'include'`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  /** The logged-in team member, null when logged out. Known once `check()` has run (main.ts, before the first page). */
  readonly member = signal<Member | null>(null);

  async check(): Promise<void> {
    try {
      const response = await fetch(`${PUSH_API_URL}/auth/me`, { credentials: 'include' });
      this.member.set(response.ok ? await response.json() : null);
    } catch {
      this.member.set(null);
    }
  }

  /** Resolves to a message to show when it fails, null when logged in. */
  logIn(email: string, password: string): Promise<string | null> {
    return this.send('login', { email, password });
  }

  /** Creates the login of the team member with this git email and logs them in. Same result as `logIn`. */
  signUp(email: string, password: string): Promise<string | null> {
    return this.send('signup', { email, password });
  }

  /** Ends the session, then reloads on the login page so nothing of this member stays in memory. */
  async logOut(): Promise<void> {
    await fetch(`${PUSH_API_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => undefined);
    location.assign('/login');
  }

  private async send(action: 'login' | 'signup', body: { email: string; password: string }): Promise<string | null> {
    let response: Response;
    try {
      response = await fetch(`${PUSH_API_URL}/auth/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch {
      return "Can't reach the Auto-Scrum API. Is it running on port 4310?";
    }
    if (response.ok) {
      this.member.set(await response.json());
      return null;
    }
    // FastAPI: a sentence when it refuses, a list of field problems when the input is invalid (422).
    const { detail } = await response.json().catch(() => ({ detail: null }));
    if (typeof detail === 'string') return detail;
    return Array.isArray(detail) && detail[0]?.msg ? detail[0].msg : `Something went wrong (${response.status}).`;
  }
}

/** Pages behind the login: logged-out visitors go to /login, and come back here afterwards. */
export const loggedInGuard: CanActivateFn = (_route, state) =>
  inject(AuthService).member() !== null || inject(Router).createUrlTree(['/login'], { queryParams: { next: state.url } });

/** The login page: someone already logged in goes to My Standup. */
export const loggedOutGuard: CanActivateFn = () => inject(AuthService).member() === null || inject(Router).createUrlTree(['/dashboard']);

/** Where to go after logging in: the `next` page, if it is a path in this app (never another site). */
export function afterLoginUrl(next: string | null): string {
  return next && /^\/(?![/\\])/.test(next) ? next : '/dashboard';
}
