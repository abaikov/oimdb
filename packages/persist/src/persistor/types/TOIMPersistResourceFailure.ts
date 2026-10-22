import type { IOIMPersistResource } from '../../resource/interfaces/IOIMPersistResource';

export type TOIMPersistResourceFailure<TPersistBackend, TWriteBatch> = {
    readonly persistResource: IOIMPersistResource<TPersistBackend, TWriteBatch>;
    readonly error: unknown;
};
