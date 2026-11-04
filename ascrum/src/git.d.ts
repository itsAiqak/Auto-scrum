// The parts of the built-in Git extension's API that Ascrum uses.
// Full version: https://github.com/microsoft/vscode/blob/main/extensions/git/src/api/git.d.ts

import type { Event, Uri } from 'vscode';

export interface GitExtension {
  readonly enabled: boolean;
  readonly onDidChangeEnablement: Event<boolean>;
  getAPI(version: 1): API;
}

export interface API {
  readonly git: { readonly path: string };
  readonly repositories: Repository[];
  readonly onDidOpenRepository: Event<Repository>;
  readonly onDidCloseRepository: Event<Repository>;
}

export interface Repository {
  readonly rootUri: Uri;
  readonly state: RepositoryState;
}

export interface RepositoryState {
  /** Fires after every git status refresh, including when refs under .git/refs/remotes change. */
  readonly onDidChange: Event<void>;
}
