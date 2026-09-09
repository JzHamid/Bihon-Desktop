const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const stateDir = process.env.BIHON_BOOKS_DATA_DIR || path.join(root, '.test-data', 'gutenberg-book');

const currentLocation = (page) =>
  page.evaluate(() => {
    const location = document.querySelector('foliate-view')?.lastLocation;
    return `${location?.cfi ?? ''}|${location?.fraction ?? ''}`;
  });

async function expectMovement(page, action, label) {
  const before = await currentLocation(page);
  await action();
  try {
    await page.waitForFunction(
      (previous) => {
        const location = document.querySelector('foliate-view')?.lastLocation;
        const next = `${location?.cfi ?? ''}|${location?.fraction ?? ''}`;
        return Boolean(location?.cfi && next !== previous);
      },
      before,
      { timeout: 10000 },
    );
  } catch (error) {
    console.error(`${label} did not move:`, { before, after: await currentLocation(page) });
    throw error;
  }
  await page.waitForTimeout(250);
  console.log(`PASS ${label}`);
}

async function expectNoMovement(page, action, label) {
  const before = await currentLocation(page);
  await action();
  await page.waitForTimeout(500);
  const after = await currentLocation(page);
  if (after !== before) {
    throw new Error(`${label} unexpectedly moved from ${before} to ${after}`);
  }
  console.log(`PASS ${label}`);
}

