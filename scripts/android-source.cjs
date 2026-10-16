const fs = require('node:fs');
const path = require('node:path');
const { root, defaultDirectory, verifyPrepared, run, hash, insideWorkspace } = require('./android-prepare.cjs');

function sourceArchive(directory = defaultDirectory) {
  directory = insideWorkspace(directory);
  const version = require('../package.json').version;
  verifyPrepared(directory, version);
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  const target = path.join(root, 'dist', `Bihon-Android-${version}-source.tar.gz`);
  run('tar', [
    '--exclude=.git', '--exclude=.gradle', '--exclude=.kotlin', '--exclude=build',
    '--exclude=local.properties', '--exclude=keystore.properties', '--exclude=google-services.json',
    '--exclude=*.keystore', '--exclude=*.jks', '--exclude=*.p12',
    '-czf', target, '-C', path.dirname(directory), path.basename(directory),
  ]);
  const entries = run('tar', ['-tzf', target]).trim().split(/\r?\n/);
  for (const required of ['LICENSE', 'BIHON-NOTICE.txt', 'BIHON-BUILD.md', 'BIHON-PREPARED.json', 'gradlew', 'gradle/wrapper/gradle-wrapper.jar', 'app/build.gradle.kts']) {
    if (!entries.includes(`${path.basename(directory)}/${required}`)) throw new Error(`Corresponding source is missing ${required}`);
  }
  if (entries.some(entry => /(?:^|\/)(?:\.git|\.gradle|\.kotlin|build)(?:\/|$)|(?:keystore\.properties|local\.properties|\.(?:jks|keystore|p12))$/.test(entry))) {
    throw new Error('Corresponding source contains generated data or signing material');
  }
  console.log(`Created ${target}\nSHA256 ${hash(fs.readFileSync(target))}`);
  return target;
}

if (require.main === module) {
  if (process.argv.length > 3) throw new Error('Usage: node scripts/android-source.cjs [generated-source-directory]');
  sourceArchive(process.argv[2]);
}
module.exports = { sourceArchive };
