const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Server } = require('../desktop/server.cjs');
const { readJson } = require('../desktop/storage.cjs');

test('missing bundled Java preserves the native spawn error and leaves no child, open log, or hanging shutdown', { timeout: 5000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bihon-server-start-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const stateDir = path.join(directory, 'state');
  const runtime = path.join(directory, 'runtime');
  const ui = path.join(directory, 'ui');
  const wrapper = path.join(directory, 'wrapper');
  await fs.mkdir(path.join(runtime, 'kcef'), { recursive: true });
  await fs.writeFile(path.join(runtime, 'kcef', 'release'), 'Synthetic WebView marker');
  await fs.mkdir(ui);
  await fs.writeFile(path.join(ui, 'index.html'), '<div id="root"></div><script></script>');
  const server = new Server({ stateDir, runtime, ui, wrapper });
  const executable = path.join(runtime, 'jre', 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(server.start({ downloadsPath: path.join(directory, 'downloads') }), error => {
      assert.equal(error.code, 'ENOENT');
      assert.equal(error.path, executable);
      return true;
    });
    assert.equal(server.child, null);
    assert.equal(await readJson(path.join(stateDir, 'desktop-server.json'), null), null, 'An unstarted child must not be recorded as a live engine.');
    await server.stop();
    // The failed start awaits log closure, so it can be reopened/removed and a
    // subsequent attempt reports the actual executable error rather than busy.
    await fs.unlink(path.join(stateDir, 'desktop-server.log'));
  }
});
