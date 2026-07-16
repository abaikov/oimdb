import { TOIMPk } from '../types/TOIMPk';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { IOIMSubscription } from './IOIMSubscription';

/**
 * Minimal read/subscribe surface a keyless (whole-collection) index exposes for
 * slot mapping: iterate all slots and subscribe to the single bucket's changes.
 * The keyless counterpart of {@link IOIMIndexSlotSource}.
 *
 * Both `OIMReactiveGlobalIndexSetBased` (slots as a `ReadonlySet`) and
 * `OIMReactiveGlobalIndexArrayBased` (slots as a `readonly` array) satisfy it
 * structurally — a `Set` and an array are both `Iterable`.
 */
export interface IOIMGlobalIndexSlotSource<TPk extends TOIMPk>
    extends IOIMSubscription {
    getSlots(): Iterable<TOIMAnyEntitySlot<TPk>>;
}
