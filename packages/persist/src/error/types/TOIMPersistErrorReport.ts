import type { TOIMPersistErrorContext } from './TOIMPersistErrorContext';

export type TOIMPersistErrorReport = {
    readonly error: unknown;
    readonly persistErrorContext: TOIMPersistErrorContext;
};
