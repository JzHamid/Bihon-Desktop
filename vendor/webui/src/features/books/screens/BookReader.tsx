/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CloseIcon from '@mui/icons-material/Close';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { View } from 'foliate-js/view.js';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { formatContributor, formatTitle } from '@/features/books/Books.util.ts';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';

const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
const readerCss = (theme: string, fontSize: number, lineSpacing: number, margin: number) => {
    let colors = ['#ffffff', '#181818'];
    if (theme === 'dark') {
        colors = ['#171717', '#eeeeee'];
    } else if (theme === 'sepia') {
        colors = ['#f4ecd8', '#433422'];
    }
    return `html,body{background:${colors[0]}!important;color:${colors[1]}!important} body{font-size:${fontSize}%!important;line-height:${lineSpacing}!important;padding-left:${margin}px!important;padding-right:${margin}px!important} script{display:none!important}`;
};
type SearchHit = { cfi: string; excerpt: string };
const READER_SETTINGS_KEY = 'bihon_epub_reader_settings';
const READER_BACKGROUNDS: Record<string, string> = { dark: '#171717', sepia: '#f4ecd8', light: '#ffffff' };
const loadSettings = () => {
    try {
        return JSON.parse(localStorage.getItem(READER_SETTINGS_KEY) ?? '{}') as Record<string, unknown>;
    } catch {
        return {};
    }
};

