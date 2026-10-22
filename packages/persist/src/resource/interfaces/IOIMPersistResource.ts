export interface IOIMPersistResource<TPersistBackend, TWriteBatch> {
    start(onPersistResourceDirty: () => void): void;
    stop(): void;
    hasPendingWrite(): boolean;
    writePendingWrite(writeBatch: TWriteBatch): void;
    writeEverything(writeBatch: TWriteBatch): void;
    deleteEverything(writeBatch: TWriteBatch): void;
    onPersistWriteCommitted(): void;
    onPersistWriteFailed(): void;
    dropPendingWrite(): void;
    hydrate(persistBackend: TPersistBackend): Promise<void>;
}
