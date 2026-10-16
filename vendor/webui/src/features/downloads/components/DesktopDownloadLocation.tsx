/*
 * Copyright (C) Contributors to the Bihon project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';

export function DesktopDownloadLocation() {
    const [folder, setFolder] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [progress, setProgress] = useState<{ completed: number; total: number }>();

    useEffect(() => {
        let active = true;
        window
            .bihon!.downloadsInfo()
            .then(({ path }) => {
                if (active) setFolder(path);
            })
            .catch((cause) => {
                if (active) setError(getErrorMessage(cause));
            });
        const unsubscribe = window.bihon!.onProgress((value) => {
            if (active) setProgress(value);
        });
        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    const chooseFolder = async () => {
        setBusy(true);
        setError('');
        setProgress(undefined);
        try {
            const result = await window.bihon!.chooseDownloads();
            if (!result.canceled && result.path) setFolder(result.path);
        } catch (cause) {
            setError(getErrorMessage(cause));
        } finally {
            setBusy(false);
        }
    };

    return (
        <ListItem sx={{ display: 'block' }}>
            <ListItemText
                primary="Download folder"
                secondary={folder || 'Loading…'}
                slotProps={{ secondary: { sx: { overflowWrap: 'anywhere' } } }}
            />
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button variant="contained" disabled={busy || !folder} onClick={() => void chooseFolder()}>
                    Choose folder
                </Button>
                <Button
                    disabled={busy || !folder}
                    onClick={() => {
                        void window
                            .bihon!.openDownloads()
                            .then((message) => {
                                if (message) setError(message);
                            })
                            .catch((cause) => setError(getErrorMessage(cause)));
                    }}
                >
                    Open folder
                </Button>
            </Stack>
            {busy && progress && (
                <Stack spacing={1} sx={{ mt: 2 }} role="status">
                    <Typography variant="body2">
                        Moving downloads… {progress.completed}/{progress.total}
                    </Typography>
                    <LinearProgress
                        variant={progress.total ? 'determinate' : 'indeterminate'}
                        value={progress.total ? (100 * progress.completed) / progress.total : undefined}
                    />
                </Stack>
            )}
            {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                    {error}
                </Alert>
            )}
        </ListItem>
    );
}
