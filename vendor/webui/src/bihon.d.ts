interface Window {
    bihon?: {
        setupInfo(): Promise<{ defaultRepositoryReady: boolean }>;
        downloadsInfo(): Promise<{ path: string }>;
        chooseDownloads(): Promise<{ canceled: boolean; path?: string }>;
        openDownloads(): Promise<string>;
        onProgress(callback: (progress: { stage: string; completed: number; total: number }) => void): () => void;
    };
}
