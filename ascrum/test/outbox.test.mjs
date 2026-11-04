import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Outbox, postPush } = require('../out/outbox.js');

/** In-memory stand-in for vscode.Memento. */
function memoryStore() {
  const data = new Map();
  return { get: key => data.get(key), update: async (key, value) => void data.set(key, value) };
}

const push = branch => ({ branch, repo: 'auto-scrum', commits: [] });

test('sends oldest first and empties the queue', async () => {
  const posted = [];
  const outbox = new Outbox(memoryStore(), async event => (posted.push(event.branch), { ok: true }));
  await outbox.add([push('a'), push('b')]);
  const delivery = await outbox.flush();
  assert.deepEqual(posted, ['a', 'b']);
  assert.equal(delivery.sent.length, 2);
  assert.deepEqual(outbox.pending, []);
});

test('keeps the queue when the API is down, and sends it later', async () => {
  let up = false;
  const outbox = new Outbox(memoryStore(), async () => (up ? { ok: true } : { ok: false, retry: true, reason: 'down' }));
  await outbox.add([push('a'), push('b')]);
  assert.equal((await outbox.flush()).error, 'down');
  assert.equal(outbox.pending.length, 2);
  up = true;
  assert.equal((await outbox.flush()).sent.length, 2);
  assert.equal(outbox.pending.length, 0);
});

test('drops a push the API rejects for good, then carries on', async () => {
  const outbox = new Outbox(memoryStore(), async event => (event.branch === 'bad' ? { ok: false, retry: false, reason: '400' } : { ok: true }));
  await outbox.add([push('bad'), push('good')]);
  const delivery = await outbox.flush();
  assert.deepEqual(delivery.dropped.map(d => d.event.branch), ['bad']);
  assert.deepEqual(delivery.sent.map(e => e.branch), ['good']);
});

test('pushes added during a flush are sent too', async () => {
  let outbox;
  const posted = [];
  outbox = new Outbox(memoryStore(), async event => {
    posted.push(event.branch);
    if (event.branch === 'a') await outbox.add([push('c')]);
    return { ok: true };
  });
  await outbox.add([push('a'), push('b')]);
  await outbox.flush();
  assert.deepEqual(posted, ['a', 'b', 'c']);
});

test('postPush: posts JSON with the token, and tells retryable failures apart', async () => {
  const received = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
    res.statusCode = { a: 200, b: 400, c: 503 }[JSON.parse(body).branch];
    res.end();
  });
  await new Promise(resolve => server.listen(0, resolve));
  const api = `http://127.0.0.1:${server.address().port}/api/`;
  try {
    assert.deepEqual(await postPush(api, 'secret', push('a')), { ok: true });
    assert.deepEqual(received[0], { url: '/api/pushes', auth: 'Bearer secret', body: push('a') });
    assert.equal((await postPush(api, undefined, push('b'))).retry, false);
    assert.equal((await postPush(api, undefined, push('c'))).retry, true);
  } finally {
    server.close();
  }
  const offline = await postPush(api, undefined, push('a'));
  assert.equal(offline.retry, true);
  // ECONNREFUSED, or ECONNRESET when a kept-alive socket to the closed server is reused.
  assert.match(offline.reason, /can't reach .* \(E[A-Z]+\)$/);
});
