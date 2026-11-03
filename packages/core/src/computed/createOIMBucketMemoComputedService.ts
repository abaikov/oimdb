import type { TOIMColumnGroup } from '../column/types/TOIMColumnGroup';
import type { IOIMSlotSubscriptionListener } from '../slot/interfaces/IOIMSlotSubscriptionListener';
import { resolveOIMColumnSlotOwnerOptions } from '../column/utils/resolveOIMColumnSlotOwnerOptions';
import type { IOIMSlotReleasePolicy } from '../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { OIMPushColumnSlotOwner } from '../column/OIMPushColumnSlotOwner';
import type { TOIMColumnSlot } from '../column/types/TOIMColumnSlot';
import type { TOIMComputedColumnSlot } from '../column/types/TOIMComputedColumnSlot';
import type { TOIMBucketSlot } from '../bucket/types/TOIMBucketSlot';
import type { TOIMComputedSlot } from './types/TOIMComputedSlot';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMDefaultSlotStore } from '../store/types/TOIMDefaultSlotStore';
import type { OIMBucketContentService } from '../bucket/OIMBucketContentService';
import type { OIMSlotCollectionService } from '../slot/OIMSlotCollectionService';
import { OIMSlotAtUnholdReleasePolicy } from '../collector/OIMSlotAtUnholdReleasePolicy';
import { OIMBucketMemoComputedService } from './OIMBucketMemoComputedService';
import { OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE } from '../db/constants/OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from '../db/constants/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { OIMDefaults } from '../db/OIMDefaults';
import { resolveOIMSlotStoreService } from '../store/utils/resolveOIMSlotStoreService';

export function createOIMBucketMemoComputedService<
    TKey extends NonNullable<unknown>, TBucketMemberSlot extends TOIMSlot, TSlots, TBucketStore,
    TComputedStore = TOIMDefaultSlotStore<TKey, TOIMComputedSlot<readonly TBucketMemberSlot[], TKey>>,
>(
    options: {
        defaults?: OIMDefaults | undefined;
        bucketCollectionService: OIMSlotCollectionService<
            TKey, TOIMBucketSlot<TSlots, TKey>, TBucketStore, OIMBucketContentService<TBucketMemberSlot, TSlots>,
            string, TOIMColumnSlot, OIMPushColumnSlotOwner, readonly TBucketMemberSlot[]
        >;
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMComputedColumnSlot> | undefined;
        columnNames?: readonly string[] | undefined;
        columnGroups?: readonly TOIMColumnGroup<string>[] | undefined;
        slotSubscriptionListener?: IOIMSlotSubscriptionListener | undefined;
        slotStoreService?: IOIMSlotStoreService<TKey, TOIMComputedSlot<readonly TBucketMemberSlot[], TKey>, TComputedStore> | undefined;
    },
): OIMBucketMemoComputedService<TKey, TBucketMemberSlot, TSlots, TBucketStore, TComputedStore> {
    const defaults = options.defaults ?? OIMDefaults.INSTANCE;
    return new OIMBucketMemoComputedService<TKey, TBucketMemberSlot, TSlots, TBucketStore, TComputedStore>({
        bucketCollectionService: options.bucketCollectionService,
        slotStoreService: resolveOIMSlotStoreService(options.slotStoreService),
        columnSlotOwnerOptions: resolveOIMColumnSlotOwnerOptions(
            options.columnSlotStoreService, options.columnNames, options.columnGroups,
            defaults.computedColumnSlotStoreService ?? OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE.getValue(),
        ),
        slotSubscriptionListener: options.slotSubscriptionListener,
        slotReleasePolicy: options.slotReleasePolicy ?? OIMSlotAtUnholdReleasePolicy.INSTANCE,
        storeSlotListener: defaults.storeSlotListener ?? OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
    });
}
