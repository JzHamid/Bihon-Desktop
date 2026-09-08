/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export type OpdsLink = { href: string; rel?: string[]; type?: string; title?: string };
export type OpdsPublication = {
    title: string;
    authors: string[];
    cover?: string;
    acquisition?: string;
    description?: string;
};
export type OpdsFeed = {
    title: string;
    publications: OpdsPublication[];
    navigation: OpdsLink[];
    next?: string;
    search?: string;
};

const absolute = (value: string | undefined, base: string) => (value ? new URL(value, base).toString() : undefined);
const rels = (value: unknown) =>
    Array.isArray(value)
        ? value.map(String)
        : String(value ?? '')
              .split(/\s+/)
              .filter(Boolean);
const isAcquire = (rel: string) =>
    rel.startsWith('http://opds-spec.org/acquisition') || rel === 'http://opds-spec.org/acquisition/open-access';
const elements = (parent: Element | Document, name: string) => Array.from(parent.getElementsByTagNameNS('*', name));

export function parseOpds(body: string, contentType: string, base: string): OpdsFeed {
    if (/json/i.test(contentType) || body.trimStart().startsWith('{')) {
        const value = JSON.parse(body) as Record<string, any>;
        const links = (value.links ?? []) as Record<string, any>[];
        const publications = (value.publications ?? []).map((publication: Record<string, any>) => {
            const publicationLinks = (publication.links ?? []) as Record<string, any>[];
            const images = (publication.images ?? []) as Record<string, any>[];
            const authors = [publication.metadata?.author ?? publication.metadata?.authors ?? []]
                .flat()
                .map((author: any) => (typeof author === 'string' ? author : author?.name))
                .filter(Boolean);
            return {
                title: String(publication.metadata?.title ?? 'Untitled book'),
                authors,
                description: String(publication.metadata?.description ?? ''),
                cover: absolute(images[0]?.href, base),
                acquisition: absolute(
                    publicationLinks.find((link) => rels(link.rel).some(isAcquire) && /epub/i.test(link.type ?? ''))
                        ?.href,
                    base,
                ),
            };
        });
        return {
            title: String(value.metadata?.title ?? 'OPDS catalog'),
            publications,
            navigation: (value.navigation ?? []).map((item: any) => ({
                href: absolute(item.href, base)!,
                rel: rels(item.rel),
                type: item.type,
                title: item.title,
            })),
            next: absolute(links.find((link) => rels(link.rel).includes('next'))?.href, base),
            search: absolute(links.find((link) => rels(link.rel).includes('search'))?.href, base),
        };
    }
    const document = new DOMParser().parseFromString(body, 'application/xml');
    if (document.querySelector('parsererror')) {
        throw new Error('The catalog returned invalid XML.');
    }
    const link = (element: Element) => ({
        href: absolute(element.getAttribute('href') ?? '', base)!,
        rel: rels(element.getAttribute('rel')),
        type: element.getAttribute('type') ?? undefined,
        title: element.getAttribute('title') ?? undefined,
    });
    const feedLinks = elements(document, 'link')
        .filter((item) => item.parentElement === document.documentElement)
        .map(link);
    const publications: OpdsPublication[] = [];
    const navigation: OpdsLink[] = [];
    for (const entry of elements(document, 'entry')) {
        const links = elements(entry, 'link')
            .filter((item) => item.parentElement === entry)
            .map(link);
        const acquisition = links.find((item) => item.rel?.some(isAcquire) && /epub/i.test(item.type ?? ''))?.href;
        const title = elements(entry, 'title')[0]?.textContent?.trim() || 'Untitled book';
        if (!acquisition) {
            const [target] = links;
            if (target) {
                navigation.push({ ...target, title });
            }
            continue;
        }
        const cover = links.find((item) => item.rel?.some((rel) => /image|cover|thumbnail/.test(rel)))?.href;
        publications.push({
            title,
            acquisition,
            cover,
            authors: elements(entry, 'author')
                .map((author) => elements(author, 'name')[0]?.textContent?.trim() ?? '')
                .filter(Boolean),
            description: elements(entry, 'summary')[0]?.textContent?.trim(),
        });
    }
    return {
        title: elements(document, 'title')[0]?.textContent?.trim() || 'OPDS catalog',
        publications,
        navigation,
        next: feedLinks.find((item) => item.rel?.includes('next'))?.href,
        search: feedLinks.find((item) => item.rel?.includes('search'))?.href,
    };
}

export function makeSearchUrl(template: string, query: string) {
    if (template.includes('{searchTerms}')) {
        return template.replace('{searchTerms}', encodeURIComponent(query));
    }
    const url = new URL(template);
    url.searchParams.set(url.hostname.includes('gutenberg.org') ? 'query' : 'q', query);
    return url.toString();
}

export function formatContributor(value: unknown): string[] {
    return [value ?? []]
        .flat()
        .map((author: any) => (typeof author === 'string' ? author : author?.name))
        .map(String)
        .filter(Boolean);
}

export function formatTitle(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    if (value && typeof value === 'object') {
        return String(Object.values(value)[0] ?? '');
    }
    return '';
}
