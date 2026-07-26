import type { TExoBindable } from '@exodra/reactivity-types';
import type { OIMSelector } from '@oimdb/core';
import { exoSource } from './exoSource';

/**
 * An `OIMSelector` as an Exodra bindable — the primary path.
 *
 * The selector already performs the fine-grained subscription (index key for membership plus each pk
 * in the set, re-subscribing when the set changes) and its own content-level dedup
 * (`OIMSelector.areEqual`), so this is a thin adapter of `{ getValue, watch }` →
 * `{ getValue, subscribe }`. Need a different equality? Override `areEqual` on the selector; there is
 * nothing to configure here.
 *
 * `watch` invokes its callback immediately; `exoSource` swallows emits fired while subscribing, so
 * that first synchronous one does not become a spurious notification.
 */
export function exoSelector<T>(selector: OIMSelector<T>): TExoBindable<T> {
    return exoSource(
        () => selector.getValue(),
        onChange => selector.watch(() => onChange())
    );
}
