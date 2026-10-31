import { OIMComputedSlot } from '../OIMComputedSlot';
import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import type { IOIMComputedValueService } from '../interfaces/IOIMComputedValueService';
import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import type { OIMSourceTracker } from '../OIMSourceTracker';

export function createOIMComputedSlot<TValue, TKey extends NonNullable<unknown>>(
    key: TKey,
    owner: IOIMSlotOwner,
    computedValueService: IOIMComputedValueService<TValue>,
    initialValue: TValue,
    storeSlot: TOIMStoreSlot,
    sourceTracker: OIMSourceTracker | undefined,
): TOIMComputedSlot<TValue, TKey, OIMSourceTracker | undefined> {
    return new OIMComputedSlot<TValue, TKey, OIMSourceTracker | undefined>(key, owner, computedValueService, initialValue, storeSlot, sourceTracker);
}
