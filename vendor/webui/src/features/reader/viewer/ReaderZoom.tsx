/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */


import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';

const MAX_ZOOM = 5;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const wheelUnit = (event: WheelEvent, frame: HTMLDivElement) => {
    if (event.deltaMode === 1) {
        return 16;
    }
    if (event.deltaMode === 2) {
        return frame.clientHeight;
    }
    return 1;
};

export function ReaderZoom({ children }: { children: ReactNode }) {
    const viewport = useRef<HTMLDivElement>(null);
    const surface = useRef<HTMLDivElement>(null);
    const position = useRef({ scale: 1, x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const apply = useCallback((next: { scale: number; x: number; y: number }) => {
        const frame = viewport.current;
        const content = surface.current;
        if (!frame || !content) {
            return;
        }
        const value = {
            scale: next.scale,
            x: clamp(next.x, -frame.clientWidth * (next.scale - 1), 0),
            y: clamp(next.y, -frame.clientHeight * (next.scale - 1), 0),
        };
        position.current = value;
        content.style.transform =
            value.scale === 1 ? 'none' : `translate(${value.x}px, ${value.y}px) scale(${value.scale})`;
        content.style.cursor = value.scale > 1 ? 'grab' : '';
        content.dataset.zoom = String(value.scale);
        setScale(value.scale);
    }, []);
    const reset = useCallback(() => apply({ scale: 1, x: 0, y: 0 }), [apply]);
    const zoomAt = useCallback(
        (requested: number, clientX?: number, clientY?: number) => {
            const frame = viewport.current;
            if (!frame) {
                return;
            }
            const rect = frame.getBoundingClientRect();
            const x = clientX === undefined ? rect.width / 2 : clientX - rect.left;
            const y = clientY === undefined ? rect.height / 2 : clientY - rect.top;
            const { current } = position;
            const nextScale = clamp(requested, 1, MAX_ZOOM);
            const ratio = nextScale / current.scale;
            apply({ scale: nextScale, x: x - (x - current.x) * ratio, y: y - (y - current.y) * ratio });
        },
        [apply],
    );

    useEffect(() => {
        const frame = viewport.current!;
        const content = surface.current!;
        let drag: { id: number; x: number; y: number } | null = null;
        const isControl = (target: EventTarget | null) =>
            target instanceof Element && !!target.closest('[data-bihon-zoom-toolbar]');
        const stop = (event: Event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
        };
        const wheel = (event: WheelEvent) => {
            if (isControl(event.target)) {
                return;
            }
            // Precision-trackpad pinch gestures are delivered as Ctrl+wheel by Chromium.
            if (event.ctrlKey || event.metaKey) {
                stop(event);
                const pixels = event.deltaY * wheelUnit(event, frame);
                zoomAt(
                    position.current.scale * Math.exp(-clamp(pixels, -120, 120) * 0.003),
                    event.clientX,
                    event.clientY,
                );
            } else if (position.current.scale > 1) {
                const { current } = position;
                const unit = wheelUnit(event, frame);
                const dx = (event.shiftKey ? event.deltaY : event.deltaX) * unit;
                const dy = (event.shiftKey ? 0 : event.deltaY) * unit;
                const x = clamp(current.x - dx, -frame.clientWidth * (current.scale - 1), 0);
                const y = clamp(current.y - dy, -frame.clientHeight * (current.scale - 1), 0);
                // At the edge, ordinary scrolling continues through the chapter.
                if (x !== current.x || y !== current.y) {
                    stop(event);
                    apply({ ...current, x, y });
                }
            }
        };
        const down = (event: PointerEvent) => {
            if (position.current.scale <= 1 || event.button !== 0 || isControl(event.target)) {
                return;
            }
            stop(event);
            drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
            frame.setPointerCapture(event.pointerId);
            content.style.cursor = 'grabbing';
        };
        const move = (event: PointerEvent) => {
            if (!drag || drag.id !== event.pointerId) {
                return;
            }
            stop(event);
            apply({
                ...position.current,
                x: position.current.x + event.clientX - drag.x,
                y: position.current.y + event.clientY - drag.y,
            });
            drag.x = event.clientX;
            drag.y = event.clientY;
            content.style.cursor = 'grabbing';
        };
        const up = (event: PointerEvent) => {
            if (!drag || drag.id !== event.pointerId) {
                return;
            }
            stop(event);
            if (frame.hasPointerCapture(event.pointerId)) {
                frame.releasePointerCapture(event.pointerId);
            }
            drag = null;
            content.style.cursor = position.current.scale > 1 ? 'grab' : '';
        };
        const click = (event: MouseEvent) => {
            if (position.current.scale > 1 && !isControl(event.target)) {
                stop(event);
            }
        };
        const key = (event: KeyboardEvent) => {
            const { target } = event;
            if (
                target instanceof HTMLElement &&
                (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
            ) {
                return;
            }
            if (event.key === 'Escape' && position.current.scale > 1) {
                stop(event);
                reset();
            }
            if (!event.ctrlKey && !event.metaKey) {
                return;
            }
            if (['+', '=', '-', '0'].includes(event.key)) {
                stop(event);
                if (event.key === '0') {
                    reset();
                } else {
                    zoomAt(position.current.scale * (event.key === '-' ? 1 / 1.2 : 1.2));
                }
            }
        };
        const menu = (event: Event) => {
            const action = (event as CustomEvent<string>).detail;
            if (action === 'reset') {
                reset();
            } else if (action === 'in' || action === 'out') {
                zoomAt(position.current.scale * (action === 'in' ? 1.2 : 1 / 1.2));
            }
        };
        frame.addEventListener('wheel', wheel, { capture: true, passive: false });
        frame.addEventListener('pointerdown', down, true);
        frame.addEventListener('pointermove', move, true);
        frame.addEventListener('pointerup', up, true);
        frame.addEventListener('pointercancel', up, true);
        frame.addEventListener('click', click, true);
        window.addEventListener('keydown', key, true);
        window.addEventListener('bihon:reader-zoom', menu);
        const observer = new ResizeObserver(reset);
        observer.observe(frame);
        return () => {
            observer.disconnect();
            frame.removeEventListener('wheel', wheel, true);
            frame.removeEventListener('pointerdown', down, true);
            frame.removeEventListener('pointermove', move, true);
            frame.removeEventListener('pointerup', up, true);
            frame.removeEventListener('pointercancel', up, true);
            frame.removeEventListener('click', click, true);
            window.removeEventListener('keydown', key, true);
            window.removeEventListener('bihon:reader-zoom', menu);
        };
    }, [apply, reset, zoomAt]);

    return (
        <Box
            ref={viewport}
            data-testid="reader-zoom-viewport"
            sx={{ position: 'relative', width: '100%', height: '100%', minHeight: 0, flex: 1, overflow: 'hidden' }}
        >
            <Box
                ref={surface}
                data-testid="reader-zoom-surface"
                data-zoom="1"
                sx={{ width: '100%', height: '100%', transformOrigin: '0 0' }}
            >
                {children}
            </Box>
            <Paper
                data-bihon-zoom-toolbar
                role="toolbar"
                aria-label="Panel zoom"
                elevation={4}
                title="Ctrl+wheel or pinch to zoom. Drag or scroll to pan. Escape or Ctrl+0 resets."
                sx={{
                    position: 'absolute',
                    right: 16,
                    bottom: 76,
                    zIndex: 1400,
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: 2,
                }}
            >
                <IconButton
                    aria-label="Zoom out of manga"
                    disabled={scale <= 1}
                    onClick={() => zoomAt(position.current.scale / 1.2)}
                >
                    <RemoveIcon />
                </IconButton>
                <Button
                    aria-label="Reset manga zoom"
                    onClick={reset}
                    sx={{ minWidth: 62, fontVariantNumeric: 'tabular-nums' }}
                >
                    {Math.round(scale * 100)}%
                </Button>
                <IconButton
                    aria-label="Zoom into manga"
                    disabled={scale >= MAX_ZOOM}
                    onClick={() => zoomAt(position.current.scale * 1.2)}
                >
                    <AddIcon />
                </IconButton>
            </Paper>
        </Box>
    );
}
