const assert = require('node:assert/strict');

const DEFAULT_STORE_URL = 'https://github.com/keiyoushi/extensions/raw/repo/index.pb';
const DEFAULT_STORE_FINGERPRINT = '9add655a78e96c4ec7a53ef89dccb557cb5d767489fac5e785d671a5a75d4da2';
const DEFAULT_STORE_COMPLETE_KEY = '__APP_STATE_bihon_default_extension_store_complete';

function setupCompleted(preferences) {
  return [...preferences.matchAll(/<boolean\b([^>]*)\/?\s*>/g)].some(([, attributes]) => {
    const values = Object.fromEntries([...attributes.matchAll(/([a-zA-Z_]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));
    return values.name === DEFAULT_STORE_COMPLETE_KEY && values.value === 'true';
  });
}

// Inspect only an owned, stopped emulator profile. The production APK exposes
// no database/debug interface; adb root is confined to the disposable runner.
function readDefaultStoreEvidence(databaseFile, preferences) {
  const { DatabaseSync } = require('node:sqlite');
  const database = new DatabaseSync(databaseFile, { readOnly: true });
  let rows;
  try {
    rows = database.prepare('SELECT index_url, name, signing_key, is_legacy FROM extension_store ORDER BY index_url').all();
  } finally { database.close(); }
  assert.equal(rows.length, 1, 'A fresh Android profile must contain exactly one automatically configured store');
  const store = rows[0];
  assert.equal(store.index_url, DEFAULT_STORE_URL, 'Android did not register the native Keiyoushi index');
  assert.equal(store.name, 'Keiyoushi');
  assert.equal(store.signing_key.toLowerCase(), DEFAULT_STORE_FINGERPRINT, 'Android store signing identity does not match the published pin');
  assert.equal(Number(store.is_legacy), 0, 'Android must register the native signed store');
  assert.ok(setupCompleted(preferences), 'Android did not persist completion of one-time extension setup');
  return { configured: true, storeCount: rows.length, indexUrl: store.index_url, name: store.name, signingKey: store.signing_key, legacy: false };
}

module.exports = { readDefaultStoreEvidence, setupCompleted, DEFAULT_STORE_URL, DEFAULT_STORE_FINGERPRINT, DEFAULT_STORE_COMPLETE_KEY };
