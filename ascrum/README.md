# Ascrum

A VS Code extension that sends the commits you push to **Auto-Scrum**, so the *Yesterday* part of your standup writes itself.

## How it works

Ascrum listens to VS Code's built-in Git extension. After every git change it compares your remote-tracking branches (`origin/*`) with what it saw before. Commits that newly appear on a remote branch **and were committed by you** (`git config user.email`) are a push, whether you used the Sync button, the Source Control menu or `git push` in the terminal.

- Fetching a teammate's work sends nothing, because their commits aren't yours.
- Merge commits are skipped, and so is a squash-merge made on GitHub (GitHub is the committer).
- On a branch's first push, only that branch's own commits are sent, not everything it was based on.
- Pushes made while VS Code was closed are picked up the next time it opens. The very first time Ascrum sees a repo, it only notes where the remotes are.
- If Auto-Scrum can't be reached, the push is saved and retried every 2 minutes, after a restart, or through **Ascrum: Send Waiting Pushes Now**.

The status bar shows `Ascrum: 3 today`, or `Ascrum: 2 waiting` while pushes are queued. Click it to see today's pushes.

## Settings

| Setting | Default | |
|---|---|---|
| `ascrum.enabled` | `true` | Turn sending on or off |
| `ascrum.apiUrl` | `http://localhost:4310/api` | Pushes go to `POST <apiUrl>/pushes`. The default is the mock API in auto-scrum |
| `ascrum.appUrl` | `http://localhost:4300` | Opened by **Ascrum: Open Auto-Scrum** |
| `ascrum.ignoredRepos` | `[]` | Repo names that are never sent (personal projects) |

For an API that needs auth, run **Ascrum: Set API Token**. The token is kept in VS Code's secret storage and sent as `Authorization: Bearer <token>`.

## API contract: `POST <apiUrl>/pushes`

One request per pushed branch:

```json
{
  "pusher": { "name": "Muhammad Haiqal", "email": "haiqal@company.com" },
  "repo": "auto-scrum",
  "remoteUrl": "https://github.com/team/auto-scrum.git",
  "branch": "feature/date-picker",
  "pushedAt": "2026-10-30T02:15:00.000Z",
  "commits": [
    {
      "sha": "9b40471cbee40fec813e6f72f922a4a8717987e9",
      "authorEmail": "haiqal@company.com",
      "authorName": "Muhammad Haiqal",
      "message": "feat(board): workday date navigation",
      "timestamp": "2026-10-30T10:12:41+08:00",
      "filesChanged": 3
    }
  ],
  "client": "ascrum-vscode/0.2.0"
}
```

- `commits` are oldest first. `message` is the subject line only. `timestamp` is the author date (ISO 8601 with offset). `remoteUrl` never contains credentials.
- The same commit can arrive twice (another machine, a retry after a timeout), so **dedupe by `sha`**.
- Reply `2xx` when stored. On `5xx`, `401`, `403`, `408` or `429` Ascrum keeps the push and retries. Any other `4xx` drops it (it would never succeed).
- The backend matches `authorEmail` to `Member.gitEmails` and serves the commits to the app as `Commit` (`src/app/shared/models/standup.models.ts`, timestamp as local `YYYY-MM-DDTHH:mm`).
- It also builds each commit's web link (`Commit.url`) from `remoteUrl`, e.g. `https://gitlab.host/group/repo/-/commit/<sha>`. See `mock-api/links.mjs` for GitLab, GitHub, Bitbucket and Azure DevOps.

The FastAPI backend in `backend/` implements this, with a database. `mock-api/server.mjs` is a smaller reference in plain Node.

## Develop

```bash
cd ascrum
npm install
npm test          # compiles, then runs the push detection against real git repos
npm run package   # builds ascrum-0.2.0.vsix
```

- **Try it:** open auto-scrum in VS Code, choose the **Ascrum extension** launch config and press F5. A second VS Code window opens with Ascrum loaded. Open a git repo there and push.
- **Install for daily use:** `code --install-extension ascrum-0.2.0.vsix`, or use *Extensions → … → Install from VSIX*.
- **Log:** run **Ascrum: Show Log**.

The code lives in three files. `src/pushes.ts` has the detection logic and no `vscode` import, so it is testable in plain Node. `src/outbox.ts` holds the queue and does the sending. `src/extension.ts` connects them to VS Code.