async function run() {
  const index = JSON.parse(await fs.readFile(path.join(stateDir, 'books.json'), 'utf8'));
  const bookId = index.books?.[0]?.id;
  if (!bookId) {
    throw new Error(`No imported EPUB is indexed in ${stateDir}`);
  }
  const env = { ...process.env, BIHON_DATA_DIR: stateDir };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.BIHON_EXECUTABLE || require('electron'),
    args: process.env.BIHON_EXECUTABLE ? ['--disable-gpu'] : [root, '--disable-gpu'],
    env,
    timeout: 60000,
  });
  const rendererErrors = [];
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (error) => rendererErrors.push(error.message));
    await page.waitForURL('http://127.0.0.1:*/**', { timeout: 120000 });
    const origin = new URL(page.url()).origin;
    await page.goto(`${origin}/books/${bookId}/read`);
    await page.getByRole('button', { name: 'Next', exact: true }).waitFor({ timeout: 30000 });
    await page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll('button[disabled]')).some((button) =>
          button.textContent?.includes('Next'),
        ),
      null,
      { timeout: 30000 },
    );
    await page.waitForFunction(() => Boolean(document.querySelector('foliate-view')?.lastLocation?.cfi), null, {
      timeout: 30000,
    });
    await page.evaluate(() => document.querySelector('foliate-view').goToFraction(0.25));
    await page.waitForFunction(() => document.querySelector('foliate-view')?.lastLocation?.fraction > 0.2, null, {
      timeout: 10000,
    });
    await page.waitForTimeout(1000);
    console.log('Reader ready:', page.url(), await page.getByRole('button').allTextContents());

    await expectMovement(page, () => page.getByRole('button', { name: 'Next', exact: true }).click(), 'Next button');
    await expectMovement(page, () => page.getByRole('button', { name: 'Previous', exact: true }).click(), 'Previous button');
    await expectMovement(page, () => page.keyboard.press('ArrowRight'), 'Right Arrow');
    await expectMovement(page, () => page.keyboard.press('ArrowLeft'), 'Left Arrow');
    await expectMovement(page, () => page.keyboard.press('d'), 'D key');
    await expectMovement(page, () => page.keyboard.press('a'), 'A key');
    await expectMovement(page, () => page.keyboard.press('PageDown'), 'Page Down');
    await expectMovement(page, () => page.keyboard.press('PageUp'), 'Page Up');
    await expectMovement(page, () => page.keyboard.press('Space'), 'Space');
    await expectMovement(page, () => page.keyboard.press('Shift+Space'), 'Shift+Space');
    await expectMovement(
      page,
      () =>
        page.evaluate(() => {
          const view = document.querySelector('foliate-view');
          view.renderer.getContents()[0].doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
        }),
      'EPUB iframe keyboard navigation',
    );
    await expectNoMovement(
      page,
      () =>
        page.evaluate(() => {
          const document_ = document.querySelector('foliate-view').renderer.getContents()[0].doc;
          const input = document_.createElement('input');
          document_.body.append(input);
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
          input.remove();
        }),
      'editable EPUB control exclusion',
    );
    await expectMovement(page, () => page.getByRole('button', { name: 'Turn page right' }).click(), 'right click zone');
    await expectMovement(page, () => page.getByRole('button', { name: 'Turn page left' }).click(), 'left click zone');

    await page.evaluate(() => document.querySelector('foliate-view').goToFraction(0.25));
    await page.waitForTimeout(500);
    const rtlBefore = await page.evaluate(() => document.querySelector('foliate-view').lastLocation.fraction);
    await page.evaluate(() => {
      document.querySelector('foliate-view').book.dir = 'rtl';
    });
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(
      (before) => document.querySelector('foliate-view')?.lastLocation?.fraction > before,
      rtlBefore,
      { timeout: 10000 },
    );
    await page.evaluate(() => {
      document.querySelector('foliate-view').book.dir = 'ltr';
    });
    await page.waitForTimeout(250);
    console.log('PASS RTL direction-aware navigation');

    await page.getByRole('button', { name: 'Appearance' }).click();
    await page.getByRole('dialog', { name: 'Appearance' }).waitFor();
    await page.getByRole('button', { name: 'Sepia' }).click();
    await page.getByRole('button', { name: 'Scroll' }).click();
    const appearance = await page.evaluate(() => {
      const view = document.querySelector('foliate-view');
      const document_ = view.renderer.getContents()[0].doc;
      return {
        flow: view.renderer.getAttribute('flow'),
        selectionRule: Array.from(document_.querySelectorAll('style')).some((style) =>
          style.textContent.includes('::selection'),
        ),
      };
    });
    if (appearance.flow !== 'scrolled' || !appearance.selectionRule) {
      throw new Error(`Appearance settings were not applied: ${JSON.stringify(appearance)}`);
    }
    await page.getByRole('button', { name: 'Pages' }).click();
    await page.keyboard.press('Escape');

    const illustrationIndex = await page.evaluate(async () => {
      const sections = document.querySelector('foliate-view').book.sections;
      for (const [index, section] of sections.entries()) {
        if (!section.createDocument) continue;
        const document_ = await section.createDocument();
        const textLength = (document_.body?.innerText ?? '').replaceAll(/\s+/g, ' ').trim().length;
        if (textLength <= 220 && document_.querySelector('img, svg')) return index;
      }
      return -1;
    });
    if (illustrationIndex < 0) {
      throw new Error('The verification EPUB has no image-dominant section');
    }
    await page.evaluate((index) => document.querySelector('foliate-view').goTo(index), illustrationIndex);
    await page.waitForFunction(
      () =>
        document
          .querySelector('foliate-view')
          ?.renderer?.getContents?.()
          .some(({ doc }) => doc.documentElement.classList.contains('bihon-illustration-page')),
      null,
      { timeout: 10000 },
    );
    const illustrationColumns = await page.evaluate(() =>
      document.querySelector('foliate-view').renderer.getAttribute('max-column-count'),
    );
    if (illustrationColumns !== '1') {
      throw new Error(`Illustration fitting did not use one column: ${illustrationColumns}`);
    }
    await page.evaluate(() => document.querySelector('foliate-view').goToFraction(0.25));
    await page.waitForFunction(
      () => document.querySelector('foliate-view').renderer.getAttribute('max-column-count') === '2',
      null,
      { timeout: 10000 },
    );
    console.log('PASS automatic illustration fitting and prose restoration');

    await page.keyboard.press('Control+f');
    const search = page.getByRole('textbox', { name: 'Find in book' });
    await search.fill('Elizabeth');
    await search.press('Enter');
    await page.getByText(/matches$/).first().waitFor({ timeout: 30000 });
    await expectMovement(page, () => page.getByRole('button', { name: 'Next match' }).click(), 'search result navigation');
    await page.getByRole('button', { name: 'Clear search' }).click();
    if (await page.getByText(/matches$/).count()) {
      throw new Error('Clearing search left result UI visible');
    }
    await page.keyboard.press('Escape');

    const progress = page.getByRole('slider', { name: 'Book progress' });
    await expectMovement(page, () => progress.fill('25'), 'progress seeking');

    await page.getByRole('button', { name: 'Contents' }).click();
    await page.getByRole('dialog', { name: 'Contents' }).waitFor();
    await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'artifacts', 'books-reader.png') });
    await page.keyboard.press('Escape');
    if (await page.getByRole('dialog', { name: 'Contents' }).count()) {
      throw new Error('First Escape did not close the reader panel');
    }
    await page.keyboard.press('Escape');
    await page.waitForURL('**/books');
    if (rendererErrors.length) {
      throw new Error(`Renderer errors: ${rendererErrors.join('; ')}`);
    }
    console.log('PASS reader panels, appearance, search, progress, and Escape behavior');
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
