/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import ClearIcon from '@mui/icons-material/Clear';
import CloseIcon from '@mui/icons-material/Close';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Overlayer } from 'foliate-js/overlayer.js';
import { View, type FoliateLocation, type FoliateSearchExcerpt, type FoliateTOCItem } from 'foliate-js/view.js';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { formatContributor, formatTitle } from '@/features/books/Books.util.ts';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';

type ReaderPanel = 'contents' | 'search' | 'appearance' | null;
type ReaderFlow = 'paginated' | 'scrolled';
type ReaderTheme = 'light' | 'dark' | 'sepia';
type FixedZoom = 'fit-page' | 'fit-width' | '1';
type ReaderSettings = {
    flow: ReaderFlow;
    theme: ReaderTheme;
    fontSize: number;
    lineSpacing: number;
    margin: number;
    autoFitIllustrations: boolean;
    fixedZoom: FixedZoom;
};
type SearchHit = { cfi: string; excerpt: FoliateSearchExcerpt; label: string };
type SearchState = 'idle' | 'searching' | 'done' | 'error';

const DEFAULT_SETTINGS: ReaderSettings = {
    flow: 'paginated',
    theme: 'dark',
    fontSize: 100,
    lineSpacing: 1.5,
    margin: 32,
    autoFitIllustrations: true,
    fixedZoom: 'fit-page',
};
const READER_SETTINGS_KEY = 'bihon_epub_reader_settings';
const READER_BACKGROUNDS: Record<ReaderTheme, string> = {
    dark: '#171717',
    sepia: '#f4ecd8',
    light: '#ffffff',
};
const clamp = (value: unknown, min: number, max: number, fallback: number) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};
const loadSettings = (): ReaderSettings => {
    try {
        const stored = JSON.parse(localStorage.getItem(READER_SETTINGS_KEY) ?? '{}') as Partial<ReaderSettings>;
        return {
            flow: stored.flow === 'scrolled' ? 'scrolled' : 'paginated',
            theme: ['light', 'dark', 'sepia'].includes(String(stored.theme))
                ? (stored.theme as ReaderTheme)
                : DEFAULT_SETTINGS.theme,
            fontSize: clamp(stored.fontSize, 75, 180, DEFAULT_SETTINGS.fontSize),
            lineSpacing: clamp(stored.lineSpacing, 1.1, 2.2, DEFAULT_SETTINGS.lineSpacing),
            margin: clamp(stored.margin, 8, 80, DEFAULT_SETTINGS.margin),
            autoFitIllustrations: stored.autoFitIllustrations !== false,
            fixedZoom: ['fit-page', 'fit-width', '1'].includes(String(stored.fixedZoom))
                ? (stored.fixedZoom as FixedZoom)
                : DEFAULT_SETTINGS.fixedZoom,
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
};
const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
const selectionColors = (theme: ReaderTheme) => {
    if (theme === 'sepia') {
        return { background: 'rgba(201, 145, 55, .42)', foreground: '#241a0f' };
    }
    if (theme === 'light') {
        return { background: 'rgba(124, 77, 255, .30)', foreground: '#17121f' };
    }
    return { background: 'rgba(179, 136, 255, .42)', foreground: '#ffffff' };
};
const themeColors = (theme: ReaderTheme) => {
    if (theme === 'dark') {
        return ['#171717', '#eeeeee', '#bca7ff'];
    }
    if (theme === 'sepia') {
        return ['#f4ecd8', '#433422', '#7a4e16'];
    }
    return ['#ffffff', '#181818', '#6240b8'];
};
const readerCss = (settings: ReaderSettings) => {
    const colors = themeColors(settings.theme);
    const selection = selectionColors(settings.theme);
    return `
        html, body { background: ${colors[0]} !important; color: ${colors[1]} !important; }
        body { font-size: ${settings.fontSize}% !important; }
        :where(p, li, blockquote, dd) { line-height: ${settings.lineSpacing} !important; }
        :where(a:link, a:visited) { color: ${colors[2]} !important; }
        ::selection { background: ${selection.background} !important; color: ${selection.foreground} !important; }
        html.bihon-illustration-page, html.bihon-illustration-page body {
            box-sizing: border-box !important; width: 100% !important; height: 100% !important;
            min-height: 100% !important; margin: 0 !important; padding: 0 !important;
        }
        html.bihon-illustration-page body > .bihon-illustration-container {
            box-sizing: border-box !important; display: grid !important; place-items: center !important;
            width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important;
            break-inside: avoid !important; page-break-inside: avoid !important;
        }
        html.bihon-illustration-page .bihon-dominant-illustration {
            display: block !important; width: 100% !important; height: 100% !important;
            max-width: 100% !important; max-height: 100% !important; margin: auto !important;
            object-fit: contain !important;
        }
        pre { white-space: pre-wrap !important; }
        script { display: none !important; }
    `;
};
const mediaDimensions = (element: Element) => {
    if (element.localName.toLowerCase() === 'img') {
        const image = element as HTMLImageElement;
        return { width: image.naturalWidth, height: image.naturalHeight };
    }
    const viewBox = element.getAttribute('viewBox')?.split(/[ ,]+/).map(Number);
    return viewBox?.length === 4
        ? { width: viewBox[2] ?? 0, height: viewBox[3] ?? 0 }
        : { width: Number(element.getAttribute('width')) || 0, height: Number(element.getAttribute('height')) || 0 };
};
const configureIllustration = (document: Document, enabled: boolean) => {
    document.documentElement.classList.remove('bihon-illustration-page');
    for (const element of document.querySelectorAll('.bihon-dominant-illustration, .bihon-illustration-container')) {
        element.classList.remove('bihon-dominant-illustration', 'bihon-illustration-container');
    }
    if (!enabled || (document.body.innerText ?? '').replaceAll(/\s+/g, ' ').trim().length > 220) {
        return false;
    }
    const [media] = Array.from(document.body.querySelectorAll('img, svg'))
        .map((element) => ({ element, ...mediaDimensions(element) }))
        .sort((a, b) => b.width * b.height - a.width * a.height);
    if (!media || media.width * media.height < 120_000 || Math.max(media.width, media.height) < 500) {
        return false;
    }
    let container = media.element;
    while (container.parentElement && container.parentElement !== document.body) {
        container = container.parentElement;
    }
    document.documentElement.classList.add('bihon-illustration-page');
    container.classList.add('bihon-illustration-container');
    media.element.classList.add('bihon-dominant-illustration');
    return true;
};
const drawSearchHighlight = (rects: DOMRectList | DOMRect[]) => {
    const group = Overlayer.highlight(rects, { color: '#f6b73c' });
    group.style.opacity = '.34';
    return group;
};
const drawActiveHighlight = (rects: DOMRectList | DOMRect[]) => {
    const group = Overlayer.highlight(rects, { color: '#a879ff' });
    group.style.opacity = '.62';
    return group;
};
const isEditable = (target: EventTarget | null) => {
    const element = target as HTMLElement | null;
    const tagName = element?.tagName?.toLowerCase();
    return (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        element?.getAttribute?.('contenteditable') === 'true' ||
        !!element?.closest?.('[contenteditable="true"]') ||
        !!element?.isContentEditable
    );
};
const flattenToc = (items: FoliateTOCItem[] | null | undefined, depth = 0): { item: FoliateTOCItem; depth: number }[] =>
    (items ?? []).flatMap((item) => [{ item, depth }, ...flattenToc(item.subitems, depth + 1)]);

const edgeButtonStyles = (side: 'left' | 'right') => ({
    position: 'absolute',
    [side]: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
    width: 'clamp(48px, 7vw, 104px)',
    border: 0,
    p: 0,
    color: 'text.primary',
    bgcolor: 'transparent',
    cursor: 'pointer',
    '& svg': { opacity: 0, transition: 'opacity 150ms ease' },
    '&:hover': { bgcolor: 'rgba(127, 90, 240, .08)' },
    '&:hover svg, &:focus-visible svg': { opacity: 0.8 },
    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
});

const getLocationLabel = (location: FoliateLocation) => {
    if (location.pageItem?.label) {
        return `Page ${location.pageItem.label}`;
    }
    if (location.location?.current && location.location.total) {
        return `Location ${location.location.current} of ${location.location.total}`;
    }
    return '';
};

const getPanelTitle = (panel: Exclude<ReaderPanel, null>) => {
    if (panel === 'contents') {
        return 'Contents';
    }
    if (panel === 'search') {
        return 'Find in book';
    }
    return 'Appearance';
};

export function BookReader() {
    const { bookId = '' } = useParams();
    const navigate = useNavigate();
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<View | null>(null);
    const saveTimer = useRef<number | undefined>(undefined);
    const settingsRef = useRef<ReaderSettings>(DEFAULT_SETTINGS);
    const panelRef = useRef<ReaderPanel>(null);
    const focusModeRef = useRef(false);
    const illustrationRef = useRef(false);
    const searchRun = useRef(0);
    const activeAnnotation = useRef<{ value: string; kind: string } | undefined>(undefined);
    const searchInput = useRef<HTMLInputElement>(null);
    const keyHandler = useRef<(event: KeyboardEvent) => void>(() => {});
    const [book, setBook] = useState<BookRecord>();
    const [ready, setReady] = useState(false);
    const [fixedLayout, setFixedLayout] = useState(false);
    const [panel, setPanel] = useState<ReaderPanel>(null);
    const [focusMode, setFocusMode] = useState(false);
    const [settings, setSettings] = useState(loadSettings);
    const [location, setLocation] = useState<FoliateLocation>({ fraction: 0 });
    const [seekValue, setSeekValue] = useState<number>();
    const [search, setSearch] = useState('');
    const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
    const [searchProgress, setSearchProgress] = useState(0);
    const [searchState, setSearchState] = useState<SearchState>('idle');
    const [searchError, setSearchError] = useState('');
    const [activeHit, setActiveHit] = useState(-1);
    settingsRef.current = settings;
    panelRef.current = panel;
    focusModeRef.current = focusMode;

    const updateSettings = useCallback((update: Partial<ReaderSettings>) => {
        setSettings((current) => ({ ...current, ...update }));
    }, []);
    const applyReaderSettings = useCallback((element: View | null, current: ReaderSettings) => {
        const renderer = element?.renderer;
        if (!renderer) {
            return;
        }
        if (element.isFixedLayout) {
            renderer.setAttribute('zoom', current.fixedZoom);
            return;
        }
        renderer.setAttribute('flow', current.flow);
        renderer.setAttribute('margin', `${current.margin}px`);
        renderer.setAttribute('gap', `${Math.max(2, current.margin / 8)}%`);
        const fitIllustration = current.autoFitIllustrations && illustrationRef.current;
        renderer.setAttribute('max-column-count', fitIllustration ? '1' : '2');
        renderer.setAttribute('max-inline-size', fitIllustration ? '1600px' : '720px');
        renderer.setStyles?.(readerCss(current));
    }, []);
    const navigateSafely = useCallback((action: () => Promise<void>) => {
        void action().catch(defaultPromiseErrorHandler('BookReader::navigate'));
    }, []);
    const closeOrExit = useCallback(() => {
        if (panelRef.current) {
            setPanel(null);
        } else if (focusModeRef.current) {
            setFocusMode(false);
        } else {
            navigate(AppRoutes.books.path);
        }
    }, [navigate]);
    const goLeft = useCallback(() => {
        if (view.current) {
            navigateSafely(() => view.current!.goLeft());
        }
    }, [navigateSafely]);
    const goRight = useCallback(() => {
        if (view.current) {
            navigateSafely(() => view.current!.goRight());
        }
    }, [navigateSafely]);
    const goPrevious = useCallback(() => {
        if (view.current) {
            navigateSafely(() => view.current!.prev());
        }
    }, [navigateSafely]);
    const goNext = useCallback(() => {
        if (view.current) {
            navigateSafely(() => view.current!.next());
        }
    }, [navigateSafely]);

    keyHandler.current = (event) => {
        if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
            event.preventDefault();
            setFocusMode(false);
            setPanel('search');
            return;
        }
        if (event.key === 'Escape') {
            if (panelRef.current || !isEditable(event.target)) {
                event.preventDefault();
                closeOrExit();
            }
            return;
        }
        if (panelRef.current || isEditable(event.target) || event.ctrlKey || event.metaKey || event.altKey) {
            return;
        }
        const key = event.key.toLowerCase();
        if (key === 'arrowleft' || key === 'a') {
            event.preventDefault();
            goLeft();
        } else if (key === 'arrowright' || key === 'd') {
            event.preventDefault();
            goRight();
        } else if (key === 'pageup' || (key === ' ' && event.shiftKey)) {
            event.preventDefault();
            goPrevious();
        } else if (key === 'pagedown' || key === ' ') {
            event.preventDefault();
            goNext();
        }
    };

    useEffect(() => {
        let disposed = false;
        const element = new View();
        view.current = element;
        host.current?.append(element);
        const onKeyDown = (event: KeyboardEvent) => keyHandler.current(event);
        const onLoad = (event: Event) => {
            const document = (event as CustomEvent<{ doc: Document }>).detail.doc;
            document.addEventListener('keydown', onKeyDown);
            illustrationRef.current = configureIllustration(document, settingsRef.current.autoFitIllustrations);
            applyReaderSettings(element, settingsRef.current);
        };
        const onRelocate = (event: Event) => {
            const nextLocation = (event as CustomEvent<FoliateLocation>).detail;
            setLocation(nextLocation);
            setSeekValue(undefined);
            window.clearTimeout(saveTimer.current);
            saveTimer.current = window.setTimeout(
                () =>
                    void window.bihon!.books.saveProgress(bookId, {
                        cfi: nextLocation.cfi,
                        fraction: nextLocation.fraction ?? 0,
                    }),
                500,
            );
        };
        const onDrawAnnotation = (event: Event) => {
            const { detail } = event as CustomEvent<{
                draw: (fn: typeof drawActiveHighlight) => void;
                annotation: { kind?: string };
            }>;
            if (detail.annotation.kind === 'bihon-active-search') {
                detail.draw(drawActiveHighlight);
            }
        };
        const open = async () => {
            const record = (await window.bihon!.books.list()).find((item) => item.id === bookId);
            if (!record) {
                throw new Error('Book not found.');
            }
            setBook(record);
            setLocation({ fraction: record.progress.fraction });
            await element.open(`bihon-book://library/book/${bookId}`);
            if (disposed) {
                return;
            }
            setFixedLayout(element.isFixedLayout);
            applyReaderSettings(element, settingsRef.current);
            element.addEventListener('load', onLoad);
            element.addEventListener('relocate', onRelocate);
            element.addEventListener('draw-annotation', onDrawAnnotation);
            element.addEventListener('external-link', (event) => event.preventDefault());
            await element.init({ lastLocation: record.progress.cfi, showTextStart: !record.progress.cfi });
            if (disposed) {
                return;
            }
            setReady(true);
            const metadata = element.book.metadata ?? {};
            const cover = await element.book.getCover?.();
            const finalized = await window.bihon!.books.finalize(bookId, {
                title: formatTitle(metadata.title),
                authors: formatContributor(metadata.author),
                language: metadata.language,
                description: formatTitle(metadata.description),
                coverDataUrl: cover && !record.coverFile ? await blobToDataUrl(cover) : undefined,
            });
            setBook(finalized);
        };
        void open().catch(defaultPromiseErrorHandler('BookReader::open'));
        return () => {
            disposed = true;
            searchRun.current += 1;
            window.clearTimeout(saveTimer.current);
            element.clearSearch();
            element.close();
            element.remove();
            view.current = null;
        };
    }, [applyReaderSettings, bookId]);
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => keyHandler.current(event);
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);
    useEffect(() => {
        localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(settings));
        const element = view.current;
        const document = element?.renderer?.getContents?.()[0]?.doc;
        if (document && !element.isFixedLayout) {
            illustrationRef.current = configureIllustration(document, settings.autoFitIllustrations);
        }
        applyReaderSettings(element, settings);
    }, [applyReaderSettings, settings]);
    useEffect(() => {
        if (panel === 'search') {
            requestAnimationFrame(() => searchInput.current?.focus());
        }
    }, [panel]);

    const removeActiveHighlight = useCallback(async () => {
        if (activeAnnotation.current && view.current) {
            await view.current.deleteAnnotation(activeAnnotation.current);
            activeAnnotation.current = undefined;
        }
    }, []);
    const clearSearch = useCallback(() => {
        searchRun.current += 1;
        setSearchState('idle');
        setSearchProgress(0);
        setSearchResults([]);
        setActiveHit(-1);
        setSearchError('');
        void removeActiveHighlight().catch(defaultPromiseErrorHandler('BookReader::clearSearchHighlight'));
        view.current?.clearSearch();
    }, [removeActiveHighlight]);
    const runSearch = useCallback(async () => {
        const element = view.current;
        const query = search.trim();
        if (!query || !element) {
            clearSearch();
            return;
        }
        const run = ++searchRun.current;
        await removeActiveHighlight();
        setSearchResults([]);
        setActiveHit(-1);
        setSearchProgress(0);
        setSearchError('');
        setSearchState('searching');
        try {
            const hits: SearchHit[] = [];
            for await (const result of element.search({ query, draw: drawSearchHighlight })) {
                if (searchRun.current !== run) {
                    break;
                }
                if (typeof result === 'object' && result) {
                    if ('progress' in result) {
                        setSearchProgress(result.progress);
                    } else if ('subitems' in result) {
                        const next = result.subitems.map((item) => ({ ...item, label: result.label || 'Section' }));
                        hits.push(...next);
                        setSearchResults([...hits]);
                    }
                }
            }
            if (searchRun.current === run) {
                setSearchProgress(1);
                setSearchState('done');
            }
        } catch (error) {
            if (searchRun.current === run) {
                setSearchError(error instanceof Error ? error.message : String(error));
                setSearchState('error');
            }
        }
    }, [clearSearch, removeActiveHighlight, search]);
    const openSearchHit = useCallback(
        async (index: number) => {
            const element = view.current;
            const hit = searchResults[index];
            if (!element || !hit) {
                return;
            }
            await removeActiveHighlight();
            await element.goTo(hit.cfi);
            const annotation = { value: hit.cfi, kind: 'bihon-active-search' };
            activeAnnotation.current = annotation;
            await element.addAnnotation(annotation);
            setActiveHit(index);
        },
        [removeActiveHighlight, searchResults],
    );
    const stepSearchHit = (direction: -1 | 1) => {
        if (!searchResults.length) {
            return;
        }
        let index = activeHit + direction;
        if (activeHit < 0) {
            index = direction > 0 ? 0 : searchResults.length - 1;
        }
        void openSearchHit((index + searchResults.length) % searchResults.length);
    };
    const toc = useMemo(() => flattenToc(view.current?.book?.toc), [book, ready]);
    const percent = Math.round((seekValue ?? location.fraction ?? 0) * 100);
    const locationLabel = getLocationLabel(location);
    const panelTitle = panel ? getPanelTitle(panel) : '';

    return (
        <Box
            sx={{
                position: 'fixed',
                inset: 0,
                zIndex: (muiTheme) => muiTheme.zIndex.drawer,
                bgcolor: READER_BACKGROUNDS[settings.theme],
                color: settings.theme === 'dark' ? '#eee' : '#222',
                display: 'flex',
                flexDirection: 'column',
                '--reader-header-height': '64px',
            }}
        >
            {!focusMode && (
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                        minHeight: 'var(--reader-header-height)',
                        px: 1.5,
                        bgcolor: 'background.paper',
                        color: 'text.primary',
                        alignItems: 'center',
                        zIndex: 4,
                    }}
                >
                    <Tooltip title="Close reader (Esc)">
                        <IconButton aria-label="Close reader" onClick={() => navigate(AppRoutes.books.path)}>
                            <CloseIcon />
                        </IconButton>
                    </Tooltip>
                    <Typography noWrap sx={{ minWidth: 0, flex: 1, fontWeight: 600 }}>
                        {book?.title ?? 'Opening EPUB…'}
                    </Typography>
                    <Tooltip title="Contents">
                        <IconButton
                            aria-label="Contents"
                            color={panel === 'contents' ? 'primary' : 'default'}
                            onClick={() => setPanel(panel === 'contents' ? null : 'contents')}
                        >
                            <MenuBookIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Find in book (Ctrl+F)">
                        <IconButton
                            aria-label="Find in book"
                            color={panel === 'search' ? 'primary' : 'default'}
                            onClick={() => setPanel(panel === 'search' ? null : 'search')}
                        >
                            <SearchIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Appearance">
                        <IconButton
                            aria-label="Appearance"
                            color={panel === 'appearance' ? 'primary' : 'default'}
                            onClick={() => setPanel(panel === 'appearance' ? null : 'appearance')}
                        >
                            <TuneIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Focus mode (Esc to exit)">
                        <IconButton aria-label="Enter focus mode" onClick={() => setFocusMode(true)}>
                            <CenterFocusStrongIcon />
                        </IconButton>
                    </Tooltip>
                </Stack>
            )}

            <Box sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
                <Box
                    ref={host}
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        '& > foliate-view': { display: 'block', width: '100%', height: '100%' },
                    }}
                />
                {ready && (fixedLayout || settings.flow === 'paginated') && !panel && (
                    <>
                        <Box
                            component="button"
                            type="button"
                            aria-label="Turn page left"
                            onClick={goLeft}
                            sx={edgeButtonStyles('left')}
                        >
                            <ArrowBackIcon />
                        </Box>
                        <Box
                            component="button"
                            type="button"
                            aria-label="Turn page right"
                            onClick={goRight}
                            sx={edgeButtonStyles('right')}
                        >
                            <ArrowForwardIcon />
                        </Box>
                    </>
                )}
            </Box>

            {!focusMode && (
                <Stack
                    direction="row"
                    spacing={1.5}
                    sx={{
                        minHeight: 58,
                        px: 1.5,
                        bgcolor: 'background.paper',
                        color: 'text.primary',
                        alignItems: 'center',
                        zIndex: 4,
                    }}
                >
                    <Button size="small" startIcon={<ArrowBackIcon />} onClick={goPrevious} disabled={!ready}>
                        Previous
                    </Button>
                    <Stack spacing={0} sx={{ flex: 1, minWidth: 120 }}>
                        <Slider
                            size="small"
                            aria-label="Book progress"
                            value={(seekValue ?? location.fraction ?? 0) * 100}
                            min={0}
                            max={100}
                            onChange={(_, value) => setSeekValue((value as number) / 100)}
                            onChangeCommitted={(_, value) => {
                                const element = view.current;
                                if (element) {
                                    navigateSafely(() => element.goToFraction((value as number) / 100));
                                }
                            }}
                        />
                        <Typography variant="caption" noWrap sx={{ textAlign: 'center', mt: -0.75 }}>
                            {[location.tocItem?.label, locationLabel, `${percent}%`].filter(Boolean).join(' · ')}
                        </Typography>
                    </Stack>
                    <Button size="small" endIcon={<ArrowForwardIcon />} onClick={goNext} disabled={!ready}>
                        Next
                    </Button>
                </Stack>
            )}

            {panel && (
                <>
                    <Box
                        aria-hidden="true"
                        onClick={() => setPanel(null)}
                        sx={{
                            position: 'absolute',
                            inset: 'var(--reader-header-height) 0 0',
                            zIndex: 5,
                            bgcolor: 'rgba(0,0,0,.32)',
                        }}
                    />
                    <Box
                        role="dialog"
                        aria-label={panelTitle}
                        sx={{
                            position: 'absolute',
                            top: 'var(--reader-header-height)',
                            right: 0,
                            bottom: 0,
                            zIndex: 6,
                            width: { xs: '100%', sm: 420 },
                            maxWidth: '100%',
                            bgcolor: 'background.paper',
                            color: 'text.primary',
                            boxShadow: 12,
                            overflow: 'auto',
                        }}
                    >
                        <Stack
                            direction="row"
                            sx={{
                                position: 'sticky',
                                top: 0,
                                zIndex: 1,
                                p: 2,
                                bgcolor: 'background.paper',
                                alignItems: 'center',
                            }}
                        >
                            <Typography variant="h6" sx={{ flex: 1 }}>
                                {panelTitle}
                            </Typography>
                            <IconButton aria-label={`Close ${panelTitle}`} onClick={() => setPanel(null)}>
                                <CloseIcon />
                            </IconButton>
                        </Stack>
                        <Divider />
                        {panel === 'contents' && (
                            <Stack sx={{ p: 1 }}>
                                {toc.length ? (
                                    toc.map(({ item, depth }) => (
                                        <Button
                                            key={`${item.href}-${item.label}-${depth}`}
                                            disabled={!item.href}
                                            variant={location.tocItem?.href === item.href ? 'contained' : 'text'}
                                            sx={{ justifyContent: 'flex-start', textAlign: 'left', pl: 2 + depth * 2 }}
                                            onClick={() =>
                                                item.href && navigateSafely(() => view.current!.goTo(item.href!))
                                            }
                                        >
                                            {item.label || 'Section'}
                                        </Button>
                                    ))
                                ) : (
                                    <Typography color="text.secondary" sx={{ p: 2 }}>
                                        This book does not provide a table of contents.
                                    </Typography>
                                )}
                            </Stack>
                        )}
                        {panel === 'search' && (
                            <Stack spacing={2} sx={{ p: 2 }}>
                                <TextField
                                    inputRef={searchInput}
                                    label="Find in book"
                                    value={search}
                                    onChange={(event) => {
                                        const { value } = event.target;
                                        setSearch(value);
                                        if (!value) {
                                            clearSearch();
                                        }
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            void runSearch();
                                        }
                                    }}
                                    slotProps={{
                                        input: {
                                            endAdornment: (
                                                <Stack direction="row">
                                                    {!!search && (
                                                        <IconButton
                                                            aria-label="Clear search"
                                                            onClick={() => {
                                                                setSearch('');
                                                                clearSearch();
                                                            }}
                                                        >
                                                            <ClearIcon />
                                                        </IconButton>
                                                    )}
                                                    <IconButton
                                                        aria-label="Start search"
                                                        onClick={() => void runSearch()}
                                                    >
                                                        <SearchIcon />
                                                    </IconButton>
                                                </Stack>
                                            ),
                                        },
                                    }}
                                />
                                {searchState === 'searching' && (
                                    <Stack spacing={0.5}>
                                        <LinearProgress variant="determinate" value={searchProgress * 100} />
                                        <Stack direction="row" sx={{ alignItems: 'center' }}>
                                            <Typography variant="caption" sx={{ flex: 1 }}>
                                                Searching… {Math.round(searchProgress * 100)}% · {searchResults.length}{' '}
                                                matches
                                            </Typography>
                                            <Button
                                                size="small"
                                                onClick={() => {
                                                    searchRun.current += 1;
                                                    setSearchState('idle');
                                                }}
                                            >
                                                Cancel
                                            </Button>
                                        </Stack>
                                    </Stack>
                                )}
                                {searchState === 'error' && <Typography color="error">{searchError}</Typography>}
                                {searchState === 'done' && !searchResults.length && (
                                    <Typography color="text.secondary">No matches found.</Typography>
                                )}
                                {!!searchResults.length && (
                                    <Stack direction="row" sx={{ alignItems: 'center' }}>
                                        <Typography sx={{ flex: 1 }}>
                                            {searchResults.length} matches
                                            {activeHit >= 0 ? ` · ${activeHit + 1} of ${searchResults.length}` : ''}
                                        </Typography>
                                        <IconButton aria-label="Previous match" onClick={() => stepSearchHit(-1)}>
                                            <ArrowBackIcon />
                                        </IconButton>
                                        <IconButton aria-label="Next match" onClick={() => stepSearchHit(1)}>
                                            <ArrowForwardIcon />
                                        </IconButton>
                                    </Stack>
                                )}
                                <Stack spacing={0.5}>
                                    {searchResults.map((result, index) => {
                                        const showLabel =
                                            index === 0 || searchResults[index - 1]?.label !== result.label;
                                        return (
                                            <Fragment key={result.cfi}>
                                                {showLabel && (
                                                    <Typography
                                                        variant="overline"
                                                        color="text.secondary"
                                                        sx={{ pt: index ? 1.5 : 0 }}
                                                    >
                                                        {result.label}
                                                    </Typography>
                                                )}
                                                <Button
                                                    variant={activeHit === index ? 'outlined' : 'text'}
                                                    onClick={() => void openSearchHit(index)}
                                                    sx={{
                                                        justifyContent: 'flex-start',
                                                        textAlign: 'left',
                                                        textTransform: 'none',
                                                    }}
                                                >
                                                    <Typography variant="body2">
                                                        {result.excerpt.pre}
                                                        <Box
                                                            component="mark"
                                                            sx={{
                                                                bgcolor: 'rgba(246,183,60,.38)',
                                                                color: 'inherit',
                                                                borderRadius: 0.5,
                                                                px: 0.25,
                                                            }}
                                                        >
                                                            {result.excerpt.match}
                                                        </Box>
                                                        {result.excerpt.post}
                                                    </Typography>
                                                </Button>
                                            </Fragment>
                                        );
                                    })}
                                </Stack>
                            </Stack>
                        )}
                        {panel === 'appearance' && (
                            <Stack spacing={3} sx={{ p: 2 }}>
                                <SettingGroup label="Theme">
                                    <ToggleButtonGroup
                                        exclusive
                                        fullWidth
                                        size="small"
                                        value={settings.theme}
                                        onChange={(_, value: ReaderTheme | null) =>
                                            value && updateSettings({ theme: value })
                                        }
                                    >
                                        <ToggleButton value="light">Light</ToggleButton>
                                        <ToggleButton value="dark">Dark</ToggleButton>
                                        <ToggleButton value="sepia">Sepia</ToggleButton>
                                    </ToggleButtonGroup>
                                </SettingGroup>
                                {fixedLayout ? (
                                    <SettingGroup label="Page zoom">
                                        <ToggleButtonGroup
                                            exclusive
                                            fullWidth
                                            size="small"
                                            value={settings.fixedZoom}
                                            onChange={(_, value: FixedZoom | null) =>
                                                value && updateSettings({ fixedZoom: value })
                                            }
                                        >
                                            <ToggleButton value="fit-page">Fit page</ToggleButton>
                                            <ToggleButton value="fit-width">Fit width</ToggleButton>
                                            <ToggleButton value="1">100%</ToggleButton>
                                        </ToggleButtonGroup>
                                    </SettingGroup>
                                ) : (
                                    <>
                                        <SettingGroup label="Layout">
                                            <ToggleButtonGroup
                                                exclusive
                                                fullWidth
                                                size="small"
                                                value={settings.flow}
                                                onChange={(_, value: ReaderFlow | null) =>
                                                    value && updateSettings({ flow: value })
                                                }
                                            >
                                                <ToggleButton value="paginated">Pages</ToggleButton>
                                                <ToggleButton value="scrolled">Scroll</ToggleButton>
                                            </ToggleButtonGroup>
                                        </SettingGroup>
                                        <SettingSlider
                                            label="Text size"
                                            value={settings.fontSize}
                                            min={75}
                                            max={180}
                                            valueLabel={`${settings.fontSize}%`}
                                            onChange={(fontSize) => updateSettings({ fontSize })}
                                        />
                                        <SettingSlider
                                            label="Line spacing"
                                            value={settings.lineSpacing}
                                            min={1.1}
                                            max={2.2}
                                            step={0.1}
                                            valueLabel={settings.lineSpacing.toFixed(1)}
                                            onChange={(lineSpacing) => updateSettings({ lineSpacing })}
                                        />
                                        <SettingSlider
                                            label="Page margin"
                                            value={settings.margin}
                                            min={8}
                                            max={80}
                                            valueLabel={`${settings.margin}px`}
                                            onChange={(margin) => updateSettings({ margin })}
                                        />
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={settings.autoFitIllustrations}
                                                    onChange={(event) =>
                                                        updateSettings({ autoFitIllustrations: event.target.checked })
                                                    }
                                                />
                                            }
                                            label="Fit illustrated pages to the screen"
                                        />
                                    </>
                                )}
                                <Button startIcon={<RestartAltIcon />} onClick={() => setSettings(DEFAULT_SETTINGS)}>
                                    Reset appearance
                                </Button>
                            </Stack>
                        )}
                    </Box>
                </>
            )}
            {!ready && (
                <Stack
                    spacing={2}
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 8,
                        bgcolor: 'background.default',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <CircularProgress />
                    <Typography>Opening EPUB…</Typography>
                </Stack>
            )}
        </Box>
    );
}

function SettingGroup({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Stack spacing={1}>
            <Typography variant="subtitle2">{label}</Typography>
            {children}
        </Stack>
    );
}

function SettingSlider({
    label,
    value,
    min,
    max,
    step = 1,
    valueLabel,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    valueLabel: string;
    onChange: (value: number) => void;
}) {
    return (
        <Stack spacing={0.5}>
            <Stack direction="row">
                <Typography variant="subtitle2" sx={{ flex: 1 }}>
                    {label}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {valueLabel}
                </Typography>
            </Stack>
            <Slider
                aria-label={label}
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(_, next) => onChange(next as number)}
            />
        </Stack>
    );
}
