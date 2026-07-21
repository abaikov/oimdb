import { TOIMKey } from '../../../types/TOIMKey';
import { TOIMPk } from '../../../types/TOIMPk';
import { TOIMAnyEntitySlot } from '../../../types/TOIMEntitySlot';
import { IOIMIndexSlotSource } from '../../../interfaces/IOIMIndexSlotSource';
import { OIMIndexSlotMap } from './OIMIndexSlotMap';

/**
 * Map the slots of a keyed set/array index to stable per-slot objects.
 *
 * ```ts
 * const usersByTeam = users.indexFactory.derivedSetIndex((u) => u.teamId);
 * const rows = createOIMIndexSlotMap(usersByTeam, (slot) => makeRow(slot.item));
 *
 * rows.subscribeOnKey('team1', render);
 * function render() {
 *   for (const row of rows.getByKey('team1')) { /* same instance per slot *\/ }
 * }
 * ```
 */
export function createOIMIndexSlotMap<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TMapped,
>(
    index: IOIMIndexSlotSource<TKey, TPk>,
    create: (slot: TOIMAnyEntitySlot<TPk>) => TMapped
): OIMIndexSlotMap<TKey, TPk, TMapped> {
    return new OIMIndexSlotMap<TKey, TPk, TMapped>(index, create);
}
