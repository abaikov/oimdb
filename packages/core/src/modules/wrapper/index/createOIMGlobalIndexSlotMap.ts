import { TOIMKey } from '../../../types/TOIMKey';
import { TOIMPk } from '../../../types/TOIMPk';
import { TOIMAnyEntitySlot } from '../../../types/TOIMEntitySlot';
import { IOIMGlobalIndexSlotSource } from '../../../interfaces/IOIMGlobalIndexSlotSource';
import { OIMGlobalIndexSlotMap } from './OIMGlobalIndexSlotMap';

/**
 * Map the slots of a keyless (whole-collection) set/array index to stable
 * per-slot objects — the keyless counterpart of `createOIMIndexSlotMap`.
 *
 * ```ts
 * const everyone = users.indexFactory.derivedSetGlobalIndex();
 * const rows = createOIMGlobalIndexSlotMap(everyone, (slot) => makeRow(slot.item));
 *
 * rows.subscribe(render);
 * function render() {
 *   for (const row of rows.getAll()) { /* same instance per slot *\/ }
 * }
 * ```
 */
export function createOIMGlobalIndexSlotMap<TPk extends TOIMKey, TMapped>(
    index: IOIMGlobalIndexSlotSource<TPk>,
    create: (slot: TOIMAnyEntitySlot<TPk>) => TMapped
): OIMGlobalIndexSlotMap<TPk, TMapped> {
    return new OIMGlobalIndexSlotMap<TPk, TMapped>(index, create);
}
