import type { IOIMSlotStoreService } from '../../../engine/store/interfaces/IOIMSlotStoreService';
import type { IOIMSlotReleasePolicy } from '../../../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMStoreSlotListener } from '../../../engine/slot/interfaces/IOIMStoreSlotListener';
import type { TOIMSameValueGuard } from '../../../engine/slot/types/TOIMSameValueGuard';
import type { TOIMStoreSlot } from '../../../engine/slot/types/TOIMStoreSlot';
import type { TOIMComputedSlot } from '../../../engine/computed/types/TOIMComputedSlot';
import type { TOIMComputedSources } from '../../../engine/computed/types/TOIMComputedSources';
import type { TOIMComputedColumnSlot } from '../../../engine/column/types/TOIMComputedColumnSlot';
import type { TOIMColumnOwnerOptions } from '../../../engine/column/types/TOIMColumnOwnerOptions';

export type TOIMComputedServiceOptions<TKey, TValue, TComputedStore> = {
    computedSlotStoreService: IOIMSlotStoreService<TKey, TOIMComputedSlot<TValue, TKey>, TComputedStore>;
    columnOwnerOptions: TOIMColumnOwnerOptions<TOIMComputedColumnSlot, Extract<keyof TValue, string>>;
    slotReleasePolicy: IOIMSlotReleasePolicy;
    storeSlotListener: IOIMStoreSlotListener;
    createSources?: ((key: TKey, storeSlot: TOIMStoreSlot | undefined) => Partial<TOIMComputedSources>) | undefined;
    derive?: ((computedSlot: TOIMComputedSlot<TValue, TKey>) => TValue) | undefined;
    sameValueGuard?: TOIMSameValueGuard<TValue> | undefined;
    initialValue?: TValue | undefined;
};
