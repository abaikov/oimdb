import type { TExoBindable } from '@exodra/reactivity-types';
import type { TOIMKey } from '@oimdb/core';
import { exoSource } from './exoSource';

const keysEqual = (a: readonly TOIMKey[], b: readonly TOIMKey[]): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (!Object.is(a[i], b[i])) return false;
    }
    return true;
};

/**
 * Keys in, identity-stable Exodra children out.
 *
 * Exodra's children bucket reconciles by object IDENTITY, and OIMDB replaces an entity object on
 * every update — so an entity reference cannot answer "is this the same row?". A primary key can.
 * Each key gets its schema rendered ONCE and cached, so a field edit re-reads to the very same array
 * and the reconcile is a no-op, while the row's own inner bindables update in place and focus
 * survives. Membership and order changes rebuild from the cache, rendering only genuinely new keys
 * and dropping the departed ones.
 *
 * **The key IS the item.** There is no key function to pass — identity is what you feed in, and on
 * every real path it already exists: a collection and an index both hand you pks. That is also why a
 * key must never carry state: folding a count or a flag into it (`` `${id}:${n}` ``) turns "which row
 * is this" into "which row and in what condition", so the row is rebuilt whenever that condition
 * changes and its focus is lost. Anything that varies WITHIN a row belongs in a bindable there.
 *
 * A read is idempotent: the key sequence is compared to the previous one and only a real change
 * rebuilds, so repeated `getValue()` calls hand back the same array reference.
 *
 * Keys must be unique — a duplicate would place one schema object at two positions, which an
 * identity-reconciling renderer cannot express. That throws rather than corrupting the list.
 */
export function exoRows<TKey extends TOIMKey, TSchema>(
    keys: TExoBindable<readonly TKey[]>,
    render: (key: TKey) => TSchema
): TExoBindable<readonly TSchema[]> {
    const cache = new Map<TKey, TSchema>();
    let lastKeys: readonly TKey[] | undefined;
    let lastOut: readonly TSchema[] = [];

    const read = (): readonly TSchema[] => {
        const next = keys.getValue();
        // The keys array IS the identity sequence — nothing is derived from it, and an unchanged
        // source short-circuits on reference alone.
        if (lastKeys && (next === lastKeys || keysEqual(lastKeys, next))) {
            lastKeys = next;
            return lastOut;
        }

        const out: TSchema[] = new Array(next.length);
        const seen = new Set<TKey>();
        for (let i = 0; i < next.length; i++) {
            const key = next[i];
            if (seen.has(key)) {
                throw new Error(
                    `exoRows: duplicate key ${String(key)} at index ${i}. ` +
                        'Keys must be unique — identity reconciliation cannot place one row twice.'
                );
            }
            seen.add(key);
            if (cache.has(key)) {
                out[i] = cache.get(key) as TSchema;
            } else {
                const schema = render(key);
                cache.set(key, schema);
                out[i] = schema;
            }
        }
        // Deleting the current entry while iterating a Map is well-defined, so no key snapshot.
        for (const key of cache.keys()) {
            if (!seen.has(key)) cache.delete(key);
        }

        lastKeys = next;
        lastOut = out;
        return out;
    };

    return exoSource(read, onChange => {
        let lastEmitted = read();
        return keys.subscribe(() => {
            const out = read();
            if (out === lastEmitted) return;
            lastEmitted = out;
            onChange();
        });
    });
}
