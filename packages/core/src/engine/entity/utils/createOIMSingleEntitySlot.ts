import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import type { TOIMEntityContentSlot } from '../types/TOIMEntityContentSlot';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import { OIM_SLOT_FLAG_EMPTY } from '../../slot/constants/OIM_SLOT_FLAG_EMPTY';

export function createOIMSingleEntitySlot<TEntity extends object>(
    owner: IOIMSlotOwner,
    storeSlot: TOIMStoreSlot,
): TOIMEntityContentSlot<TEntity> {
    const singleEntitySlot = {
        effects: undefined,
        changedAtRevision: 0,
        changedAtEpoch: 0,
        effectEdges: undefined,
        holdCount: 0,
        releaseDueAfterWriteMs: -1,
        releaseDueAfterIdleMs: -1,
        releaseDueAfterUnholdMs: -1,
        slotFlags: OIM_SLOT_FLAG_EMPTY,
        owner,
        key: undefined,
        entity: undefined,
        columnSlotStore: undefined,
        storeSlot,
        data: undefined,
        indexKeys: undefined,
    };
    return singleEntitySlot;
}
