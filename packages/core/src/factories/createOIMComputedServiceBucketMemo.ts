import type { IOIMSlotReleasePolicy } from '../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotStoreService } from '../engine/store/interfaces/IOIMSlotStoreService';
import type { OIMColumnOwnerPushDriven } from '../engine/column/OIMColumnOwnerPushDriven';
import type { TOIMColumnSlot } from '../engine/column/types/TOIMColumnSlot';
import type { TOIMComputedColumnSlot } from '../engine/column/types/TOIMComputedColumnSlot';
import type { TOIMBucketSlot } from '../engine/bucket/types/TOIMBucketSlot';
import type { TOIMComputedSlot } from '../engine/computed/types/TOIMComputedSlot';
import type { TOIMSlot } from '../engine/slot/types/TOIMSlot';
import type { TOIMDefaultSlotStore } from '../engine/store/types/TOIMDefaultSlotStore';
import type { OIMSlotContentBucketService } from '../facade/bucket/OIMSlotContentBucketService';
import type { OIMSlotCollectionService } from '../facade/slot/OIMSlotCollectionService';
import { OIMSlotReleasePolicyAtUnhold } from '../engine/collector/OIMSlotReleasePolicyAtUnhold';
import { OIMComputedServiceBucketMemo } from '../facade/computed/OIMComputedServiceBucketMemo';
import { OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE } from './defaults/OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from './defaults/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { oimSlotStoreServiceWithDefault } from './utils/oimSlotStoreServiceWithDefault';

export function createOIMComputedServiceBucketMemo<
    TKey, TBucketMemberSlot extends TOIMSlot, TSlots, TBucketStore,
    TComputedStore = TOIMDefaultSlotStore<TKey, TOIMComputedSlot<readonly TBucketMemberSlot[], TKey>>,
>(
    options: {
        bucketCollectionService: OIMSlotCollectionService<
            TKey, TOIMBucketSlot<TSlots, TKey>, TBucketStore, OIMSlotContentBucketService<TBucketMemberSlot, TSlots>,
            string, TOIMColumnSlot, OIMColumnOwnerPushDriven, readonly TBucketMemberSlot[]
        >;
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMComputedColumnSlot> | undefined;
    } & ([TComputedStore] extends [Map<TKey, TOIMComputedSlot<readonly TBucketMemberSlot[], TKey>>]
        ? { computedSlotStoreService?: IOIMSlotStoreService<TKey, TOIMComputedSlot<readonly TBucketMemberSlot[], TKey>, TComputedStore> | undefined }
        : { computedSlotStoreService: IOIMSlotStoreService<TKey, TOIMComputedSlot<readonly TBucketMemberSlot[], TKey>, TComputedStore> }),
): OIMComputedServiceBucketMemo<TKey, TBucketMemberSlot, TSlots, TBucketStore, TComputedStore> {
    return new OIMComputedServiceBucketMemo<TKey, TBucketMemberSlot, TSlots, TBucketStore, TComputedStore>({
        bucketCollectionService: options.bucketCollectionService,
        computedSlotStoreService: oimSlotStoreServiceWithDefault(options.computedSlotStoreService),
        columnSlotStoreService: options.columnSlotStoreService ?? OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE.getValue(),
        slotReleasePolicy: options.slotReleasePolicy ?? OIMSlotReleasePolicyAtUnhold.INSTANCE,
        storeSlotListener: OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
    });
}
