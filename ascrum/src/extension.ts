// Ascrum: watches every repo the built-in Git extension knows about, and sends your pushes to Auto-Scrum.

import * as vscode from 'vscode';
import * as path from 'node:path';
import type { GitExtension, Repository } from './git';
import { PushEvent, RemoteRefs, detectPushes, runGit } from './pushes';
import { Outbox, postPush } from './outbox';

const REFS_KEY = 'ascrum.remoteRefs';
const REPORTED_KEY = 'ascrum.reportedShas';
const HISTORY_KEY = 'ascrum.history';
const TOKEN_SECRET = 'ascrum.apiToken';

const MAX_REPORTED = 5000;
const MAX_HISTORY = 200;
/** Git status refreshes come in bursts; wait for them to settle. */
const DEBOUNCE_MS = 1000;
const RETRY_MS = 2 * 60_000;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const log = vscode.window.createOutputChannel('Ascrum', { log: true });
  const state = context.globalState;
  const client = `ascrum-vscode/${context.extension.packageJSON.version}`;
  const settings = () => vscode.workspace.getConfiguration('ascrum');
  const apiUrl = () => settings().get<string>('apiUrl', 'http://localhost:4310/api');

  const outbox = new Outbox(state, async event => postPush(apiUrl(), await context.secrets.get(TOKEN_SECRET), event));

  const status = vscode.window.createStatusBarItem('ascrum.status', vscode.StatusBarAlignment.Left, 0);
  status.name = 'Ascrum';
  status.command = 'ascrum.showPushes';

  const todaysPushes = () => {
    const today = new Date().toDateString();
    return (state.get<PushEvent[]>(HISTORY_KEY) ?? []).filter(event => new Date(event.pushedAt).toDateString() === today);
  };

  function refreshStatus(): void {
    const waiting = outbox.pending.length;
    const commits = todaysPushes().reduce((total, event) => total + event.commits.length, 0);
    status.backgroundColor = undefined;
    if (!settings().get('enabled', true)) {
      status.text = '$(circle-slash) Ascrum';
      status.tooltip = 'Ascrum is off. Turn on "ascrum.enabled" to send your pushes to Auto-Scrum.';
    } else if (waiting) {
      status.text = `$(cloud-offline) Ascrum: ${waiting} waiting`;
      status.tooltip = `${waiting} ${waiting === 1 ? 'push is' : 'pushes are'} saved and will be sent when Auto-Scrum can be reached (${apiUrl()}).`;
      status.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      status.text = `$(cloud-upload) Ascrum${commits ? `: ${commits} today` : ''}`;
      status.tooltip = commits ? `${commits} ${commits === 1 ? 'commit' : 'commits'} pushed today and sent to Auto-Scrum` : 'Your pushes are sent to Auto-Scrum';
    }
    status.show();
  }

  // ---- Sending ----

  let warnedOffline = false;

  async function deliver(manual = false): Promise<void> {
    const { sent, dropped, error } = await outbox.flush();
    for (const event of sent) log.info(`Sent ${event.commits.length} commit(s) on ${event.repo}/${event.branch} to Auto-Scrum`);
    for (const { event, reason } of dropped) log.error(`Auto-Scrum rejected the push on ${event.repo}/${event.branch}, dropped it: ${reason}`);
    const commits = sent.reduce((total, event) => total + event.commits.length, 0);
    if (commits) vscode.window.setStatusBarMessage(`$(check) Ascrum sent ${commits} ${commits === 1 ? 'commit' : 'commits'} to Auto-Scrum`, 5000);
    refreshStatus();
    if (!error) return;
    log.warn(`Couldn't send to Auto-Scrum, will retry: ${error}`);
    // Warn once per session; after that the status bar shows the waiting count.
    if (!manual && warnedOffline) return;
    warnedOffline = true;
    const action = await vscode.window.showWarningMessage(
      `Ascrum couldn't reach Auto-Scrum. Your pushes are saved and will be sent later.`,
      'Open Settings',
      'Show Log'
    );
    if (action === 'Open Settings') void vscode.commands.executeCommand('workbench.action.openSettings', 'ascrum');
    if (action === 'Show Log') log.show();
  }

  // ---- Watching repos ----

  async function check(root: string, gitPath: string): Promise<void> {
    const snapshots = state.get<Record<string, RemoteRefs>>(REFS_KEY) ?? {};
    const reported = new Set(state.get<string[]>(REPORTED_KEY) ?? []);
    // While off, still move the snapshot along so turning it back on doesn't send old pushes.
    const before = settings().get('enabled', true) ? snapshots[root] : undefined;
    const { refs, events } = await detectPushes(runGit(gitPath, root), before, reported, { folderName: path.basename(root), now: new Date(), client });
    await state.update(REFS_KEY, { ...snapshots, [root]: refs });

    const ignored = settings().get<string[]>('ignoredRepos', []).map(name => name.toLowerCase());
    const wanted = events.filter(event => !ignored.includes(event.repo.toLowerCase()));
    if (!wanted.length) return;

    for (const event of wanted) log.info(`Push detected: ${event.commits.length} commit(s) on ${event.repo}/${event.branch}`);
    await state.update(REPORTED_KEY, [...reported, ...wanted.flatMap(event => event.commits.map(c => c.sha))].slice(-MAX_REPORTED));
    await state.update(HISTORY_KEY, [...(state.get<PushEvent[]>(HISTORY_KEY) ?? []), ...wanted].slice(-MAX_HISTORY));
    await outbox.add(wanted);
    void deliver();
  }

  // One check at a time across all repos: they share the same globalState entries.
  let checks = Promise.resolve();
  const queueCheck = (root: string, gitPath: string) => {
    checks = checks.then(() => check(root, gitPath).catch(error => log.error(`${root}: ${error instanceof Error ? error.message : error}`)));
  };

  const watched = new Map<string, vscode.Disposable>();
  const gitApi = await getGitApi();
  if (gitApi) {
    const watch = (repo: Repository) => {
      const root = repo.rootUri.fsPath;
      if (watched.has(root)) return;
      let timer: NodeJS.Timeout | undefined;
      const subscription = repo.state.onDidChange(() => {
        clearTimeout(timer);
        timer = setTimeout(() => queueCheck(root, gitApi.git.path), DEBOUNCE_MS);
      });
      watched.set(root, {
        dispose: () => {
          clearTimeout(timer);
          subscription.dispose();
        }
      });
      log.info(`Watching ${root}`);
      // Also catches pushes made while VS Code was closed.
      queueCheck(root, gitApi.git.path);
    };
    gitApi.repositories.forEach(watch);
    context.subscriptions.push(
      gitApi.onDidOpenRepository(watch),
      gitApi.onDidCloseRepository(repo => {
        watched.get(repo.rootUri.fsPath)?.dispose();
        watched.delete(repo.rootUri.fsPath);
      })
    );
  } else {
    log.warn('The built-in Git extension is turned off (git.enabled), so Ascrum cannot see your pushes.');
  }

  // ---- Commands ----

  async function showPushes(): Promise<void> {
    type Item = vscode.QuickPickItem & { run?: () => unknown };
    const waiting = new Set(outbox.pending.flatMap(event => event.commits.map(c => c.sha)));
    const items: Item[] = [{ label: '$(link-external) Open Auto-Scrum', run: openAutoScrum }];
    if (waiting.size) items.push({ label: `$(sync) Send ${outbox.pending.length} waiting now`, run: () => deliver(true) });
    items.push({ label: 'Pushed today', kind: vscode.QuickPickItemKind.Separator });
    for (const event of todaysPushes().reverse()) {
      const time = new Date(event.pushedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      for (const commit of [...event.commits].reverse()) {
        items.push({
          label: `$(git-commit) ${commit.message}`,
          description: `${event.repo} · ${event.branch}`,
          detail: `Pushed ${time} · ${waiting.has(commit.sha) ? 'waiting to send' : 'sent to Auto-Scrum'}`
        });
      }
    }
    if (items.at(-1)?.kind === vscode.QuickPickItemKind.Separator) items.push({ label: 'Nothing pushed today yet' });
    const pick = await vscode.window.showQuickPick(items, { title: 'Ascrum', placeHolder: 'Your pushes today', matchOnDescription: true });
    await pick?.run?.();
  }

  async function openAutoScrum(): Promise<void> {
    const appUrl = settings().get<string>('appUrl', 'http://localhost:4300').replace(/\/+$/, '');
    await vscode.env.openExternal(vscode.Uri.parse(`${appUrl}/dashboard`));
  }

  async function setToken(): Promise<void> {
    const token = await vscode.window.showInputBox({
      title: 'Ascrum: API token',
      prompt: 'Sent as "Authorization: Bearer <token>". Leave empty to remove it.',
      password: true,
      ignoreFocusOut: true
    });
    if (token === undefined) return;
    if (token.trim()) await context.secrets.store(TOKEN_SECRET, token.trim());
    else await context.secrets.delete(TOKEN_SECRET);
    if (outbox.pending.length) await deliver(true);
  }

  // Retries waiting pushes, and keeps the "today" count right after midnight.
  const retryTimer = setInterval(() => (outbox.pending.length ? void deliver() : refreshStatus()), RETRY_MS);

  context.subscriptions.push(
    log,
    status,
    {
      dispose: () => {
        clearInterval(retryTimer);
        watched.forEach(watcher => watcher.dispose());
      }
    },
    vscode.commands.registerCommand('ascrum.showPushes', showPushes),
    vscode.commands.registerCommand('ascrum.sendNow', () => deliver(true)),
    vscode.commands.registerCommand('ascrum.openAutoScrum', openAutoScrum),
    vscode.commands.registerCommand('ascrum.setToken', setToken),
    vscode.commands.registerCommand('ascrum.showLog', () => log.show()),
    vscode.workspace.onDidChangeConfiguration(change => {
      if (change.affectsConfiguration('ascrum.apiUrl') && outbox.pending.length) void deliver();
      else if (change.affectsConfiguration('ascrum')) refreshStatus();
    })
  );

  refreshStatus();
  if (outbox.pending.length) void deliver();
}

export function deactivate(): void {}

async function getGitApi() {
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
  const git = extension && (extension.isActive ? extension.exports : await extension.activate());
  return git?.enabled ? git.getAPI(1) : undefined;
}
