import { EOIMIndexEventType, TOIMPk } from '@oimdb/core';
import { TOIMEmitter } from '../types/TOIMEmitter';
import { TOIMIndexPersistSnapshot } from '../types/TOIMIndexPersistSnapshot';
import { TOIMPersistSourceAdapter } from '../types/TOIMPersistSourceAdapter';
import { noop } from '../utils/noop';

/**
 * Shared core for all manual-index source adapters. The differences between
 * set / array / ordered indexes live entirely in `writeBucket`, which maps a
 * persisted `{ key, pks }` bucket back onto the concrete index API.
 */
export function createIndexSourceAdapter<TKey extends TOIMPk, TPk extends TOIMPk>(
    index: {
        getKeys(): readonly TKey[];
        getPksByKey(key: TKey): Iterable<TPk>;
        clear(key?: TKey): void;
        emitter?: TOIMEmitter<typeof EOIMIndexEventType.UPDATE>;
    },
    writeBucket: (key: TKey, pks: TPk[]) => void
): TOIMPersistSourceAdapter<TOIMIndexPersistSnapshot<TKey, TPk>> {
    return {
        read() {
            return {
                buckets: index.getKeys().map(key => ({
                    key,
                    pks: Array.from(index.getPksByKey(key)),
                })),
            };
        },
        write(snapshot) {
            index.clear();
            for (let i = 0; i < snapshot.buckets.length; i++) {
                const bucket = snapshot.buckets[i];
                writeBucket(bucket.key, bucket.pks);
            }
        },
        subscribe(onChange) {
            return index.emitter
                ? index.emitter.on(EOIMIndexEventType.UPDATE, onChange)
                : noop;
        },
    };
}
