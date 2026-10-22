import type { OIMDB } from './OIMDB';
import type { IOIMSlotReleasePolicy } from '../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotStoreService } from '../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMBucketSlot } from '../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsArrayStore } from '../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMEntitySlot } from '../engine/entity/types/TOIMEntitySlot';
import type { TOIMSlot } from '../engine/slot/types/TOIMSlot';
import type { TOIMStoreKey } from '../engine/store/types/TOIMStoreKey';
import type { TOIMColumnSlot } from '../engine/column/types/TOIMColumnSlot';
import type { OIMColumnOwnerPushDriven } from '../engine/column/OIMColumnOwnerPushDriven';
import type { OIMSlotContentBucketService } from '../facade/bucket/OIMSlotContentBucketService';
import type { TOIMBucketCollectionFactoryArguments } from './types/TOIMBucketCollectionFactoryArguments';
import { OIMSlotCollectionService } from '../facade/slot/OIMSlotCollectionService';
import { OIMSlotContentBucketServiceArrayDriven } from '../facade/bucket/OIMSlotContentBucketServiceArrayDriven';
import { OIMBucketCommands } from '../facade/bucket/OIMBucketCommands';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from './defaults/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { oimSlotStoreServiceWithDefault } from './utils/oimSlotStoreServiceWithDefault';
import { createOIMBucketSlotOwnerService } from './utils/createOIMBucketSlotOwnerService';

export function createOIMBucketService<
    TBucketMemberSlot extends TOIMSlot = TOIMEntitySlot,
    TKey extends TOIMStoreKey | readonly unknown[] = TOIMStoreKey,
    TSlots = TOIMBucketSlotsArrayStore<TBucketMemberSlot>,
    TSlotContentService extends OIMSlotContentBucketService<TBucketMemberSlot, TSlots>
        = OIMSlotContentBucketServiceArrayDriven<TBucketMemberSlot> & OIMSlotContentBucketService<TBucketMemberSlot, TSlots>,
    TStore = Map<TKey, TOIMBucketSlot<TSlots, TKey>>,
>(
    db: OIMDB,
    ...[options = {}]: TOIMBucketCollectionFactoryArguments<TKey, TOIMBucketSlot<TSlots, TKey>, TStore, {
        slotContentService?: (TSlotContentService & OIMSlotContentBucketService<TBucketMemberSlot, TSlots>) | undefined;
        bucketSlotStoreService?: IOIMSlotStoreService<TKey, TOIMBucketSlot<TSlots, TKey>, TStore> | undefined;
        maxCommandsPerSlot?: number | undefined;
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMColumnSlot> | undefined;
        columnNames?: readonly string[] | undefined;
    }>
): OIMSlotCollectionService<
    TKey, TOIMBucketSlot<TSlots, TKey>, TStore, TSlotContentService,
    string, TOIMColumnSlot, OIMColumnOwnerPushDriven, readonly TBucketMemberSlot[]
> {
    const slotStoreService = oimSlotStoreServiceWithDefault(options.bucketSlotStoreService);
    const slotContentService = options.slotContentService ?? new OIMSlotContentBucketServiceArrayDriven<TBucketMemberSlot>({
        bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: options.maxCommandsPerSlot }),
    }) as unknown as TSlotContentService;
    return new OIMSlotCollectionService({
        slotOwnerService: createOIMBucketSlotOwnerService(db, {
            slotStoreService,
            slotContentService,
            slotReleasePolicy: options.slotReleasePolicy,
            columnSlotStoreService: options.columnSlotStoreService,
            columnNames: options.columnNames,
        }),
        slotStoreService,
        slotContentService,
        storeSlotListener: OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
    });
}
