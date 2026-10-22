import type { TExoBindable } from '@exodra/reactivity-types';
import type { TOIMDisposer, TOIMStoreKey } from '@oimdb/core';
import { oimSameKeySequence } from '@oimdb/core';
import type { TOIMExoRenderedRow } from './types/TOIMExoRenderedRow';
import { exoSource } from './exoSource';

export function exoRows<TKey extends TOIMStoreKey, TSchema>(
    keys: TExoBindable<readonly TKey[]>,
    render: (key: TKey) => TOIMExoRenderedRow<TSchema>
): TExoBindable<readonly TSchema[]> {
    const cache = new Map<TKey, TOIMExoRenderedRow<TSchema>>();
    let lastKeys: readonly TKey[] | undefined;
    let lastOut: readonly TSchema[] = [];

    const disposeRows = (): void => {
        for (const row of cache.values()) row.dispose();
        cache.clear();
        // Emptied WITH the cache, or the identity short-circuit answers from released holds.
        lastKeys = undefined;
        lastOut = [];
    };

    const read = (): readonly TSchema[] => {
        const next = keys.getValue();
        if (lastKeys && oimSameKeySequence(lastKeys, next)) {
            lastKeys = next;
            return lastOut;
        }

        // Decided over the whole sequence BEFORE anything is rendered, so a refusal
        // leaves the cache and `lastKeys` agreeing. See "The refusal is atomic".
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
        }

        const out: TSchema[] = new Array(next.length);
        // Only the keys THIS call minted: a refusal part-way through gives back what
        // this call resolved and leaves everything already cached alone.
        const minted: TKey[] = [];
        try {
            for (let i = 0; i < next.length; i++) {
                const key = next[i];
                const cachedExoRenderedRow = cache.get(key);
                if (cachedExoRenderedRow !== undefined) {
                    out[i] = cachedExoRenderedRow.schema;
                } else {
                    const row = render(key);
                    cache.set(key, row);
                    minted.push(key);
                    out[i] = row.schema;
                }
            }
        } catch (failure) {
            for (let i = 0; i < minted.length; i++) {
                const key = minted[i];
                cache.get(key)?.dispose();
                cache.delete(key);
            }
            throw failure;
        }
        // Deleting the current entry while iterating a Map is well-defined, so no key snapshot.
        for (const [key, row] of cache) {
            if (seen.has(key)) continue;
            row.dispose();
            cache.delete(key);
        }

        lastKeys = next;
        lastOut = out;
        return out;
    };

    return exoSource(read, onChange => {
        // Declared before the try: the unwind has to run before either exists.
        let lastEmitted: readonly TSchema[] = [];
        let keysDisposer: TOIMDisposer | undefined;
        try {
            lastEmitted = read();
            keysDisposer = keys.subscribe(() => {
                const out = read();
                if (out === lastEmitted) return;
                lastEmitted = out;
                onChange();
            });
        } catch (failure) {
            // NOTHING GIVES THESE ROWS BACK IF THE THROW LEAVES HERE: the disposer
            // below is the only caller of `disposeRows()` and is never built.
            keysDisposer?.();
            keysDisposer = undefined;
            disposeRows();
            throw failure;
        }
        return () => {
            keysDisposer?.();
            keysDisposer = undefined;
            disposeRows();
        };
    });
}
