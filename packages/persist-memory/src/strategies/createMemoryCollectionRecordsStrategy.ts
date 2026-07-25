import { TOIMPk } from '@oimdb/core';
import { TOIMCollectionPersistSnapshot, TOIMPersistStrategy } from '@oimdb/persist';
import type { OIMMemoryPersistor } from '../core/OIMMemoryPersistor';
import { TOIMMemoryRecordsStrategyOptions } from '../types/TOIMMemoryRecordsStrategyOptions';

export function createMemoryCollectionRecordsStrategy<
    TPk extends TOIMPk,
    TEntity,
>(
    options: TOIMMemoryRecordsStrategyOptions = {}
): TOIMPersistStrategy<
    OIMMemoryPersistor,
    TOIMCollectionPersistSnapshot<TPk, TEntity>,
    TPk,
    TEntity
> {
    const bucketName = options.bucketName ?? 'default';
    return {
        async read(persistor) {
            const bucket = persistor.storage.recordBuckets.get(bucketName);
            if (!bucket) return undefined;
            return {
                records: Array.from(bucket, ([pk, value]) => ({
                    pk: pk as TPk,
                    value: value as TEntity,
                })),
            };
        },
        async write(persistor, snapshot) {
            const bucket = new Map<TOIMPk, unknown>();
            for (let i = 0; i < snapshot.records.length; i++) {
                bucket.set(snapshot.records[i].pk, snapshot.records[i].value);
            }
            persistor.storage.recordBuckets.set(bucketName, bucket);
        },
        async writeDelta(persistor, delta) {
            // Touch only the changed records — the whole point of `records`
            // mode. Reuse the existing bucket so untouched entries are neither
            // re-read nor rewritten.
            let bucket = persistor.storage.recordBuckets.get(bucketName);
            if (!bucket) {
                bucket = new Map<TOIMPk, unknown>();
                persistor.storage.recordBuckets.set(bucketName, bucket);
            }
            for (let i = 0; i < delta.upserts.length; i++) {
                bucket.set(delta.upserts[i].key, delta.upserts[i].value);
            }
            for (let i = 0; i < delta.deletedKeys.length; i++) {
                bucket.delete(delta.deletedKeys[i]);
            }
        },
        async clear(persistor) {
            persistor.storage.recordBuckets.delete(bucketName);
        },
    };
}
