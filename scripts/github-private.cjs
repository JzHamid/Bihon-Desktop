// Uses Git's configured credential helper. Credentials remain in memory and are never logged.
const { spawnSync } = require('node:child_process');
async function main() {
  const credential = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', timeout: 15000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }, windowsHide: true,
  });
  const values = Object.fromEntries((credential.stdout || '').trim().split('\n').map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
  if (!values.password) throw new Error('Git has no available GitHub credential. Authenticate GitHub CLI or Git Credential Manager to create/push the private repository.');
  const headers = { Authorization: `Bearer ${values.password}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const accountResponse = await fetch('https://api.github.com/user', { headers });
  if (!accountResponse.ok) throw new Error(`GitHub rejected the available Git credential (${accountResponse.status}). The connected GitHub app is separate from Git authentication.`);
  const account = await accountResponse.json();
  if (account.login !== 'JzHamid') throw new Error(`Git is authenticated as ${account.login}, not JzHamid; refusing repository creation.`);
  const url = 'https://api.github.com/repos/JzHamid/Bihon-Desktop';
  let response = await fetch(url, { headers });
  if (response.status === 404) response = await fetch('https://api.github.com/user/repos', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Bihon-Desktop', private: true, description: 'Bihon — local Windows manga reader powered by Suwayomi', auto_init: false }) });
  if (!response.ok) throw new Error(`GitHub repository request failed (${response.status}).`);
  const repo = await response.json();
  if (!repo.private || repo.fork) throw new Error('Target must be an independent private repository. No push performed.');
  console.log(JSON.stringify({ account: account.login, repository: repo.full_name, private: repo.private, fork: repo.fork }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
