/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

type BookProgress = { fraction: number; cfi?: string; updatedAt: string };
type BookRecord = {
    id: string;
    fileName: string;
    title: string;
    authors: string[];
    language?: string;
    description?: string;
    coverFile?: string;
    metadataReady: boolean;
    fileSize: number;
    addedAt: string;
    updatedAt: string;
    source: { kind: 'import' | 'opds'; catalogId?: string; acquisitionUrl?: string };
    progress: BookProgress;
    duplicate?: boolean;
};
type CatalogRecord = { id: string; name: string; url: string; builtIn: boolean; allowInsecure: boolean };
type OpdsFeedResponse = { body: string; contentType: string; finalUrl: string };

interface Window {
    bihon?: {
        setupInfo(): Promise<{ defaultRepositoryReady: boolean }>;
        downloadsInfo(): Promise<{ path: string }>;
        chooseDownloads(): Promise<{ canceled: boolean; path?: string }>;
        openDownloads(): Promise<string>;
        appInfo(): Promise<{
            version: string;
            engineVersion: string;
            webuiVersion: string;
            stateDir: string;
            downloadsPath: string;
        }>;
        openLicenses(): Promise<string>;
        books: {
            list(): Promise<BookRecord[]>;
            import(): Promise<BookRecord[]>;
            finalize(
                id: string,
                metadata: {
                    title?: string;
                    authors?: string[];
                    language?: string;
                    description?: string;
                    coverDataUrl?: string;
                },
            ): Promise<BookRecord>;
            saveProgress(id: string, progress: Pick<BookProgress, 'fraction' | 'cfi'>): Promise<BookProgress>;
            remove(id: string): Promise<boolean>;
        };
        catalogs: {
            list(): Promise<CatalogRecord[]>;
            add(input: { name: string; url: string; allowInsecure: boolean }): Promise<CatalogRecord>;
            remove(id: string): Promise<boolean>;
            fetch(id: string, url?: string): Promise<OpdsFeedResponse>;
            cover(id: string, url: string): Promise<string>;
            acquire(id: string, url: string): Promise<BookRecord[]>;
        };
        onProgress(callback: (progress: { stage: string; completed: number; total: number }) => void): () => void;
    };
}
