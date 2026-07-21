import type { TExoBindable } from '@exodra/reactivity-types';
import type { OIMComputed } from '@oimdb/core';
import type { TOIMExodraBindableOptions } from './types/TOIMExodraBindableOptions';
import { fromOimdb } from './fromOimdb';

/**
 * Wrap an `OIMComputed` as a read-only bindable. A computed is a single scalar cell (its key is
 * always `'value'`) whose `updateEventEmitter` delivers immediately, so a change is forwarded to
 * Exodra synchronously.
 *
 * Keep any fan-in inside one `OIMComputed` (leveled at AFTER_FLUSH, coherent) and forward its final
 * value — do not chain several Exodra `derive`s off each other, as Exodra has no glitch-batching.
 */
export function fromComputed<T>(
    computed: OIMComputed<T>,
    opts?: TOIMExodraBindableOptions<T>
): TExoBindable<T> {
    return fromOimdb(
        () => computed.get(),
        onChange => computed.updateEventEmitter.subscribeOnKey('value', onChange),
        opts
    );
}
