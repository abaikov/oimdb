export type TOIMPersistStrategy<TPersistor, TSnapshot> = {
    read(persistor: TPersistor): Promise<TSnapshot | undefined>;
    write(persistor: TPersistor, snapshot: TSnapshot): Promise<void>;
    clear(persistor: TPersistor): Promise<void>;
};
