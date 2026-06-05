import { TOIMPersistStrategy } from '@oimdb/persist';
import type { OIMMemoryPersistor } from '../core/OIMMemoryPersistor';
import { TOIMMemoryEntryStrategyOptions } from '../types/TOIMMemoryEntryStrategyOptions';

export function createMemoryEntryStrategy<TSnapshot>(
    options: TOIMMemoryEntryStrategyOptions = {}
): TOIMPersistStrategy<OIMMemoryPersistor, TSnapshot> {
    const bucketName = options.bucketName ?? 'default';
    return {
        async read(persistor) {
            return persistor.storage.entries.get(bucketName) as
                | TSnapshot
                | undefined;
        },
        async write(persistor, snapshot) {
            persistor.storage.entries.set(bucketName, snapshot);
        },
        async clear(persistor) {
            persistor.storage.entries.delete(bucketName);
        },
    };
}
