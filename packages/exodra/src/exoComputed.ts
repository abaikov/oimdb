import type { TExoBindable } from '@exodra/reactivity-types';
import type { OIMComputed } from '@oimdb/core';
import { exoSource } from './exoSource';

/**
 * An `OIMComputed` as an Exodra bindable. A computed is a single scalar cell (its key is always
 * `'value'`) whose `updateEventEmitter` delivers immediately, so a change reaches Exodra
 * synchronously.
 *
 * No equality options: `OIMComputed` only emits when its own `compare` (passed at construction,
 * default `Object.is`) reports a change, so the policy already lives there. Need a content compare?
 * Pass `compare` to the computed.
 *
 * This is also the right bridge for anything aggregated — a join across collections, a count, a
 * roll-up. Keep the fan-in inside ONE computed (leveled at `AFTER_FLUSH`, coherent by construction)
 * and forward its final value; do not chain several Exodra `derive`s off each other, as Exodra has
 * no glitch batching.
 */
export function exoComputed<T>(computed: OIMComputed<T>): TExoBindable<T> {
    return exoSource(
        () => computed.get(),
        onChange => computed.updateEventEmitter.subscribeOnKey('value', onChange)
    );
}
