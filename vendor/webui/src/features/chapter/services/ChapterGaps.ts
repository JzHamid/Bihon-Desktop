/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export function getNumericChapterGapCount(chapterNumbers: number[]): number {
    const knownNumbers = [...new Set(chapterNumbers.filter((value) => Number.isInteger(value) && value >= 0))].toSorted(
        (a, b) => a - b,
    );

    return knownNumbers.reduce((count, chapterNumber, index) => {
        const previous = knownNumbers[index - 1];
        return count + (previous === undefined ? 0 : Math.max(0, chapterNumber - previous - 1));
    }, 0);
}
