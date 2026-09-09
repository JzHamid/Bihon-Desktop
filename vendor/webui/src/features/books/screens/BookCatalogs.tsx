/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { makeSearchUrl, parseOpds, type OpdsFeed } from '@/features/books/Books.util.ts';

function CatalogCover({ catalogId, url, title }: { catalogId: string; url: string; title: string }) {
    const [source, setSource] = useState<string>();
    useEffect(() => {
        let active = true;
        window
            .bihon!.catalogs.cover(catalogId, url)
            .then((value) => {
                if (active) {
                    setSource(value);
                }
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [catalogId, url]);
    return source ? (
        <CardMedia component="img" image={source} alt={`Cover of ${title}`} sx={{ height: 260, objectFit: 'cover' }} />
    ) : null;
}

export function BookCatalogs() {
    const [catalogs, setCatalogs] = useState<CatalogRecord[]>([]);
    const [selected, setSelected] = useState<CatalogRecord>();
    const [feed, setFeed] = useState<OpdsFeed>();
    const [feedUrl, setFeedUrl] = useState<string>();
    const [query, setQuery] = useState('');
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [allowInsecure, setAllowInsecure] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    useAppTitle('Discover books');
    const refresh = async () => setCatalogs(await window.bihon!.catalogs.list());
    useEffect(() => {
        void refresh();
    }, []);
    const open = async (catalog: CatalogRecord, target?: string) => {
        setLoading(true);
        setError('');
        setNotice('');
        try {
            const response = await window.bihon!.catalogs.fetch(catalog.id, target);
            setSelected(catalog);
            setFeed(parseOpds(response.body, response.contentType, response.finalUrl));
            setFeedUrl(response.finalUrl);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setLoading(false);
        }
    };
    const add = async () => {
        try {
            const catalog = await window.bihon!.catalogs.add({ name, url, allowInsecure });
            setName('');
            setUrl('');
            await refresh();
            await open(catalog);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    };
    const searchCatalog = () => {
        if (!selected || !query.trim()) {
            return;
        }
        const template = selected.builtIn ? selected.url : (feed?.search ?? selected.url);
        void open(selected, makeSearchUrl(template, query));
    };
    const acquire = async (acquisition: string, title: string) => {
        if (!selected) {
            return;
        }
        setLoading(true);
        setError('');
        setNotice('');
        try {
            const [record] = await window.bihon!.catalogs.acquire(selected.id, acquisition);
            setNotice(record?.duplicate ? `${title} is already in Books.` : `${title} was added to Books.`);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setLoading(false);
        }
    };
    return (
        <Stack spacing={2} sx={{ p: 2 }}>
            <Typography color="text.secondary">
                Browse public-domain and openly licensed EPUBs through OPDS 1.2 or 2.0. Bihon does not bypass DRM or
                provide storefront downloads.
            </Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <TextField
                    size="small"
                    label="Catalog name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                />
                <TextField
                    size="small"
                    label="OPDS URL"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    fullWidth
                />
                <FormControlLabel
                    control={<Checkbox checked={allowInsecure} onChange={(_, checked) => setAllowInsecure(checked)} />}
                    label="Allow local HTTP (unsafe)"
                />
                <Button startIcon={<AddIcon />} variant="outlined" onClick={() => void add()}>
                    Add
                </Button>
            </Stack>
            {error && <Typography color="error">{error}</Typography>}
            {notice && <Typography color="success.main">{notice}</Typography>}
            <Stack direction="row" spacing={1} sx={{ overflowX: 'auto' }}>
                {catalogs.map((catalog) => (
                    <Stack key={catalog.id} direction="row" sx={{ alignItems: 'center' }}>
                        <Button
                            variant={catalog.id === selected?.id ? 'contained' : 'outlined'}
                            onClick={() => void open(catalog)}
                        >
                            {catalog.name}
                        </Button>
                        {!catalog.builtIn && (
                            <IconButton
                                size="small"
                                aria-label={`Remove ${catalog.name}`}
                                onClick={() => void window.bihon!.catalogs.remove(catalog.id).then(refresh)}
                            >
                                <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                        )}
                    </Stack>
                ))}
            </Stack>
            {selected && (
                <Stack direction="row" spacing={1}>
                    <TextField
                        size="small"
                        label={`Search ${selected.name}`}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                searchCatalog();
                            }
                        }}
                        fullWidth
                    />
                    <Button variant="contained" onClick={searchCatalog}>
                        Search
                    </Button>
                </Stack>
            )}
            {loading ? (
                <CircularProgress />
            ) : (
                feed &&
                selected && (
                    <>
                        <Typography variant="h5">{feed.title}</Typography>
                        <Box
                            sx={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                                gap: 2,
                            }}
                        >
                            {feed.publications.map((publication) => (
                                <Card key={`${publication.title}-${publication.acquisition}`}>
                                    {publication.cover && (
                                        <CatalogCover
                                            catalogId={selected.id}
                                            url={publication.cover}
                                            title={publication.title}
                                        />
                                    )}
                                    <CardContent>
                                        <Typography variant="h6">{publication.title}</Typography>
                                        <Typography color="text.secondary">
                                            {publication.authors.join(', ') || 'Unknown author'}
                                        </Typography>
                                        {publication.description && (
                                            <Typography variant="body2" sx={{ mt: 1 }} noWrap>
                                                {publication.description}
                                            </Typography>
                                        )}
                                        <Button
                                            sx={{ mt: 1 }}
                                            disabled={!publication.acquisition}
                                            onClick={() =>
                                                publication.acquisition &&
                                                void acquire(publication.acquisition, publication.title)
                                            }
                                        >
                                            Add to Books
                                        </Button>
                                    </CardContent>
                                </Card>
                            ))}
                        </Box>
                        {!!feed.navigation.length && (
                            <Stack spacing={1}>
                                <Typography variant="h6">Browse</Typography>
                                {feed.navigation.map((item) => (
                                    <Button
                                        key={item.href}
                                        endIcon={<ArrowForwardIcon />}
                                        onClick={() => void open(selected, item.href)}
                                        sx={{ justifyContent: 'space-between' }}
                                    >
                                        {item.title || item.href}
                                    </Button>
                                ))}
                            </Stack>
                        )}
                        {feed.next && <Button onClick={() => void open(selected, feed.next)}>Next page</Button>}
                        <Typography variant="caption" color="text.secondary">
                            {feedUrl}
                        </Typography>
                    </>
                )
            )}
        </Stack>
    );
}
