import type { TExoBindable } from '@exodra/reactivity-types';
import type { TOIMKey } from '@oimdb/core';
import { exoBindable } from './exoBindable';

const keysEqual = (a: readonly TOIMKey[], b: readonly TOIMKey[]): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (!Object.is(a[i], b[i])) return false;
    }
    return true;
};

/**
 * Turn an ordered source of items into identity-stable Exodra children (for the `bindable` children
 * bucket, which reconciles by identity). Each item's rendered schema is cached by a stable key, so a
 * field edit that does not change the key set produces the SAME array → a reconcile no-op, and the
 * row's own inner bindables update in place (focus survives). Membership/order changes rebuild the
 * array from the cache, rendering only the genuinely new keys and dropping the departed ones.
 *
 * A read is idempotent: the key sequence is derived first and compared to the last one, and only a
 * real change rebuilds the output, renders new keys or evicts old ones. So repeated `getValue()`
 * calls return the very same array reference, cost O(n) compare instead of O(n) render, and never
 * mutate the cache — which matters because `render` mints a per-row bindable in `entityRows`, and a
 * bare read must not be able to churn row identity.
 *
 * Keys must be unique: a duplicate would place one schema object at two positions, which an
 * identity-reconciling renderer cannot express. That throws rather than corrupting the list.
 */
export function exoChildren<TItem, TSchema>(
    source: TExoBindable<readonly TItem[]>,
    opts: { key: (item: TItem) => TOIMKey; render: (item: TItem) => TSchema }
): TExoBindable<readonly TSchema[]> {
    const cache = new Map<TOIMKey, TSchema>();
    let lastItems: readonly TItem[] | undefined;
    let lastKeys: readonly TOIMKey[] = [];
    let lastOut: readonly TSchema[] = [];
    let hasRead = false;

    const read = (): readonly TSchema[] => {
        const items = source.getValue();
        // Fast path: an unchanged source hands back the same array, so a no-op read costs nothing.
        // Sources that allocate per read fall through to the O(n) key compare below and still work.
        if (hasRead && items === lastItems) return lastOut;

        const keys: TOIMKey[] = new Array(items.length);
        for (let i = 0; i < items.length; i++) keys[i] = opts.key(items[i]);

        if (hasRead && keysEqual(lastKeys, keys)) {
            lastItems = items;
            return lastOut;
        }

        const out: TSchema[] = new Array(items.length);
        const seen = new Set<TOIMKey>();
        for (let i = 0; i < items.length; i++) {
            const key = keys[i];
            // A duplicate key would put the SAME schema object at two positions, and Exodra
            // reconciles by identity — that corrupts the list silently. Fail loudly instead.
            if (seen.has(key)) {
                throw new Error(
                    `exoChildren: duplicate key ${String(key)} at index ${i}. ` +
                        'Keys must be unique — identity reconciliation cannot place one row twice.'
                );
            }
            seen.add(key);
            if (cache.has(key)) {
                out[i] = cache.get(key) as TSchema;
            } else {
                const schema = opts.render(items[i]);
                cache.set(key, schema);
                out[i] = schema;
            }
        }
        for (const key of Array.from(cache.keys())) {
            if (!seen.has(key)) cache.delete(key);
        }

        lastItems = items;
        lastKeys = keys;
        lastOut = out;
        hasRead = true;
        return out;
    };

    // `read` returns a stable reference while the key sequence is unchanged, so identity is all the
    // dedup this needs — a field edit re-reads to the same array and never reaches Exodra.
    return exoBindable(read, onChange => {
        let lastEmitted = read();
        return source.subscribe(() => {
            const next = read();
            if (next === lastEmitted) return;
            lastEmitted = next;
            onChange();
        });
    });
}
