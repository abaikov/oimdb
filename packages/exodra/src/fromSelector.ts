import type { TExoBindable } from '@exodra/reactivity';
import type { OIMSelector } from '@oimdb/core';
import type { TOIMExodraBindableOptions } from './types/TOIMExodraBindableOptions';
import { fromOimdb } from './fromOimdb';

/**
 * Primary path: wrap an `OIMSelector` as a read-only bindable. The selector already performs the
 * fine-grained subscription (index key + each pk, re-subscribing when the set changes) and its own
 * content-level dedup, so this is a thin adapter of `{ getValue, watch }` → `{ getValue, subscribe }`.
 *
 * `watch` invokes its callback immediately; `fromOimdb` primes its last value before subscribing,
 * so that first synchronous emit dedups to a no-op instead of a spurious notification.
 */
export function fromSelector<T>(
    selector: OIMSelector<T>,
    opts?: TOIMExodraBindableOptions<T>
): TExoBindable<T> {
    return fromOimdb(
        () => selector.getValue(),
        onChange => selector.watch(() => onChange()),
        opts
    );
}
