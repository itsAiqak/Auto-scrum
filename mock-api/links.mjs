/**
 * Web page of a commit, from the git remote:
 *   git@gitlab.host:group/repo.git, https://gitlab.host/group/repo.git -> https://gitlab.host/group/repo/-/commit/<sha>
 * Undefined for local paths, which have no web page.
 */
export function commitUrl(remoteUrl, sha) {
  const remote = String(remoteUrl ?? '').trim();
  const match = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)(?::\d+)?[/:](.+?)(?:\.git)?\/?$/i.exec(remote);
  if (!match || !match[1].includes('.')) return undefined;
  const [, host, path] = match;
  const web = `${/^http:/i.test(remote) ? 'http' : 'https'}://${host}/${path}`;
  if (host.endsWith('github.com') || host.includes('azure.com') || host.endsWith('visualstudio.com')) return `${web}/commit/${sha}`;
  if (host.endsWith('bitbucket.org')) return `${web}/commits/${sha}`;
  return `${web}/-/commit/${sha}`; // GitLab, including self-hosted
}
