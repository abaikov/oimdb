import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import type { IOIMComputedValueService } from '../interfaces/IOIMComputedValueService';
import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import { OIM_SLOT_FLAG_EMPTY } from '../../slot/constants/OIM_SLOT_FLAG_EMPTY';
import { OIM_FROZEN_EMPTY_COMPUTED_SLOTS } from '../constants/OIM_FROZEN_EMPTY_COMPUTED_SLOTS';

export function createOIMSingleComputedSlot<TValue>(
    owner: IOIMSlotOwner,
    computedValueService: IOIMComputedValueService<TValue>,
    initialValue: TValue,
    storeSlot: TOIMStoreSlot,
): TOIMComputedContentSlot<TValue> {
    const singleComputedSlot = {
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
        key: undefined,
        indexKeys: undefined,
        sourceSlots: OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
        sourceComputeds: OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
        value: initialValue,
        ranAtRevision: -1,
        ranAtEpoch: -1,
        checkedAtRevision: -1,
        checkedAtEpoch: -1,
        isDeriving: false,
        allRootSlots: undefined,
    };
    return singleComputedSlot;
}
