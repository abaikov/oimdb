import type { TExoBindable } from '@exodra/reactivity-types';
import type { TOIMKey } from '@oimdb/core';
import { fromOimdb } from './fromOimdb';

const elementEqual = <T>(a: readonly T[], b: readonly T[]): boolean => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (!Object.is(a[i], b[i])) return false;
    }
    return true;
};

/**
 * Turn an ordered source of items into identity-stable Exodra children (for the `bindable` children
 * bucket, which reconciles by identity). Each item's rendered schema is cached by a stable key, so a
 * field edit that does not change the key set produces an element-equal array → a reconcile no-op,
 * and the row's own inner bindables update in place (focus survives). Membership/order changes
 * rebuild the array from the cache.
 */
export function keyedChildren<TItem, TSchema>(
    source: TExoBindable<readonly TItem[]>,
    opts: { key: (item: TItem) => TOIMKey; render: (item: TItem) => TSchema }
): TExoBindable<readonly TSchema[]> {
    const cache = new Map<TOIMKey, TSchema>();

    const read = (): readonly TSchema[] => {
        const items = source.getValue();
        const out: TSchema[] = new Array(items.length);
        const seen = new Set<TOIMKey>();
        for (let i = 0; i < items.length; i++) {
            const key = opts.key(items[i]);
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
        return out;
    };

    return fromOimdb(read, onChange => source.subscribe(() => onChange()), {
        equals: elementEqual,
    });
}
