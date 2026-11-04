# Auto-scrum
an apps about daily scrum

Each coder's daily standup, filled in automatically: **Yesterday** comes from their git pushes, **Today** is their plan (with git-based suggestions), and **Blockers** are typed in. At the scrum they read it out instead of remembering it.

## What's in here

| Folder | What |
|---|---|
| `src/` | The Angular 21 app: My Standup, Team board, Start Scrum, login |
| `ascrum/` | **Ascrum**, a VS Code extension that sends your pushes to Auto-scrum ([ascrum/README.md](ascrum/README.md)) |
| `scripts/sample-pushes.mjs` | Sends demo pushes for the last 3 workdays to the API |
| `mock-api/` | Old no-login Node stand-in for the API (the app now needs the real backend) |

The backend is a separate FastAPI project (`Auto-scrum-be`): login, pushes, commits, live events, members and plans.

## Run it

1. Start the backend on port 4310 (in the `Auto-scrum-be` folder): `uv run uvicorn app.main:app --port 4310 --reload`
2. Start the app: `npm install`, then `npm start`, and open `http://localhost:4200/`
3. Sign up with one of your team member git emails, then log in

Other commands: `npx ng build`, `npx ng test --watch=false`, `npm run sample-pushes`. Ascrum: `cd ascrum && npm test`, `npm run package` (.vsix).

More detail for contributors and AI agents in [AGENTS.md](AGENTS.md).
