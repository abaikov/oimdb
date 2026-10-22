import type { TOIMPersistErrorContext } from './TOIMPersistErrorContext';

export type TOIMPersistErrorHandler = (error: unknown, persistErrorContext: TOIMPersistErrorContext) => void;
