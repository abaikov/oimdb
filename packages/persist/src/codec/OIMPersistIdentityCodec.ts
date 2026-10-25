import type { IOIMPersistCodec } from './interfaces/IOIMPersistCodec';

export class OIMPersistIdentityCodec<TSnapshot> implements IOIMPersistCodec<TSnapshot, TSnapshot> {
    public encode(sourceSnapshot: TSnapshot): TSnapshot {
        return sourceSnapshot;
    }

    public decode(persistedSnapshot: TSnapshot): TSnapshot {
        return persistedSnapshot;
    }
}
