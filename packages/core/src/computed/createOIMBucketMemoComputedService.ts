import type { IOIMSlotReleasePolicy } from '../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { OIMPushColumnSlotOwner } from '../column/OIMPushColumnSlotOwner';
import type { TOIMColumnSlot } from '../column/types/TOIMColumnSlot';
import type { TOIMComputedColumnSlot } from '../column/types/TOIMComputedColumnSlot';
import type { TOIMBucketSlot } from '../bucket/types/TOIMBucketSlot';
import type { TOIMComputedSlot } from './types/TOIMComputedSlot';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMDefaultSlotStore } from '../store/types/TOIMDefaultSlotStore';
import type { OIMSlotContentBucketService } from '../bucket/OIMSlotContentBucketService';
import type { OIMSlotCollectionService } from '../slot/OIMSlotCollectionService';
import { OIMSlotAtUnholdReleasePolicy } from '../collector/OIMSlotAtUnholdReleasePolicy';
import { OIMBucketMemoComputedService } from './OIMBucketMemoComputedService';
import { OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE } from '../db/constants/OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from '../db/constants/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { oimResolveSlotStoreService } from '../store/utils/oimResolveSlotStoreService';

export function createOIMBucketMemoComputedService<
    TKey extends NonNullable<unknown>, TBucketMemberSlot extends TOIMSlot, TSlots, TBucketStore,
    TComputedStore = TOIMDefaultSlotStore<TKey, TOIMComputedSlot<readonly TBucketMemberSlot[], TKey>>,
>(
    options: {
        bucketCollectionService: OIMSlotCollectionService<
            TKey, TOIMBucketSlot<TSlots, TKey>, TBucketStore, OIMSlotContentBucketService<TBucketMemberSlot, TSlots>,
            string, TOIMColumnSlot, OIMPushColumnSlotOwner, readonly TBucketMemberSlot[]
        >;
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMComputedColumnSlot> | undefined;
        computedSlotStoreService?: IOIMSlotStoreService<TKey, TOIMComputedSlot<readonly TBucketMemberSlot[], TKey>, TComputedStore> | undefined;
    },
): OIMBucketMemoComputedService<TKey, TBucketMemberSlot, TSlots, TBucketStore, TComputedStore> {
    return new OIMBucketMemoComputedService<TKey, TBucketMemberSlot, TSlots, TBucketStore, TComputedStore>({
        bucketCollectionService: options.bucketCollectionService,
        computedSlotStoreService: oimResolveSlotStoreService(options.computedSlotStoreService),
        columnSlotStoreService: options.columnSlotStoreService ?? OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE.getValue(),
        slotReleasePolicy: options.slotReleasePolicy ?? OIMSlotAtUnholdReleasePolicy.INSTANCE,
        storeSlotListener: OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
    });
}
