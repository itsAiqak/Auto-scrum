// Spots pushes by comparing the remote-tracking branches (refs/remotes/*) before and after a git change.
// A commit that newly shows up on a remote branch and was committed by you has been pushed by you,
// whether that was the Sync button, the Source Control menu or `git push` in a terminal.
// No `vscode` import here, so the tests run this against real git repos in plain Node.

import { execFile } from 'node:child_process';

/** Runs git in one repository and resolves with stdout. `input` is written to stdin. */
export type RunGit = (args: string[], input?: string) => Promise<string>;

/** Remote-tracking branches: 'origin/feature/x' -> commit sha. */
export type RemoteRefs = Record<string, string>;

/** One pushed commit. Auto-Scrum turns it into its `Commit` (src/app/shared/models/standup.models.ts). */
export type PushedCommit = {
  sha: string;
  authorEmail: string;
  authorName: string;
  /** Subject line only. */
  message: string;
  /** Author date, ISO 8601 with offset. */
  timestamp: string;
  filesChanged: number;
};

/** One push to one branch: the body of `POST <apiUrl>/pushes`. */
export type PushEvent = {
  pusher: { name: string; email: string };
  repo: string;
  /** Without credentials. */
  remoteUrl: string;
  branch: string;
  /** When Ascrum noticed the push, ISO 8601. */
  pushedAt: string;
  /** Oldest first. */
  commits: PushedCommit[];
  client: string;
};

type LoggedCommit = PushedCommit & { committerEmail: string };

/** Commits that arrived on one remote branch. */
export type RefChange = { ref: string; commits: LoggedCommit[] };

/** Safety cap so a first push of a big repo doesn't send its whole history. */
const MAX_COMMITS_PER_BRANCH = 100;

