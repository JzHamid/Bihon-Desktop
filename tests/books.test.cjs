const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { BookService, validateCatalogUrl, cleanText, parseByteRange } = require('../desktop/books.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bihon-books-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const service = new BookService({ stateDir: path.join(root, 'state'), downloadsPath: path.join(root, 'downloads') });
  const source = path.join(root, 'Owned Book.epub');
  await fs.writeFile(source, Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('fixture')]));
  return { root, source, service };
}

test('imports a verified managed copy and detects duplicate hashes', async t => {
  const f = await fixture(t); const [first] = await f.service.importFiles([f.source]);
  await fs.writeFile(f.source, Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('fixture')]));
  const [again] = await f.service.importFiles([f.source]);
  assert.equal(again.id, first.id); assert.equal(again.duplicate, true);
  assert.equal((await f.service.list()).length, 1);
  assert.ok(await fs.stat(path.join(f.root, 'downloads', 'Books', first.fileName)));
});

test('metadata is sanitized and progress is clamped', async t => {
  const f = await fixture(t); const [book] = await f.service.importFiles([f.source]);
  const updated = await f.service.finalize(book.id, { title: '  A\u0000  Title  ', authors: [' Writer\nName '] });
  assert.equal(updated.title, 'A Title'); assert.deepEqual(updated.authors, ['Writer Name']);
  assert.equal((await f.service.saveProgress(book.id, { fraction: 2, cfi: ' epubcfi(/6/2) ' })).fraction, 1);
});

test('deletion removes only the indexed managed copy', async t => {
  const f = await fixture(t); const [book] = await f.service.importFiles([f.source]);
  assert.equal(await f.service.remove(book.id), true);
  assert.equal(await fs.readFile(f.source, 'utf8').then(Boolean), true);
  assert.equal((await f.service.list()).length, 0);
});

test('rejects invalid archives and cleans interrupted staging files', async t => {
  const f = await fixture(t); const bad = path.join(f.root, 'bad.epub'); await fs.writeFile(bad, 'not zip');
  await assert.rejects(f.service.importFiles([bad]), /valid EPUB/);
  assert.deepEqual(await fs.readdir(path.join(f.root, 'downloads', 'Books')), []);
});

test('catalog URL policy requires HTTPS except explicitly approved private HTTP', async () => {
  const publicLookup = async () => [{ address: '93.184.216.34' }];
  const privateLookup = async () => [{ address: '192.168.1.10' }];
  await validateCatalogUrl('https://example.com/opds', false, publicLookup);
  await assert.rejects(validateCatalogUrl('http://example.com/opds', true, publicLookup), /HTTP is allowed only/);
  await validateCatalogUrl('http://books.local/opds', true, privateLookup);
  await assert.rejects(validateCatalogUrl('file:///books.xml', true, privateLookup), /HTTP\(S\)/);
});

test('metadata sanitization strips controls and bounds length', () => assert.equal(cleanText(` A\n${'b'.repeat(400)}`).length, 300));

test('parses complete, open, and suffix byte ranges', () => {
  assert.deepEqual(parseByteRange('bytes=10-19', 100), { start: 10, end: 19 });
  assert.deepEqual(parseByteRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange('bytes=-12', 100), { start: 88, end: 99 });
  assert.equal(parseByteRange(null, 100), null);
  assert.throws(() => parseByteRange('bytes=100-101', 100), /Invalid/);
  assert.throws(() => parseByteRange('bytes=1-2,4-5', 100), /Invalid/);
});

test('fetches OPDS 1.2 and 2.0 content through the bounded catalog service', async t => {
  const f = await fixture(t); const lookup = async () => [{ address: '93.184.216.34' }];
  const xml = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Fixture</title></feed>';
  const service = new BookService({ stateDir: path.join(f.root, 'feeds'), downloadsPath: path.join(f.root, 'downloads'), lookup, fetchImpl: async () => new Response(xml, { headers: { 'content-type': 'application/atom+xml; profile=opds-catalog' } }) });
  const feed = await service.fetchCatalog('project-gutenberg'); assert.match(feed.body, /Fixture/);
  service.fetchImpl = async () => new Response(JSON.stringify({ metadata: { title: 'JSON fixture' } }), { headers: { 'content-type': 'application/opds+json' } });
  assert.match((await service.fetchCatalog('project-gutenberg')).body, /JSON fixture/);
});

test('revalidates redirect destinations and response limits', async t => {
  const f = await fixture(t); let calls = 0;
  const lookup = async hostname => [{ address: hostname === 'private.example' ? '10.0.0.4' : '93.184.216.34' }];
  const service = new BookService({ stateDir: path.join(f.root, 'redirects'), downloadsPath: path.join(f.root, 'downloads'), lookup, fetchImpl: async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://private.example/feed' } }); } });
  await assert.rejects(service.fetchCatalog('project-gutenberg'), /Private-network/); assert.equal(calls, 1);
  service.fetchImpl = async () => new Response('small', { headers: { 'content-type': 'application/atom+xml', 'content-length': String(6 * 1024 * 1024) } });
  await assert.rejects(service.fetchCatalog('project-gutenberg'), /larger/);
});
