// Sends sample pushes "from you" (your git config identity) for the last 3 workdays to the Auto-Scrum API,
// so the portal has something to show: Yesterday on My Standup, branch cards and the timeline in My Work.
//
// Run:  npm run sample-pushes        (the API must be running: FastAPI or `npm run mock-api`)
// Env:  API_URL (default http://localhost:4310/api), API_TOKEN if the API needs one, GIT_EMAIL to push as someone else.
// Safe to run again: commit ids come from the date and message, and the API skips commits it already has.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const API_URL = (process.env.API_URL ?? 'http://localhost:4310/api').replace(/\/+$/, '');
const INTT_PORTAL = 'https://gitlab.tmrnd.com.my/intt/intt-portal.git';

/** [workdays ago, repo, git remote, branch, commits: [time, message, files changed]]. Today's times are minutes before now. */
const SAMPLE = [
  [2, 'intt-portal', INTT_PORTAL, 'development', [
    ['09:40', 'feat(dashboard): add order status summary cards', 4],
    ['11:15', 'feat(dashboard): filter orders by region', 3],
    ['16:50', 'fix(dashboard): chart legend overlaps on small screens', 1]
  ]],
  [1, 'intt-portal', INTT_PORTAL, 'feature/user-management', [
    ['10:05', 'feat(users): user list with search and paging', 5],
    ['14:30', 'feat(users): role assignment dialog', 3],
    ['17:20', 'test(users): cover role assignment', 2]
  ]],
  [1, 'intt-portal', INTT_PORTAL, 'preprod', [
    ['15:45', 'fix(build): update preprod environment variables', 1]
  ]],
  [0, 'intt-portal', INTT_PORTAL, 'feature/user-management', [
    [-95, 'fix(users): keep filters when going back to the list', 2],
    [-40, 'refactor(users): move API calls into UserService', 4]
  ]],
  [0, 'auto-scrum', '', 'feature/sample-data', [
    [-15, 'chore: sample pushes for the portal demo', 1]
  ]]
];

const gitConfig = key => {
  try {
    return execFileSync('git', ['config', '--global', key], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};
const email = process.env.GIT_EMAIL ?? gitConfig('user.email');
const name = gitConfig('user.name') || email;
if (!email) {
  console.error('No git user.email found. Set it (git config --global user.email you@company.com) or pass GIT_EMAIL=...');
  process.exit(1);
}

/** Midnight, `count` workdays before today (weekends skipped, like the app's "yesterday"). */
function workdaysAgo(count) {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  while (count > 0) {
    day.setDate(day.getDate() - 1);
    if (day.getDay() !== 0 && day.getDay() !== 6) count--;
  }
  return day;
}

/** 'HH:mm' on that day, or minutes before now for today's commits. */
function commitTime(day, time) {
  if (typeof time === 'number') return new Date(Date.now() + time * 60_000);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
}

const sha = (...parts) => createHash('sha1').update(['auto-scrum-sample', email, ...parts].join('|')).digest('hex');
const headers = { 'Content-Type': 'application/json', ...(process.env.API_TOKEN ? { Authorization: `Bearer ${process.env.API_TOKEN}` } : {}) };

let failed = false;
for (const [ago, repo, remoteUrl, branch, commits] of SAMPLE) {
  const day = workdaysAgo(ago);
  const pushed = commits.map(([time, message, filesChanged]) => {
    const at = commitTime(day, time);
    return { sha: sha(at.toDateString(), repo, branch, message), authorEmail: email, authorName: name, message, timestamp: at.toISOString(), filesChanged };
  });
  const body = { pusher: { name, email }, repo, remoteUrl, branch, pushedAt: pushed.at(-1).timestamp, commits: pushed, client: 'sample-pushes' };
  const label = `${day.toDateString().slice(0, 10)}  ${repo}/${branch}`.padEnd(50);
  try {
    const response = await fetch(`${API_URL}/pushes`, { method: 'POST', headers, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${response.status} ${result.detail ?? response.statusText}`);
    console.log(`${label} ${result.accepted} new, ${result.duplicates} already there`);
  } catch (error) {
    failed = true;
    console.error(`${label} failed: ${error.cause?.code ?? error.message}`);
  }
}
if (failed) {
  console.error(`\nCouldn't send everything to ${API_URL}. Is the API running? (401 = set API_TOKEN)`);
  process.exit(1);
}
console.log(`\nDone: pushes from ${name} <${email}>. Open the portal's My Standup page.`);
