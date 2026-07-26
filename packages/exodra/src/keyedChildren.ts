import type { TExoBindable } from '@exodra/reactivity-types';
import type { TOIMKey } from '@oimdb/core';
import { fromOimdb } from './fromOimdb';

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
 */
export function keyedChildren<TItem, TSchema>(
    source: TExoBindable<readonly TItem[]>,
    opts: { key: (item: TItem) => TOIMKey; render: (item: TItem) => TSchema }
): TExoBindable<readonly TSchema[]> {
    const cache = new Map<TOIMKey, TSchema>();
    let lastKeys: readonly TOIMKey[] = [];
    let lastOut: readonly TSchema[] = [];
    let hasRead = false;

    const read = (): readonly TSchema[] => {
        const items = source.getValue();
        const keys: TOIMKey[] = new Array(items.length);
        for (let i = 0; i < items.length; i++) keys[i] = opts.key(items[i]);

        if (hasRead && keysEqual(lastKeys, keys)) return lastOut;

        const out: TSchema[] = new Array(items.length);
        const seen = new Set<TOIMKey>();
        for (let i = 0; i < items.length; i++) {
            const key = keys[i];
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

        lastKeys = keys;
        lastOut = out;
        hasRead = true;
        return out;
    };

    // `read` already returns a stable reference while the key sequence is unchanged, so identity is
    // all the dedup this needs — no element-wise compare on every emit.
    return fromOimdb(read, onChange => source.subscribe(() => onChange()), {
        equals: Object.is,
    });
}
