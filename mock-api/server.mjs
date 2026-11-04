// Stand-in for the Auto-Scrum backend until the real one exists.
// The Ascrum VS Code extension POSTs pushes here, and the app reads the commits back (live over server-sent events).
// Run: npm run mock-api   (port 4310, or PORT=...). Commits are kept in mock-api/commits.json (or DATA_FILE=...).
// The FastAPI backend (backend/, npm run api) replaces this with a database; keep this for quick demos without Python.
//
//   POST /api/pushes   one push from Ascrum (see ascrum/README.md), commits deduped by sha
//   GET  /api/commits  Commit[] in the app's shape (src/app/shared/models/standup.models.ts)
//   GET  /api/events   server-sent events: "commits" with new or updated Commit[] after each push
//   GET  /api/health

import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { commitUrl } from './links.mjs';

const PORT = Number(process.env.PORT ?? 4310);
const DATA_FILE = process.env.DATA_FILE ?? new URL('./commits.json', import.meta.url);

const commits = existsSync(DATA_FILE) ? JSON.parse(readFileSync(DATA_FILE, 'utf8')) : [];
const listeners = new Set();

const pad = n => String(n).padStart(2, '0');

/** ISO 8601 with offset -> local 'YYYY-MM-DDTHH:mm', the timestamp format the app uses. */
function localTime(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function receivePush(push) {
  if (typeof push?.repo !== 'string' || typeof push.branch !== 'string' || !Array.isArray(push.commits)) {
    throw new Error('Expected { repo, branch, commits: [...] }');
  }
  const known = new Set(commits.map(c => c.sha));
  const added = push.commits
    .filter(c => typeof c?.sha === 'string' && !known.has(c.sha) && !Number.isNaN(Date.parse(c.timestamp)))
    .map(c => ({
      sha: c.sha,
      authorEmail: String(c.authorEmail ?? ''),
      ...(c.authorName ? { authorName: String(c.authorName) } : {}),
      repo: push.repo,
      branch: push.branch,
      message: String(c.message ?? ''),
      timestamp: localTime(c.timestamp),
      filesChanged: Number(c.filesChanged) || 0,
      ...(commitUrl(push.remoteUrl, c.sha) ? { url: commitUrl(push.remoteUrl, c.sha) } : {})
    }));
  // Commits stored before links existed get theirs on the repo's next push.
  const linked = commits.filter(c => !c.url && c.repo === push.repo && commitUrl(push.remoteUrl, c.sha));
  for (const c of linked) c.url = commitUrl(push.remoteUrl, c.sha);
  const changed = [...linked, ...added];
  if (changed.length) {
    commits.push(...added);
    writeFileSync(DATA_FILE, JSON.stringify(commits, null, 2));
    for (const res of listeners) res.write(`event: commits\ndata: ${JSON.stringify(changed)}\n\n`);
  }
  const who = push.pusher?.name || push.pusher?.email || 'someone';
  console.log(`${localTime(new Date().toISOString()).slice(11)}  ${who} pushed ${push.commits.length} commit(s) to ${push.repo}/${push.branch} (${added.length} new)`);
  return { accepted: added.length, duplicates: push.commits.length - added.length };
}

function send(res, status, body) {
  res.writeHead(status, body === undefined ? {} : { 'Content-Type': 'application/json' });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Body too large');
  }
  return JSON.parse(body);
}

const server = createServer(async (req, res) => {
  // Dev only: the app runs on another port.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  const route = `${req.method} ${new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '')}`;
  try {
    if (req.method === 'OPTIONS') return send(res, 204);
    if (route === 'GET /api/health') return send(res, 200, { ok: true, commits: commits.length });
    if (route === 'GET /api/commits') return send(res, 200, commits);
    if (route === 'POST /api/pushes') return send(res, 200, receivePush(await readJson(req)));
    if (route === 'GET /api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      listeners.add(res);
      req.on('close', () => listeners.delete(res));
      return;
    }
    send(res, 404, { error: `No route for ${route}` });
  } catch (error) {
    send(res, 400, { error: error.message });
  }
});

// Keeps idle event streams open through proxies.
setInterval(() => listeners.forEach(res => res.write(': ping\n\n')), 30_000).unref();

server.listen(PORT, () => console.log(`Auto-Scrum mock API on http://localhost:${PORT}/api (${commits.length} commits stored)`));
