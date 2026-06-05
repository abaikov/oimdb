export type TOIMPersistCodec<TSourceSnapshot, TPersistedSnapshot = unknown> = {
    encode(snapshot: TSourceSnapshot): TPersistedSnapshot;
    decode(snapshot: TPersistedSnapshot): TSourceSnapshot;
};
