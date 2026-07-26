import type { TExoBindable } from '@exodra/reactivity-types';
import type { OIMSelector } from '@oimdb/core';
import { fromOimdb } from './fromOimdb';

/**
 * Primary path: wrap an `OIMSelector` as a read-only bindable. The selector already performs the
 * fine-grained subscription (index key + each pk, re-subscribing when the set changes) and its own
 * content-level dedup (`OIMSelector.areEqual`, overridden with an element compare by every
 * collection-returning selector), so this is a thin adapter of `{ getValue, watch }` →
 * `{ getValue, subscribe }`.
 *
 * It takes NO equality options and forwards every emit the selector chooses to deliver. A second
 * filter here could not add anything: core decides first, and whatever it swallows never reaches
 * this callback — an `equals` at this layer would be dead code for collection selectors (each
 * `getValue()` allocates a fresh container, so a reference compare never matches) and a duplicate of
 * `areEqual` for scalar ones. Need a different policy? Override `areEqual` on the selector.
 *
 * `watch` invokes its callback immediately; `fromOimdb` swallows emits fired while subscribing, so
 * that first synchronous one does not become a spurious notification.
 */
export function fromSelector<T>(selector: OIMSelector<T>): TExoBindable<T> {
    return fromOimdb(
        () => selector.getValue(),
        onChange => selector.watch(() => onChange())
    );
}
