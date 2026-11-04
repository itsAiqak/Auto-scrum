import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService, afterLoginUrl, loggedInGuard, loggedOutGuard } from './auth.service';
import { PUSH_API_URL } from './push-feed.service';
import { MOCK_MEMBERS } from '../data/standup.mock';

describe('AuthService', () => {
  let auth: AuthService;
  const haiqal = MOCK_MEMBERS[0];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    auth = TestBed.inject(AuthService);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('knows who is logged in from the session cookie', async () => {
    const fetch = vi.fn(async () => Response.json(haiqal));
    vi.stubGlobal('fetch', fetch);
    await auth.check();
    expect(auth.member()?.id).toBe('haiqal');
    expect(fetch).toHaveBeenCalledWith(`${PUSH_API_URL}/auth/me`, { credentials: 'include' });
  });

  it('is logged out when the API says so, or is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));
    await auth.check();
    expect(auth.member()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await auth.check();
    expect(auth.member()).toBeNull();
  });

  it('logs in, and the API sets the cookie', async () => {
    const fetch = vi.fn(async () => Response.json(haiqal));
    vi.stubGlobal('fetch', fetch);
    expect(await auth.logIn('haiqal.hazhari@tmrnd.com.my', 'correct horse')).toBeNull();
    expect(auth.member()?.id).toBe('haiqal');
    expect(fetch).toHaveBeenCalledWith(`${PUSH_API_URL}/auth/login`, expect.objectContaining({ method: 'POST', credentials: 'include' }));
  });

  it("shows the API's reason when it refuses, or that it can't be reached", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ detail: "This email isn't a team member's git email." }, { status: 403 })));
    expect(await auth.signUp('stranger@example.com', 'correct horse')).toBe("This email isn't a team member's git email.");
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ detail: [{ msg: 'String should have at least 8 characters' }] }, { status: 422 })));
    expect(await auth.signUp('aina@example.com', 'short')).toBe('String should have at least 8 characters');
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await auth.logIn('aina@example.com', 'correct horse')).toContain("Can't reach the Auto-Scrum API");
    expect(auth.member()).toBeNull();
  });

  it('sends logged-out visitors to /login and back; the login page sends logged-in ones on', () => {
    const guard = (fn: typeof loggedInGuard, url: string) =>
      TestBed.runInInjectionContext(() => fn({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));
    const url = (result: unknown) => TestBed.inject(Router).serializeUrl(result as UrlTree);

    expect(url(guard(loggedInGuard, '/standup'))).toBe('/login?next=%2Fstandup');
    expect(guard(loggedOutGuard, '/login')).toBe(true);
    auth.member.set(haiqal);
    expect(guard(loggedInGuard, '/standup')).toBe(true);
    expect(url(guard(loggedOutGuard, '/login'))).toBe('/dashboard');
  });

  it('goes back only to pages of this app after logging in', () => {
    expect(afterLoginUrl('/standup?x=1')).toBe('/standup?x=1');
    expect(afterLoginUrl(null)).toBe('/dashboard');
    expect(afterLoginUrl('https://evil.example')).toBe('/dashboard');
    expect(afterLoginUrl('//evil.example')).toBe('/dashboard');
    expect(afterLoginUrl('/\\evil.example')).toBe('/dashboard');
  });
});
