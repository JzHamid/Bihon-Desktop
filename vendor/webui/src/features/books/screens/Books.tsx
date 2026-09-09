/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import ExploreIcon from '@mui/icons-material/Explore';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { formatContributor, formatTitle } from '@/features/books/Books.util.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';

const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });

async function hydrateBook(record: BookRecord): Promise<void> {
    if (record.metadataReady || record.duplicate) {
        return;
    }
    const { makeBook } = await import('foliate-js/view.js');
    const publication = await makeBook(`bihon-book://library/book/${record.id}`);
    try {
        const metadata = publication.metadata ?? {};
        const cover = await publication.getCover?.();
        await window.bihon!.books.finalize(record.id, {
            title: formatTitle(metadata.title),
            authors: formatContributor(metadata.author),
            language: metadata.language,
            description: formatTitle(metadata.description),
            coverDataUrl: cover ? await blobToDataUrl(cover) : undefined,
        });
    } finally {
        publication.destroy?.();
    }
}

async function hydrateBooks(records: BookRecord[]): Promise<void> {
    await records.reduce(
        (chain, record) =>
            chain.then(() =>
                hydrateBook(record).catch(() => {
                    // Keep a valid imported EPUB on the shelf even when its package metadata is malformed.
                }),
            ),
        Promise.resolve(),
    );
}

export function Books() {
    const navigate = useNavigate();
    const [books, setBooks] = useState<BookRecord[]>([]);
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState('recent');
    const [loading, setLoading] = useState(true);
    useAppTitle('Books');
    const refresh = useCallback(async () => {
        const records = await window.bihon!.books.list();
        setBooks(records);
        setLoading(false);
        const pending = records.filter((book) => !book.metadataReady);
        if (pending.length) {
            await hydrateBooks(pending);
            setBooks(await window.bihon!.books.list());
        }
    }, []);
    useEffect(() => {
        refresh().catch(defaultPromiseErrorHandler('Books::refresh'));
    }, [refresh]);
    const visible = useMemo(
        () =>
            books
                .filter((book) => `${book.title} ${book.authors.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
                .sort((a, b) =>
                    sort === 'title'
                        ? a.title.localeCompare(b.title)
                        : Date.parse(b.progress.updatedAt || b.addedAt) - Date.parse(a.progress.updatedAt || a.addedAt),
                ),
        [books, query, sort],
    );
    const importBooks = async () => {
        const imported = await window.bihon!.books.import();
        await hydrateBooks(imported);
        await refresh();
    };
    const remove = async (id: string) => {
        if (await window.bihon!.books.remove(id)) {
            await refresh();
        }
    };
    let shelf;
    if (loading) {
        shelf = <CircularProgress />;
    } else if (!visible.length) {
        shelf = (
            <Box sx={{ py: 10, textAlign: 'center' }}>
                <Typography variant="h6">Your EPUB shelf is empty</Typography>
                <Typography color="text.secondary">
                    Import DRM-free books you own, or browse a legal OPDS catalog.
                </Typography>
            </Box>
        );
    } else {
        shelf = (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 2 }}>
                {visible.map((book) => (
                    <Card key={book.id} sx={{ position: 'relative' }}>
                        <CardActionArea onClick={() => navigate(AppRoutes.books.children.reader.path(book.id))}>
                            {book.coverFile ? (
                                <CardMedia
                                    component="img"
                                    image={`bihon-book://library/cover/${book.id}`}
                                    alt={`Cover of ${book.title}`}
                                    sx={{ aspectRatio: '2 / 3', objectFit: 'cover' }}
                                />
                            ) : (
                                <Box
                                    sx={{
                                        aspectRatio: '2 / 3',
                                        display: 'grid',
                                        placeItems: 'center',
                                        bgcolor: 'action.hover',
                                        px: 2,
                                    }}
                                >
                                    <Typography align="center" variant="h6">
                                        {book.title}
                                    </Typography>
                                </Box>
                            )}
                            <LinearProgress variant="determinate" value={book.progress.fraction * 100} />
                            <CardContent>
                                <Typography noWrap sx={{ fontWeight: 600 }}>
                                    {book.title}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" noWrap>
                                    {book.authors.join(', ') || 'Unknown author'}
                                </Typography>
                                <Typography variant="caption">
                                    {Math.round(book.progress.fraction * 100)}% read
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                        <IconButton
                            aria-label={`Remove ${book.title}`}
                            onClick={() => void remove(book.id)}
                            sx={{ position: 'absolute', right: 4, top: 4, bgcolor: 'background.paper' }}
                        >
                            <DeleteOutlineIcon />
                        </IconButton>
                    </Card>
                ))}
            </Box>
        );
    }
    return (
        <Stack spacing={2} sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                    label="Search owned books"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    fullWidth
                    size="small"
                />
                <TextField
                    select
                    label="Sort"
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                    size="small"
                    sx={{ minWidth: 150 }}
                >
                    <MenuItem value="recent">Recently read</MenuItem>
                    <MenuItem value="title">Title</MenuItem>
                </TextField>
                <Button
                    variant="outlined"
                    startIcon={<ExploreIcon />}
                    onClick={() => navigate(AppRoutes.books.children.catalogs.path)}
                    sx={{ height: 48, minWidth: { sm: 132 }, whiteSpace: 'nowrap' }}
                >
                    Discover
                </Button>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => void importBooks()}
                    sx={{ height: 48, minWidth: { sm: 152 }, whiteSpace: 'nowrap' }}
                >
                    Import EPUBs
                </Button>
            </Stack>
            {shelf}
        </Stack>
    );
}
