const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const dns = require('node:dns/promises');
const net = require('node:net');
const { Readable } = require('node:stream');
const { readJson, writeJson, digest, inside } = require('./storage.cjs');

const SCHEMA_VERSION = 1;
const MAX_EPUB_BYTES = 500 * 1024 * 1024;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const GUTENBERG = Object.freeze({
  id: 'project-gutenberg',
  name: 'Project Gutenberg',
  url: 'https://www.gutenberg.org/ebooks/search.opds/',
  builtIn: true,
  allowInsecure: false,
});

function initialState() { return { schemaVersion: SCHEMA_VERSION, books: [], catalogs: [GUTENBERG] }; }
function cleanText(value, max = 300) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function normalizeFraction(value) { return Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0)); }
function parseByteRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) throw new Error('Invalid byte range.');
  let start; let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error('Invalid byte range.');
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) throw new Error('Invalid byte range.');
    end = Math.min(end, size - 1);
  }
  return { start, end };
}
function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
  }
  return false;
}
async function validateCatalogUrl(value, allowInsecure = false, lookup = dns.lookup) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a valid catalog URL.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Catalogs must use an HTTP(S) URL without embedded credentials.');
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  const privateDestination = addresses.some(({ address }) => isPrivateIp(address));
  if (url.protocol === 'http:' && !(allowInsecure && privateDestination)) throw new Error('HTTP is allowed only for a confirmed local/private-network catalog.');
  if (url.protocol === 'https:' && privateDestination && !allowInsecure) throw new Error('Private-network catalogs require explicit approval.');
  return { url, privateDestination };
}
async function readLimited(response, limit) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > limit) throw new Error('The response is larger than Bihon allows.');
  const chunks = []; let size = 0;
  for await (const chunk of Readable.fromWeb(response.body)) {
    size += chunk.length;
    if (size > limit) throw new Error('The response is larger than Bihon allows.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

class BookService {
  constructor({ stateDir, downloadsPath, fetchImpl = global.fetch, lookup = dns.lookup }) {
    this.stateDir = stateDir;
    this.downloadsPath = downloadsPath;
    this.fetchImpl = fetchImpl;
    this.lookup = lookup;
    this.stateFile = path.join(stateDir, 'books.json');
    this.coverDir = path.join(stateDir, 'books', 'covers');
    this.queue = Promise.resolve();
  }
  setDownloadsPath(downloadsPath) { this.downloadsPath = downloadsPath; }
  get booksDir() { return path.join(this.downloadsPath, 'Books'); }
  async state() {
    const value = await readJson(this.stateFile, initialState());
    if (value.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported book index schema ${value.schemaVersion}.`);
    if (!value.catalogs.some(({ id }) => id === GUTENBERG.id)) value.catalogs.unshift(GUTENBERG);
    return value;
  }
  mutate(callback) {
    const operation = this.queue.then(async () => {
      const state = await this.state();
      const result = await callback(state);
      await writeJson(this.stateFile, state);
      return result;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  async list() { const state = await this.state(); return state.books; }
  async catalogs() { const state = await this.state(); return state.catalogs; }
  async importFiles(files, source = { kind: 'import' }) {
    await fs.mkdir(this.booksDir, { recursive: true });
    const results = [];
    for (const input of files) {
      const sourcePath = path.resolve(input);
      if (path.extname(sourcePath).toLowerCase() !== '.epub') throw new Error('Only .epub files can be imported.');
      const stat = await fs.stat(sourcePath);
      if (!stat.isFile() || stat.size < 4 || stat.size > MAX_EPUB_BYTES) throw new Error('The EPUB is empty or exceeds the 500 MB limit.');
      const signature = Buffer.alloc(4); const handle = await fs.open(sourcePath, 'r');
      try { await handle.read(signature, 0, 4, 0); } finally { await handle.close(); }
      if (!signature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new Error('The selected file is not a valid EPUB archive.');
      const id = await digest(sourcePath);
      const existing = (await this.list()).find(book => book.id === id);
      if (existing) { results.push({ ...existing, duplicate: true }); continue; }
      const fileName = `${id}.epub`, destination = path.join(this.booksDir, fileName);
      const staging = `${destination}.partial-${crypto.randomUUID()}`;
      try {
        await fs.copyFile(sourcePath, staging, require('node:fs').constants.COPYFILE_EXCL);
        if (await digest(staging) !== id) throw new Error('EPUB verification failed; the original was left unchanged.');
        await fs.rename(staging, destination);
      } catch (error) { await fs.rm(staging, { force: true }); throw error; }
      const now = new Date().toISOString();
      const record = { id, fileName, title: cleanText(path.basename(sourcePath, path.extname(sourcePath))), authors: [], metadataReady: false, addedAt: now, updatedAt: now, fileSize: stat.size, source, progress: { fraction: 0, updatedAt: now } };
      try { await this.mutate(state => { if (!state.books.some(book => book.id === id)) state.books.push(record); return record; }); }
      catch (error) { await fs.rm(destination, { force: true }); throw error; }
      results.push(record);
    }
    return results;
  }
  async finalize(id, metadata = {}) {
    return this.mutate(async state => {
      const book = state.books.find(item => item.id === id); if (!book) throw new Error('Book not found.');
      book.title = cleanText(metadata.title) || book.title;
      book.authors = (Array.isArray(metadata.authors) ? metadata.authors : [metadata.authors]).map(value => cleanText(value, 150)).filter(Boolean).slice(0, 20);
      book.language = cleanText(metadata.language, 40) || undefined;
      book.description = cleanText(metadata.description, 2000) || undefined;
      book.metadataReady = true;
      if (metadata.coverDataUrl) {
        const match = /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=]+)$/i.exec(metadata.coverDataUrl);
        if (!match) throw new Error('Unsupported cover image.');
        const bytes = Buffer.from(match[2], 'base64');
        if (bytes.length > 10 * 1024 * 1024) throw new Error('Cover image exceeds the 10 MB limit.');
        await fs.mkdir(this.coverDir, { recursive: true });
        const extension = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
        const target = path.join(this.coverDir, `${id}.${extension}`), temp = `${target}.tmp`;
        await fs.writeFile(temp, bytes); await fs.rename(temp, target);
        book.coverFile = path.basename(target);
      }
      book.updatedAt = new Date().toISOString(); return book;
    });
  }
  async saveProgress(id, progress) {
    return this.mutate(state => {
      const book = state.books.find(item => item.id === id); if (!book) throw new Error('Book not found.');
      book.progress = { fraction: normalizeFraction(progress.fraction), cfi: cleanText(progress.cfi, 4000) || undefined, updatedAt: new Date().toISOString() };
      return book.progress;
    });
  }
  async remove(id) {
    const state = await this.state(); const book = state.books.find(item => item.id === id); if (!book) return false;
    const bookPath = path.resolve(this.booksDir, book.fileName);
    if (!inside(this.booksDir, bookPath)) throw new Error('Invalid managed book path.');
    await fs.rm(bookPath, { force: true });
    if (book.coverFile) {
      const coverPath = path.resolve(this.coverDir, book.coverFile);
      if (inside(this.coverDir, coverPath)) await fs.rm(coverPath, { force: true });
    }
    await this.mutate(value => { value.books = value.books.filter(item => item.id !== id); });
    return true;
  }
  async addCatalog(input) {
    const name = cleanText(input.name, 100); if (!name) throw new Error('Catalog name is required.');
    const checked = await validateCatalogUrl(input.url, !!input.allowInsecure, this.lookup);
    return this.mutate(state => {
      const url = checked.url.toString();
      if (state.catalogs.some(item => item.url === url)) throw new Error('That catalog is already added.');
      const record = { id: crypto.randomUUID(), name, url, builtIn: false, allowInsecure: !!input.allowInsecure };
      state.catalogs.push(record); return record;
    });
  }
  async removeCatalog(id) { return this.mutate(state => { const before = state.catalogs.length; state.catalogs = state.catalogs.filter(item => item.id !== id || item.builtIn); return state.catalogs.length !== before; }); }
  async fetchChecked(url, catalog, { limit = MAX_FEED_BYTES, timeout = 20000, accept } = {}) {
    let current = url;
    for (let redirects = 0; redirects <= 5; redirects++) {
      await validateCatalogUrl(current, catalog.allowInsecure, this.lookup);
      const response = await this.fetchImpl(current, { redirect: 'manual', signal: AbortSignal.timeout(timeout), headers: accept ? { Accept: accept } : undefined });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location'); if (!location) throw new Error('Catalog redirect had no destination.');
        current = new URL(location, current).toString(); continue;
      }
      if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
      return { response, body: await readLimited(response, limit), finalUrl: current };
    }
    throw new Error('Catalog redirected too many times.');
  }
  async fetchCatalog(id, url) {
    const catalog = (await this.catalogs()).find(item => item.id === id); if (!catalog) throw new Error('Catalog not found.');
    const requested = new URL(url || catalog.url, catalog.url);
    const { response, body, finalUrl } = await this.fetchChecked(requested.toString(), catalog, { accept: 'application/opds+json, application/atom+xml, application/xml, text/xml;q=0.9' });
    const type = response.headers.get('content-type') || '';
    if (!/(opds\+json|atom\+xml|application\/xml|text\/xml|application\/json)/i.test(type)) throw new Error('The server did not return an OPDS feed.');
    return { body: body.toString('utf8'), contentType: type, finalUrl };
  }
  async fetchCover(id, url) {
    const catalog = (await this.catalogs()).find(item => item.id === id); if (!catalog) throw new Error('Catalog not found.');
    const { response, body } = await this.fetchChecked(new URL(url, catalog.url).toString(), catalog, { limit: 10 * 1024 * 1024, timeout: 20000, accept: 'image/avif,image/webp,image/png,image/jpeg' });
    const type = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!['image/avif', 'image/webp', 'image/png', 'image/jpeg'].includes(type)) throw new Error('The catalog cover was not a supported image.');
    return `data:${type};base64,${body.toString('base64')}`;
  }
  async acquire(catalogId, url) {
    const catalog = (await this.catalogs()).find(item => item.id === catalogId); if (!catalog) throw new Error('Catalog not found.');
    const requested = new URL(url, catalog.url);
    const { response, body } = await this.fetchChecked(requested.toString(), catalog, { limit: MAX_EPUB_BYTES, timeout: 120000, accept: 'application/epub+zip' });
    const type = response.headers.get('content-type') || '';
    if (!/(application\/epub\+zip|application\/octet-stream)/i.test(type)) throw new Error('The acquisition was not an EPUB.');
    await fs.mkdir(this.booksDir, { recursive: true });
    const temporary = path.join(this.booksDir, `.acquire-${crypto.randomUUID()}.epub`);
    try { await fs.writeFile(temporary, body); return await this.importFiles([temporary], { kind: 'opds', catalogId, acquisitionUrl: requested.toString() }); }
    finally { await fs.rm(temporary, { force: true }); }
  }
  async resolve(id, kind = 'book') {
    if (!/^[a-f0-9]{64}$/.test(id)) return null;
    const book = (await this.list()).find(item => item.id === id); if (!book) return null;
    const base = kind === 'cover' ? this.coverDir : this.booksDir;
    const file = path.resolve(base, kind === 'cover' ? book.coverFile || '' : book.fileName);
    return inside(base, file) ? file : null;
  }
}

module.exports = { BookService, GUTENBERG, SCHEMA_VERSION, MAX_EPUB_BYTES, MAX_FEED_BYTES, cleanText, isPrivateIp, parseByteRange, validateCatalogUrl };
