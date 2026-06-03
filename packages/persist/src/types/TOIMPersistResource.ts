export type TOIMPersistUnsubscribe = () => void;

export type TOIMPersistCodec<TSourceSnapshot, TPersistedSnapshot = unknown> = {
    encode(snapshot: TSourceSnapshot): TPersistedSnapshot;
    decode(snapshot: TPersistedSnapshot): TSourceSnapshot;
};

export type TOIMPersistSourceAdapter<TSnapshot> = {
    read(): TSnapshot;
    write(snapshot: TSnapshot): void;
    subscribe(onChange: () => void): TOIMPersistUnsubscribe;
};

export type TOIMPersistStrategy<TPersistor, TSnapshot> = {
    read(persistor: TPersistor): Promise<TSnapshot | undefined>;
    write(persistor: TPersistor, snapshot: TSnapshot): Promise<void>;
    clear(persistor: TPersistor): Promise<void>;
};
