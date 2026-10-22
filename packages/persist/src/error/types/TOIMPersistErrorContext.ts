import type { IOIMPersistResource } from '../../resource/interfaces/IOIMPersistResource';
import type { TOIMPersistOperation } from './TOIMPersistOperation';

export type TOIMPersistErrorContext = {
    readonly persistResource: IOIMPersistResource<unknown, unknown>;
    readonly persistOperation: TOIMPersistOperation;
};
