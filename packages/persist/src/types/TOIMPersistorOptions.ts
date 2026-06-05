import { OIMEventQueue } from '@oimdb/core';
import { TOIMPersistErrorContext } from './TOIMPersistErrorContext';

export type TOIMPersistorOptions<TStorage> = {
    storage: TStorage;
    queue?: OIMEventQueue;
    onError?: (error: unknown, context: TOIMPersistErrorContext) => void;
};
