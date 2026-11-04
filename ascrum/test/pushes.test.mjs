// Runs the push detection against real git repos: a bare "remote" plus clones that push to it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runGit, detectPushes, readRemoteRefs, splitRef, repoNameFromUrl, cleanRemoteUrl } = require('../out/pushes.js');

const context = { folderName: 'work', now: new Date('2026-10-30T02:00:00Z'), client: 'test' };
let dir, remote, me, teammate;

/** A clone with its own identity. */
async function clone(name, email) {
  const git = runGit('git', dir);
  await git(['clone', '--quiet', remote, name]);
  const repo = runGit('git', join(dir, name));
  await repo(['config', 'user.email', email]);
  await repo(['config', 'user.name', name]);
  await repo(['config', 'commit.gpgsign', 'false']);
  return { git: repo, path: join(dir, name) };
}

let fileCount = 0;
async function commit(repo, message, files = 1) {
  for (let i = 0; i < files; i++) writeFileSync(join(repo.path, `file-${++fileCount}.txt`), message);
  await repo.git(['add', '-A']);
  await repo.git(['commit', '--quiet', '-m', message]);
}

/** Snapshot, do something, then detect: what Ascrum sees after one git change. */
async function detectAfter(repo, action, reported = new Set()) {
  const snapshot = await readRemoteRefs(repo.git);
  await action();
  return (await detectPushes(repo.git, snapshot, reported, context)).events;
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ascrum-test-'));
  remote = join(dir, 'auto-scrum.git');
  await runGit('git', dir)(['init', '--quiet', '--bare', '--initial-branch=main', remote]);
  me = await clone('me', 'Haiqal@Example.com');
  teammate = await clone('teammate', 'aina@example.com');
  await me.git(['checkout', '--quiet', '-b', 'main']);
});

after(() => rmSync(dir, { recursive: true, force: true }));

test('first ever look only records where the remotes are', async () => {
  const { refs, events } = await detectPushes(me.git, undefined, new Set(), context);
  assert.deepEqual(refs, {});
  assert.deepEqual(events, []);
});

test('first push of a new repo sends every commit, oldest first', async () => {
  await commit(me, 'feat(app): first page', 2);
  await commit(me, 'feat(app): second page');
  const events = await detectAfter(me, () => me.git(['push', '--quiet', '-u', 'origin', 'main']));

  assert.equal(events.length, 1);
  const [push] = events;
  assert.equal(push.repo, 'auto-scrum');
  assert.equal(push.branch, 'main');
  assert.deepEqual(push.pusher, { name: 'me', email: 'Haiqal@Example.com' });
  assert.equal(push.pushedAt, '2026-10-30T02:00:00.000Z');
  assert.deepEqual(push.commits.map(c => [c.message, c.filesChanged]), [['feat(app): first page', 2], ['feat(app): second page', 1]]);
  assert.match(push.commits[0].sha, /^[0-9a-f]{40}$/);
  assert.equal(push.commits[0].authorEmail, 'Haiqal@Example.com');
  assert.equal(push.commits[0].authorName, 'me');
  assert.ok(!Number.isNaN(Date.parse(push.commits[0].timestamp)));
});

test('a later push sends only the new commits', async () => {
  await commit(me, 'fix(app): typo');
  const events = await detectAfter(me, () => me.git(['push', '--quiet']));
  assert.deepEqual(events.flatMap(e => e.commits.map(c => c.message)), ['fix(app): typo']);
});

test('publishing a branch sends only that branch\'s own commits', async () => {
  await me.git(['checkout', '--quiet', '-b', 'feature/push-feed']);
  await commit(me, 'feat(feed): listen for pushes');
  await commit(me, 'test(feed): cover pushes');
  const events = await detectAfter(me, () => me.git(['push', '--quiet', '-u', 'origin', 'feature/push-feed']));
  assert.equal(events.length, 1);
  assert.equal(events[0].branch, 'feature/push-feed');
  assert.deepEqual(events[0].commits.map(c => c.message), ['feat(feed): listen for pushes', 'test(feed): cover pushes']);
});

test('fetching a teammate\'s push sends nothing', async () => {
  await teammate.git(['fetch', '--quiet']);
  await teammate.git(['checkout', '--quiet', 'main']);
  await commit(teammate, 'feat(refund): refund API');
  await teammate.git(['push', '--quiet']);
  const events = await detectAfter(me, () => me.git(['fetch', '--quiet']));
  assert.deepEqual(events, []);
});

test('merge commits are left out, the merged work is not resent', async () => {
  await me.git(['checkout', '--quiet', 'main']);
  await me.git(['merge', '--quiet', '--no-edit', 'origin/main']);
  await me.git(['merge', '--quiet', '--no-ff', '--no-edit', 'feature/push-feed']);
  const events = await detectAfter(me, () => me.git(['push', '--quiet']));
  assert.deepEqual(events, []);
});

test('commits already reported (e.g. queued earlier) are skipped', async () => {
  await commit(me, 'chore: one');
  await commit(me, 'chore: two');
  const log = await me.git(['log', '-2', '--format=%H']);
  const newest = log.split('\n')[0];
  const events = await detectAfter(me, () => me.git(['push', '--quiet']), new Set([newest]));
  assert.deepEqual(events.flatMap(e => e.commits.map(c => c.message)), ['chore: one']);
});

test('a force push sends the rewritten commits', async () => {
  await me.git(['checkout', '--quiet', 'feature/push-feed']);
  await me.git(['commit', '--quiet', '--amend', '-m', 'test(feed): cover pushes and fetches']);
  const events = await detectAfter(me, () => me.git(['push', '--quiet', '--force']));
  assert.deepEqual(events.flatMap(e => e.commits.map(c => c.message)), ['test(feed): cover pushes and fetches']);
});

test('no remote change, nothing to send', async () => {
  await commit(me, 'wip: not pushed yet');
  assert.deepEqual(await detectAfter(me, async () => {}), []);
});

test('splits remote and branch, even when the remote name has a slash', () => {
  assert.deepEqual(splitRef('origin/feature/x', ['origin']), { remote: 'origin', branch: 'feature/x' });
  assert.deepEqual(splitRef('team/fork/main', ['team', 'team/fork']), { remote: 'team/fork', branch: 'main' });
});

test('repo names and safe remote URLs', () => {
  assert.equal(repoNameFromUrl('git@github.com:antrix/auto-scrum.git'), 'auto-scrum');
  assert.equal(repoNameFromUrl('https://dev.azure.com/org/proj/_git/payment-service'), 'payment-service');
  assert.equal(repoNameFromUrl('C:\\repos\\auth-service\\'), 'auth-service');
  assert.equal(cleanRemoteUrl('https://haiqal:ghp_secret@github.com/antrix/auto-scrum.git'), 'https://github.com/antrix/auto-scrum.git');
  assert.equal(cleanRemoteUrl('git@github.com:antrix/auto-scrum.git'), 'git@github.com:antrix/auto-scrum.git');
});
