import type { IOIMPersistWriteBatch } from './IOIMPersistWriteBatch';

export interface IOIMPersistBackend<TWriteBatch extends IOIMPersistWriteBatch> {
    createWriteBatch(): TWriteBatch;
}
