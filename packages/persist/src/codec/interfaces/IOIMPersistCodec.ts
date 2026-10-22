export interface IOIMPersistCodec<TSourceSnapshot, TPersistedSnapshot> {
    encode(sourceSnapshot: TSourceSnapshot): TPersistedSnapshot;
    decode(persistedSnapshot: TPersistedSnapshot): TSourceSnapshot;
}
