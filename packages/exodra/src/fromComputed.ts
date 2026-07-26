import type { TExoBindable } from '@exodra/reactivity-types';
import type { OIMComputed } from '@oimdb/core';
import { fromOimdb } from './fromOimdb';

/**
 * Wrap an `OIMComputed` as a read-only bindable. A computed is a single scalar cell (its key is
 * always `'value'`) whose `updateEventEmitter` delivers immediately, so a change is forwarded to
 * Exodra synchronously.
 *
 * No equality options: `OIMComputed` only emits when its own `compare` (passed at construction,
 * default `Object.is`) reports a change, so the policy already lives there and this adapter just
 * forwards. Need a content compare? Pass `compare` to the computed.
 *
 * Keep any fan-in inside one `OIMComputed` (leveled at AFTER_FLUSH, coherent) and forward its final
 * value — do not chain several Exodra `derive`s off each other, as Exodra has no glitch-batching.
 */
export function fromComputed<T>(computed: OIMComputed<T>): TExoBindable<T> {
    return fromOimdb(
        () => computed.get(),
        onChange => computed.updateEventEmitter.subscribeOnKey('value', onChange)
    );
}
