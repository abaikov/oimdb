import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import { OIM_SLOT_FLAG_EMPTY } from '../../slot/constants/OIM_SLOT_FLAG_EMPTY';

export function createOIMEntitySlot<TEntity extends object, TKey>(
    key: TKey,
    owner: IOIMSlotOwner,
    storeSlot: TOIMStoreSlot | undefined = undefined,
): TOIMEntitySlot<TEntity, TKey> {
    return {
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
        key,
        entity: undefined,
        columnSlotStore: undefined,
        storeSlot,
        data: undefined,
        indexKeys: undefined,
    };
}
