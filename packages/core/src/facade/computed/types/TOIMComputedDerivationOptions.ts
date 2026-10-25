import type { IOIMSlotReleasePolicy } from '../../../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMStoreSlotListener } from '../../../engine/slot/interfaces/IOIMStoreSlotListener';
import type { TOIMSameValueGuard } from '../../../engine/slot/types/TOIMSameValueGuard';
import type { TOIMComputedContentSlot } from '../../../engine/computed/types/TOIMComputedContentSlot';
import type { TOIMComputedSources } from '../../../engine/computed/types/TOIMComputedSources';
import type { TOIMComputedColumnSlot } from '../../../engine/column/types/TOIMComputedColumnSlot';
import type { TOIMColumnSlotOwnerOptions } from '../../../engine/column/types/TOIMColumnSlotOwnerOptions';

export type TOIMComputedDerivationOptions<TValue, TComputedSlot extends TOIMComputedContentSlot<TValue>> = {
    columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TOIMComputedColumnSlot, Extract<keyof TValue, string>>;
    slotReleasePolicy: IOIMSlotReleasePolicy;
    storeSlotListener: IOIMStoreSlotListener;
    createSources?: ((computedSlot: TComputedSlot) => Partial<TOIMComputedSources>) | undefined;
    derive?: ((computedSlot: TComputedSlot) => TValue) | undefined;
    sameValueGuard?: TOIMSameValueGuard<TValue> | undefined;
    initialValue?: TValue | undefined;
};
