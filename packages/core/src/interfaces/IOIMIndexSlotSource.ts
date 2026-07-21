import { TOIMKey } from '../types/TOIMKey';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { IOIMKeyedSubscription } from './IOIMKeyedSubscription';

/**
 * Minimal read/subscribe surface a keyed index exposes for slot mapping:
 * iterate the slots under a key and subscribe to that key's changes.
 *
 * Both `OIMReactiveIndexSetBased` (slots as a `ReadonlySet`) and
 * `OIMReactiveIndexArrayBased` (slots as a `readonly` array) satisfy it
 * structurally — a `Set` and an array are both `Iterable`.
 */
export interface IOIMIndexSlotSource<TKey extends TOIMKey, TPk extends TOIMKey>
    extends IOIMKeyedSubscription<TKey> {
    getSlotsByKey(key: TKey): Iterable<TOIMAnyEntitySlot<TPk>>;
}
