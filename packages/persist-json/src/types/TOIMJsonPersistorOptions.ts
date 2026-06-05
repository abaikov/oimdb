import { TOIMPersistorOptions } from '@oimdb/persist';
import { TOIMJsonPersistStorage } from './TOIMJsonPersistStorage';

/**
 * Options for the JSON persistor. The engine's `storage` field is replaced by
 * an optional `initial` plain object (e.g. an SSR blob inlined into the page)
 * which seeds the persistor's storage.
 */
export type TOIMJsonPersistorOptions = Omit<
    TOIMPersistorOptions<TOIMJsonPersistStorage>,
    'storage'
> & {
    initial?: Record<string, unknown>;
};
