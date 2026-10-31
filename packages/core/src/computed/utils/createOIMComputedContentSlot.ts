import { OIMComputedSlot } from '../OIMComputedSlot';
import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import type { IOIMComputedValueService } from '../interfaces/IOIMComputedValueService';
import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import type { OIMSourceTracker } from '../OIMSourceTracker';

export function createOIMComputedContentSlot<TValue>(
    owner: IOIMSlotOwner,
    computedValueService: IOIMComputedValueService<TValue>,
    initialValue: TValue,
    storeSlot: TOIMStoreSlot,
    sourceTracker: OIMSourceTracker | undefined,
): TOIMComputedContentSlot<TValue, OIMSourceTracker | undefined> {
    return new OIMComputedSlot<TValue, NonNullable<unknown>, OIMSourceTracker | undefined>(
        undefined as unknown as NonNullable<unknown>, owner, computedValueService, initialValue, storeSlot, sourceTracker,
    );
}
