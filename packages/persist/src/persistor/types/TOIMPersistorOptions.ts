import type { TOIMPersistErrorHandler } from '../../error/types/TOIMPersistErrorHandler';
import type { IOIMPersistScheduler } from '../../schedule/interfaces/IOIMPersistScheduler';
import type { IOIMPersistBackend } from '../interfaces/IOIMPersistBackend';
import type { IOIMPersistWriteBatch } from '../interfaces/IOIMPersistWriteBatch';

export type TOIMPersistorOptions<
    TPersistBackend extends IOIMPersistBackend<TWriteBatch>,
    TWriteBatch extends IOIMPersistWriteBatch,
> = {
    readonly persistBackend: TPersistBackend & IOIMPersistBackend<TWriteBatch>;
    readonly persistScheduler: IOIMPersistScheduler;
    readonly onPersistError?: TOIMPersistErrorHandler | undefined;
};