export function runGit(gitPath: string, cwd: string): RunGit {
  return (args, input) =>
    new Promise((resolve, reject) => {
      const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
      const child = execFile(gitPath, args, { cwd, env, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (error, stdout) =>
        error ? reject(error) : resolve(stdout)
      );
      child.stdin?.end(input ?? '');
    });
}

export async function readRemoteRefs(git: RunGit): Promise<RemoteRefs> {
  const out = await git(['for-each-ref', '--format=%(objectname) %(refname) %(symref)', 'refs/remotes']);
  const refs: RemoteRefs = {};
  for (const line of out.split('\n')) {
    const [sha, name, symref] = line.trim().split(' ');
    // Skips blank lines and symbolic refs such as origin/HEAD.
    if (sha && name && !symref) refs[name.replace(/^refs\/remotes\//, '')] = sha;
  }
  return refs;
}

/** Commits that reached a remote branch between two snapshots. Each commit is counted once, on the first branch it shows up on. */
export async function findNewCommits(git: RunGit, before: RemoteRefs, after: RemoteRefs): Promise<RefChange[]> {
  const changed = Object.keys(after)
    .filter(ref => before[ref] !== after[ref])
    .sort();
  if (!changed.length) return [];

  // Whatever a remote already had is old news. Old tips can be gone after a force push and gc, so keep only those that still exist.
  const known = new Set(await existingObjects(git, Object.values(before)));
  const changes: RefChange[] = [];
  for (const ref of changed) {
    const commits = await logNewCommits(git, after[ref], [...known]);
    known.add(after[ref]);
    if (commits.length) changes.push({ ref, commits });
  }
  return changes;
}

/** Everything one git change means for Auto-Scrum. With no `before` snapshot it only records where the remotes are. */
export async function detectPushes(
  git: RunGit,
  before: RemoteRefs | undefined,
  reported: ReadonlySet<string>,
  context: { folderName: string; now: Date; client: string }
): Promise<{ refs: RemoteRefs; events: PushEvent[] }> {
  const refs = await readRemoteRefs(git);
  if (!before) return { refs, events: [] };
  const changes = await findNewCommits(git, before, refs);
  if (!changes.length) return { refs, events: [] };

  const [email, name, remotes] = await Promise.all([gitConfig(git, 'user.email'), gitConfig(git, 'user.name'), readRemotes(git)]);
  if (!email) throw new Error(`git user.email is not set in ${context.folderName}, so Ascrum can't tell which pushes are yours`);

  const events: PushEvent[] = [];
  for (const change of changes) {
    // Committer, not author: a squash-merge on GitHub keeps you as author but GitHub as committer, and you didn't push that.
    const mine = change.commits.filter(c => c.committerEmail.toLowerCase() === email.toLowerCase() && !reported.has(c.sha));
    if (!mine.length) continue;
    const { remote, branch } = splitRef(change.ref, Object.keys(remotes));
    const url = remotes[remote] ?? '';
    events.push({
      pusher: { name, email },
      repo: repoNameFromUrl(url) ?? context.folderName,
      remoteUrl: cleanRemoteUrl(url),
      branch,
      pushedAt: context.now.toISOString(),
      commits: mine.reverse().map(({ committerEmail, ...commit }) => commit),
      client: context.client
    });
  }
  return { refs, events };
}

/** Parses `git log --format=%x1e%H%x1f%ae%x1f%an%x1f%ce%x1f%aI%x1f%s --shortstat`. */
export function parseLog(out: string): LoggedCommit[] {
  return out
    .split('\x1e')
    .filter(record => record.trim())
    .map(record => {
      const [header, ...stat] = record.split('\n');
      const [sha, authorEmail, authorName, committerEmail, timestamp, message] = header.split('\x1f');
      const files = /(\d+) files? changed/.exec(stat.join('\n'));
      return { sha, authorEmail, authorName, committerEmail, timestamp, message: message.trim(), filesChanged: files ? Number(files[1]) : 0 };
    });
}

/** 'origin/feature/x' -> origin + feature/x. Remote names may contain '/', so the longest known remote wins. */
export function splitRef(ref: string, remotes: string[]): { remote: string; branch: string } {
  const remote = remotes.filter(name => ref.startsWith(`${name}/`)).sort((a, b) => b.length - a.length)[0] ?? ref.split('/')[0];
  return { remote, branch: ref.slice(remote.length + 1) };
}

/** 'git@github.com:team/auto-scrum.git' -> 'auto-scrum'. */
export function repoNameFromUrl(url: string): string | undefined {
  const name = url.trim().replace(/[/\\]+$/, '').replace(/\.git$/, '').split(/[/\\:]/).pop();
  return name || undefined;
}

/** Drops 'user:token@' from https remotes so credentials never leave the machine. */
export function cleanRemoteUrl(url: string): string {
  return url.trim().replace(/\/\/[^/@]+@/, '//');
}

async function logNewCommits(git: RunGit, tip: string, exclude: string[]): Promise<LoggedCommit[]> {
  // Revisions go through stdin: a repo with many branches would overflow the Windows command line.
  const revisions = [tip, ...exclude.map(sha => `^${sha}`)].join('\n') + '\n';
  const format = '--format=%x1e%H%x1f%ae%x1f%an%x1f%ce%x1f%aI%x1f%s';
  return parseLog(await git(['log', '--no-merges', `--max-count=${MAX_COMMITS_PER_BRANCH}`, format, '--shortstat', '--stdin'], revisions));
}

async function existingObjects(git: RunGit, shas: string[]): Promise<string[]> {
  if (!shas.length) return [];
  // Prints the sha for objects that exist and '<sha> missing' for the rest.
  const out = await git(['cat-file', '--batch-check=%(objectname)'], shas.join('\n') + '\n');
  return out.split('\n').map(line => line.trim()).filter(line => /^[0-9a-f]{40,64}$/.test(line));
}

async function gitConfig(git: RunGit, key: string): Promise<string> {
  // Exits with 1 when the key isn't set.
  return git(['config', '--get', key]).then(value => value.trim(), () => '');
}

/** Remote name -> fetch URL. */
async function readRemotes(git: RunGit): Promise<Record<string, string>> {
  const remotes: Record<string, string> = {};
  // 'origin<TAB>https://host/repo.git (fetch)'. Local paths can contain spaces, so match rather than split.
  for (const line of (await git(['remote', '-v'])).split('\n')) {
    const match = /^(\S+)\t(.+) \(fetch\)$/.exec(line.trim());
    if (match) remotes[match[1]] = match[2];
  }
  return remotes;
}