export function BookReader() {
    const { bookId = '' } = useParams();
    const navigate = useNavigate();
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<View | null>(null);
    const saveTimer = useRef<number | undefined>(undefined);
    const [book, setBook] = useState<BookRecord>();
    const [tocOpen, setTocOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
    const [flow, setFlow] = useState(() => String(loadSettings().flow ?? 'paginated'));
    const [theme, setTheme] = useState(() => String(loadSettings().theme ?? 'dark'));
    const [fontSize, setFontSize] = useState(() => Number(loadSettings().fontSize ?? 100));
    const [lineSpacing, setLineSpacing] = useState(() => Number(loadSettings().lineSpacing ?? 1.5));
    const [margin, setMargin] = useState(() => Number(loadSettings().margin ?? 24));
    useEffect(() => {
        let disposed = false;
        const element = new View();
        view.current = element;
        host.current?.append(element);
        const open = async () => {
            const record = (await window.bihon!.books.list()).find((item) => item.id === bookId);
            if (!record) {
                throw new Error('Book not found.');
            }
            setBook(record);
            await element.open(`bihon-book://library/book/${bookId}`);
            if (disposed) {
                return;
            }
            element.renderer.setAttribute('flow', flow);
            element.renderer.setStyles?.(readerCss(theme, fontSize, lineSpacing, margin));
            element.addEventListener('external-link', (event) => event.preventDefault());
            element.addEventListener('relocate', ((event: CustomEvent) => {
                const location = event.detail;
                window.clearTimeout(saveTimer.current);
                saveTimer.current = window.setTimeout(
                    () =>
                        void window.bihon!.books.saveProgress(bookId, {
                            cfi: location.cfi,
                            fraction: location.fraction ?? 0,
                        }),
                    500,
                );
            }) as EventListener);
            await element.init({ lastLocation: record.progress.cfi, showTextStart: !record.progress.cfi });
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
            window.clearTimeout(saveTimer.current);
            element.close();
            element.remove();
            view.current = null;
        };
    }, [bookId]);
    useEffect(() => {
        view.current?.renderer.setAttribute('flow', flow);
        view.current?.renderer.setStyles?.(readerCss(theme, fontSize, lineSpacing, margin));
        localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify({ flow, theme, fontSize, lineSpacing, margin }));
    }, [flow, theme, fontSize, lineSpacing, margin]);
    useEffect(() => {
        const exit = (event: KeyboardEvent) => {
            if (
                event.key === 'Escape' &&
                !(
                    event.target instanceof HTMLInputElement ||
                    event.target instanceof HTMLTextAreaElement ||
                    (event.target as HTMLElement)?.isContentEditable
                )
            ) {
                navigate(AppRoutes.books.path);
            }
        };
        window.addEventListener('keydown', exit);
        return () => window.removeEventListener('keydown', exit);
    }, [navigate]);
    const runSearch = async () => {
        if (!search.trim() || !view.current) {
            return;
        }
        const hits: SearchHit[] = [];
        for await (const result of view.current.search({ query: search })) {
            if (typeof result === 'object' && result && 'subitems' in result) {
                for (const item of (result as { subitems: { cfi: string; excerpt: unknown }[] }).subitems) {
                    hits.push({
                        cfi: item.cfi,
                        excerpt: typeof item.excerpt === 'string' ? item.excerpt : JSON.stringify(item.excerpt),
                    });
                }
            }
        }
        setSearchResults(hits);
        setTocOpen(true);
    };
    return (
        <Box
            sx={{
                position: 'fixed',
                inset: 0,
                zIndex: (muiTheme) => muiTheme.zIndex.modal + 1,
                bgcolor: READER_BACKGROUNDS[theme] ?? READER_BACKGROUNDS.light,
                color: theme === 'dark' ? '#eee' : '#222',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <Stack
                direction="row"
                spacing={1}
                sx={{
                    p: 1,
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    overflowX: 'auto',
                    alignItems: 'center',
                }}
            >
                <Tooltip title="Close reader (Esc)">
                    <IconButton onClick={() => navigate(AppRoutes.books.path)}>
                        <CloseIcon />
                    </IconButton>
                </Tooltip>
                <Typography noWrap sx={{ minWidth: 140, flex: 1 }}>
                    {book?.title ?? 'Opening EPUB…'}
                </Typography>
                <Tooltip title="Table of contents">
                    <IconButton onClick={() => setTocOpen(true)}>
                        <MenuBookIcon />
                    </IconButton>
                </Tooltip>
                <TextField
                    size="small"
                    placeholder="Search in book"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            void runSearch();
                        }
                    }}
                    slotProps={{
                        input: {
                            endAdornment: (
                                <IconButton aria-label="Search in book" onClick={() => void runSearch()}>
                                    <SearchIcon />
                                </IconButton>
                            ),
                        },
                    }}
                    sx={{ minWidth: 180 }}
                />
                {!!searchResults.length && <Typography variant="caption">{searchResults.length} matches</Typography>}
                <TextField
                    select
                    size="small"
                    label="Layout"
                    value={flow}
                    onChange={(event) => setFlow(event.target.value)}
                >
                    <MenuItem value="paginated">Pages</MenuItem>
                    <MenuItem value="scrolled">Scroll</MenuItem>
                </TextField>
                <TextField
                    select
                    size="small"
                    label="Theme"
                    value={theme}
                    onChange={(event) => setTheme(event.target.value)}
                >
                    <MenuItem value="light">Light</MenuItem>
                    <MenuItem value="dark">Dark</MenuItem>
                    <MenuItem value="sepia">Sepia</MenuItem>
                </TextField>
                <Typography variant="caption">Text</Typography>
                <Slider
                    size="small"
                    value={fontSize}
                    min={75}
                    max={180}
                    onChange={(_, value) => setFontSize(value as number)}
                    sx={{ width: 90 }}
                />
                <Typography variant="caption">Spacing</Typography>
                <Slider
                    size="small"
                    value={lineSpacing}
                    min={1.1}
                    max={2.2}
                    step={0.1}
                    onChange={(_, value) => setLineSpacing(value as number)}
                    sx={{ width: 70 }}
                />
                <Typography variant="caption">Margins</Typography>
                <Slider
                    size="small"
                    value={margin}
                    min={0}
                    max={80}
                    onChange={(_, value) => setMargin(value as number)}
                    sx={{ width: 70 }}
                />
            </Stack>
            <Box
                ref={host}
                sx={{ flex: 1, minHeight: 0, '& > foliate-view': { display: 'block', width: '100%', height: '100%' } }}
            />
            <Stack direction="row" spacing={2} sx={{ p: 1, bgcolor: 'background.paper', justifyContent: 'center' }}>
                <Button startIcon={<ArrowBackIcon />} onClick={() => void view.current?.prev()}>
                    Previous
                </Button>
                <Button endIcon={<ArrowForwardIcon />} onClick={() => void view.current?.next()}>
                    Next
                </Button>
            </Stack>
            <Drawer open={tocOpen} onClose={() => setTocOpen(false)}>
                <Stack sx={{ width: 320, p: 2 }} spacing={1}>
                    <Typography variant="h6">Contents</Typography>
                    {!!searchResults.length && (
                        <>
                            <Typography variant="subtitle2">Search results</Typography>
                            {searchResults.map((result) => (
                                <Button
                                    key={result.cfi}
                                    sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
                                    onClick={() => {
                                        void view.current?.goTo(result.cfi);
                                        setTocOpen(false);
                                    }}
                                >
                                    {result.excerpt}
                                </Button>
                            ))}
                        </>
                    )}
                    {book &&
                        view.current?.book.toc?.map((item) => (
                            <Button
                                key={`${item.href}-${item.label}`}
                                sx={{ justifyContent: 'flex-start' }}
                                onClick={() => {
                                    if (item.href) {
                                        void view.current?.goTo(item.href);
                                    }
                                    setTocOpen(false);
                                }}
                            >
                                {item.label || 'Section'}
                            </Button>
                        ))}
                </Stack>
            </Drawer>
        </Box>
    );
}
