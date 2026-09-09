/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

declare module 'foliate-js/view.js' {
    export type FoliateBook = {
        metadata?: { title?: unknown; author?: unknown; language?: string; description?: string };
        getCover?: () => Promise<Blob | null> | Blob | null;
        destroy?: () => void;
    };
    export function makeBook(input: string | File): Promise<FoliateBook>;
    export type FoliateLocation = { cfi?: string; fraction?: number; location?: { current?: number; total?: number } };
    export class View extends HTMLElement {
        book: {
            metadata?: { title?: unknown; author?: unknown; language?: string; description?: string };
            toc?: { label?: string; href?: string; subitems?: unknown[] }[];
            getCover?: () => Promise<Blob | null> | Blob | null;
        };
        renderer?: { setAttribute(name: string, value: string): void; setStyles?(css: string): void };
        lastLocation?: FoliateLocation;
        open(input: string | File): Promise<void>;
        init(options: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
        close(): void;
        prev(): Promise<void>;
        next(): Promise<void>;
        goTo(target: string): Promise<void>;
        goToFraction(fraction: number): Promise<void>;
        search(options: { query: string }): AsyncGenerator<unknown>;
        clearSearch(): void;
    }
}
