const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { root } = require('../scripts/android-prepare.cjs');
const { readDefaultStoreEvidence, DEFAULT_STORE_URL, DEFAULT_STORE_FINGERPRINT, DEFAULT_STORE_COMPLETE_KEY } = require('../scripts/android-store-evidence.cjs');

function fixture() {
  fs.mkdirSync(path.join(root, '.test-data'), { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, '.test-data', 'android-store-evidence-'));
  const file = path.join(directory, 'tachiyomi.db');
  const database = new DatabaseSync(file);
  database.exec('CREATE TABLE extension_store(index_url TEXT PRIMARY KEY, name TEXT, signing_key TEXT, is_legacy INTEGER)');
  const insert = (url = DEFAULT_STORE_URL, fingerprint = DEFAULT_STORE_FINGERPRINT) => database.prepare('INSERT INTO extension_store VALUES (?, ?, ?, ?)').run(url, 'Keiyoushi', fingerprint, 0);
  return { directory, file, database, insert, cleanup() { database.close(); fs.rmSync(directory, { recursive: true, force: true }); } };
}
const completed = '<map><boolean value="true" name="' + DEFAULT_STORE_COMPLETE_KEY + '" /></map>';

test('Android store smoke reads a real persisted database and one-time setup marker', () => {
  const profile = fixture();
  try {
    profile.insert();
    const evidence = readDefaultStoreEvidence(profile.file, completed);
    assert.equal(evidence.configured, true);
    assert.equal(evidence.storeCount, 1);
    assert.equal(evidence.signingKey, DEFAULT_STORE_FINGERPRINT);
  } finally { profile.cleanup(); }
});

test('Android store smoke rejects absent, duplicate, untrusted, or uncommitted setup', () => {
  const profile = fixture();
  try {
    assert.throws(() => readDefaultStoreEvidence(profile.file, completed), /exactly one/);
    profile.insert();
    assert.throws(() => readDefaultStoreEvidence(profile.file, '<map/>'), /persist completion/);
    assert.throws(() => readDefaultStoreEvidence(profile.file, completed.replace('value="true"', 'value="false"')), /persist completion/);
    profile.insert('https://example.test/index.pb');
    assert.throws(() => readDefaultStoreEvidence(profile.file, completed), /exactly one/);
    profile.database.exec('DELETE FROM extension_store');
    profile.insert(DEFAULT_STORE_URL, 'a'.repeat(64));
    assert.throws(() => readDefaultStoreEvidence(profile.file, completed), /published pin/);
    profile.database.exec('DELETE FROM extension_store');
    profile.insert('https://example.test/index.pb');
    assert.throws(() => readDefaultStoreEvidence(profile.file, completed), /native Keiyoushi index/);
  } finally { profile.cleanup(); }
});
