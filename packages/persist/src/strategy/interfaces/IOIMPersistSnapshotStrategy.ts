export interface IOIMPersistSnapshotStrategy<TPersistBackend, TWriteBatch, TSnapshot> {
    readSnapshot(persistBackend: TPersistBackend): Promise<TSnapshot | undefined>;
    writeSnapshot(writeBatch: TWriteBatch, snapshot: TSnapshot): void;
    deleteSnapshot(writeBatch: TWriteBatch): void;
}
