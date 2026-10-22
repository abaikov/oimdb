import type { IOIMPersistCodec } from '../interfaces/IOIMPersistCodec';

export type TOIMPersistCodecVersionedOptions<TSourceSnapshot, TPersistedSnapshot> = {
    readonly version: number;
    readonly migrations: Readonly<Record<number, (data: unknown) => unknown>>;
    readonly persistCodec: IOIMPersistCodec<TSourceSnapshot, TPersistedSnapshot>;
};
