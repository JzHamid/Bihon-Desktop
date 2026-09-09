/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

declare module 'foliate-js/view.js' {
    export type FoliateTOCItem = { label?: string; href?: string; subitems?: FoliateTOCItem[] };
    export type FoliateSearchExcerpt = { pre: string; match: string; post: string };
    export type FoliateSearchResult =
        | { progress: number }
        | { label: string; subitems: { cfi: string; excerpt: FoliateSearchExcerpt }[] }
        | 'done';
    export type FoliateLocation = {
        cfi?: string;
        fraction?: number;
        location?: { current?: number; total?: number };
        tocItem?: { label?: string; href?: string };
        pageItem?: { label?: string; href?: string };
    };
    export type FoliateRenderer = HTMLElement & {
        setStyles?(css: string): void;
        getContents?(): { doc: Document; index?: number }[];
    };
    export type FoliateBook = {
        dir?: string;
        metadata?: { title?: unknown; author?: unknown; language?: string; description?: string };
        toc?: FoliateTOCItem[] | null;
        getCover?: () => Promise<Blob | null> | Blob | null;
        destroy?: () => void;
    };
    export function makeBook(input: string | File): Promise<FoliateBook>;
    export class View extends HTMLElement {
        book: FoliateBook;
        renderer?: FoliateRenderer;
        isFixedLayout: boolean;
        lastLocation?: FoliateLocation;
        open(input: string | File): Promise<void>;
        init(options: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
        close(): void;
        prev(): Promise<void>;
        next(): Promise<void>;
        goLeft(): Promise<void>;
        goRight(): Promise<void>;
        goTo(target: string): Promise<void>;
        goToFraction(fraction: number): Promise<void>;
        getSectionFractions(): number[];
        search(options: {
            query: string;
            draw?: (rects: DOMRectList | DOMRect[]) => SVGGElement;
        }): AsyncGenerator<FoliateSearchResult>;
        clearSearch(): void;
        addAnnotation(annotation: { value: string; kind?: string }): Promise<unknown>;
        deleteAnnotation(annotation: { value: string; kind?: string }): Promise<unknown>;
    }
}

declare module 'foliate-js/overlayer.js' {
    export class Overlayer {
        static highlight(rects: DOMRectList | DOMRect[], options?: { color?: string }): SVGGElement;
    }
}
