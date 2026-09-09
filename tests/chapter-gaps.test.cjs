const test = require('node:test');
const assert = require('node:assert/strict');

const modulePromise = import('../vendor/webui/src/features/chapter/services/ChapterGaps.ts');

test('counts internal numeric chapter gaps', async () => {
  const { getNumericChapterGapCount } = await modulePromise;
  assert.equal(getNumericChapterGapCount([1, 2, 4]), 1);
  assert.equal(getNumericChapterGapCount([4, 8]), 3);
});

test('ignores duplicates, fractions, unknown chapters, and outer gaps', async () => {
  const { getNumericChapterGapCount } = await modulePromise;
  assert.equal(getNumericChapterGapCount([-1, 3, 3, 3.5, 4, 6, 9.25]), 1);
  assert.equal(getNumericChapterGapCount([20, 21, 22]), 0);
  assert.equal(getNumericChapterGapCount([-1, 0.5]), 0);
});
