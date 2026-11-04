// Pushes wait here until Auto-Scrum accepts them, so nothing is lost while offline or while the API is down.
// Kept in VS Code's globalState, which survives restarts.

import type { PushEvent } from './pushes';

/** The part of vscode.Memento the outbox needs. */
export type Store = {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
};

export type PostResult = { ok: true } | { ok: false; retry: boolean; reason: string };

export type Delivery = {
  sent: PushEvent[];
  /** Rejected by the API for good (bad request), so dropped instead of retried forever. */
  dropped: { event: PushEvent; reason: string }[];
  /** Why sending stopped early; the rest stays queued. */
  error?: string;
};

const KEY = 'ascrum.outbox';

export class Outbox {
  private flushing?: Promise<Delivery>;

  constructor(
    private readonly store: Store,
    private readonly post: (event: PushEvent) => Promise<PostResult>
  ) {}

  get pending(): PushEvent[] {
    return this.store.get<PushEvent[]>(KEY) ?? [];
  }

  async add(events: PushEvent[]): Promise<void> {
    await this.store.update(KEY, [...this.pending, ...events]);
  }

  /** Sends the queue oldest first and stops at the first failure that is worth retrying. One flush runs at a time. */
  flush(): Promise<Delivery> {
    this.flushing ??= this.drain().finally(() => (this.flushing = undefined));
    return this.flushing;
  }

  private async drain(): Promise<Delivery> {
    const delivery: Delivery = { sent: [], dropped: [] };
    let event: PushEvent | undefined;
    while ((event = this.pending[0])) {
      const result = await this.post(event);
      if (!result.ok && result.retry) return { ...delivery, error: result.reason };
      if (result.ok) delivery.sent.push(event);
      else delivery.dropped.push({ event, reason: result.reason });
      // add() only appends, so the head is still this event.
      await this.store.update(KEY, this.pending.slice(1));
    }
    return delivery;
  }
}

export async function postPush(apiUrl: string, token: string | undefined, event: PushEvent): Promise<PostResult> {
  const url = `${apiUrl.replace(/\/+$/, '')}/pushes`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(10_000)
    });
    if (response.ok) return { ok: true };
    const reason = `${url} answered ${response.status} ${response.statusText}`.trim();
    // Server trouble, rate limits and auth (until the token is fixed) are worth retrying; other 4xx never will be.
    const retry = response.status >= 500 || [401, 403, 408, 429].includes(response.status);
    return { ok: false, retry, reason };
  } catch (error) {
    // fetch throws 'fetch failed'; the useful part is the cause, e.g. ECONNREFUSED (whose message is often empty).
    const cause = error instanceof Error ? (error.cause as (Error & { code?: string }) | undefined) : undefined;
    const detail = cause?.code || cause?.message || (error instanceof Error ? error.message : String(error));
    return { ok: false, retry: true, reason: `can't reach ${url} (${detail})` };
  }
}
