import type { TOIMKey } from '../types/TOIMKey';
import type { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import type { IOIMKeyedSubscription } from './IOIMKeyedSubscription';

/**
 * Minimal read/subscribe surface a keyed index exposes for slot mapping:
 * iterate the slots under a key, and hand out the emitter that announces changes
 * to it.
 *
 * The emitter is named rather than mirrored. A source that re-declared
 * `subscribeOnKey` would be publishing a second, identical door to the same
 * subscription list, and every such door is somewhere a capability can be lost:
 * the field-scoped subscription lives on one emitter subclass and not another,
 * and a mirror either drops it or fakes it.
 *
 * Both `OIMReactiveIndexSetBased` (slots as a `ReadonlySet`) and
 * `OIMReactiveIndexArrayBased` (slots as a `readonly` array) satisfy it
 * structurally — a `Set` and an array are both `Iterable`.
 */
export interface IOIMIndexSlotSource<TKey extends TOIMKey, TPk extends TOIMKey> {
    readonly emitter: IOIMKeyedSubscription<TKey>;
    getSlotsByKey(key: TKey): Iterable<TOIMAnyEntitySlot<TPk>>;
}
