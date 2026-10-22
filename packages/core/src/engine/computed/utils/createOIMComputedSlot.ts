import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import type { IOIMComputedValueService } from '../interfaces/IOIMComputedValueService';
import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';
import type { TOIMComputedSources } from '../types/TOIMComputedSources';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import { OIM_SLOT_FLAG_EMPTY } from '../../slot/constants/OIM_SLOT_FLAG_EMPTY';

export function createOIMComputedSlot<TValue, TKey>(
    key: TKey,
    owner: IOIMSlotOwner,
    computedValueService: IOIMComputedValueService<TValue>,
    sourceSlots: TOIMComputedSources['sourceSlots'],
    sourceComputeds: TOIMComputedSources['sourceComputeds'],
    initialValue: TValue,
    storeSlot: TOIMStoreSlot | undefined = undefined,
): TOIMComputedSlot<TValue, TKey> {
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
        columnSlotStore: undefined,
        storeSlot,
        owner,
        computedValueService,
        key,
        indexKeys: undefined,
        sourceSlots,
        sourceComputeds,
        value: initialValue,
        ranAtRevision: -1,
        ranAtEpoch: -1,
        checkedAtRevision: -1,
        checkedAtEpoch: -1,
        isDeriving: false,
        allRootSlots: undefined,
    };
}
