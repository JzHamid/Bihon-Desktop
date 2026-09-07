// Bihon additions, MPL-2.0. Register once; a user's later removal stays removed.
const path = require('node:path');
const { readJson, writeJson } = require('./storage.cjs');
const DEFAULT_REPOSITORY = 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/repo.json';
const INDEX_ALIASES = new Set([DEFAULT_REPOSITORY, 'https://github.com/keiyoushi/extensions/raw/repo/index.pb', 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.pb']);
async function configureDefaultRepository({ stateDir, url, fetchImpl = fetch }) {
  const marker = path.join(stateDir, 'default-repository.json');
  if ((await readJson(marker, null))?.configured) return false;
  async function gql(query, variables) {
    const response = await fetchImpl(`${url}/api/graphql`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Extension setup returned ${response.status}`);
    const result = await response.json();
    if (result.errors?.length) throw new Error(result.errors.map(e => e.message).join('; '));
    return result.data;
  }
  const data = await gql('{ extensionStores { nodes { indexUrl } } }');
  const exists = data.extensionStores.nodes.some(store => INDEX_ALIASES.has(store.indexUrl));
  if (!exists) await gql('mutation($url: String!) { addExtensionStore(input: { indexUrl: $url }) { extensionStore { name } } }', { url: DEFAULT_REPOSITORY });
  await writeJson(marker, { configured: true, indexUrl: DEFAULT_REPOSITORY });
  return !exists;
}
module.exports = { configureDefaultRepository, DEFAULT_REPOSITORY };
