import type { OIMDB } from './OIMDB';
import type { IOIMSlotReleasePolicy } from '../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotStoreService } from '../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMBucketSlot } from '../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsArrayStore } from '../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMEntitySlot } from '../engine/entity/types/TOIMEntitySlot';
import type { TOIMSlot } from '../engine/slot/types/TOIMSlot';
import type { TOIMColumnSlot } from '../engine/column/types/TOIMColumnSlot';
import type { OIMColumnOwnerPushDriven } from '../engine/column/OIMColumnOwnerPushDriven';
import type { OIMSlotContentBucketService } from '../facade/bucket/OIMSlotContentBucketService';
import { OIMSingleSlotService } from '../facade/slot/OIMSingleSlotService';
import { OIMSlotStoreServiceSingleSlotDriven } from '../engine/store/OIMSlotStoreServiceSingleSlotDriven';
import { OIMSlotContentBucketServiceArrayDriven } from '../facade/bucket/OIMSlotContentBucketServiceArrayDriven';
import { OIMBucketCommands } from '../facade/bucket/OIMBucketCommands';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from './defaults/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { createOIMBucketSlotOwnerService } from './utils/createOIMBucketSlotOwnerService';

export function createOIMSingleBucketService<
    TBucketMemberSlot extends TOIMSlot = TOIMEntitySlot,
    TSlots = TOIMBucketSlotsArrayStore<TBucketMemberSlot>,
    TSlotContentService extends OIMSlotContentBucketService<TBucketMemberSlot, TSlots>
        = OIMSlotContentBucketServiceArrayDriven<TBucketMemberSlot> & OIMSlotContentBucketService<TBucketMemberSlot, TSlots>,
>(
    db: OIMDB,
    options: {
        slotContentService?: (TSlotContentService & OIMSlotContentBucketService<TBucketMemberSlot, TSlots>) | undefined;
        maxCommandsPerSlot?: number | undefined;
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMColumnSlot> | undefined;
        columnNames?: readonly string[] | undefined;
    } = {},
): OIMSingleSlotService<
    TOIMBucketSlot<TSlots, void>, TSlotContentService,
    string, TOIMColumnSlot, OIMColumnOwnerPushDriven, readonly TBucketMemberSlot[]
> {
    const slotStoreService = OIMSlotStoreServiceSingleSlotDriven.INSTANCE as unknown as OIMSlotStoreServiceSingleSlotDriven<TOIMBucketSlot<TSlots, void>>;
    const slotContentService = options.slotContentService ?? new OIMSlotContentBucketServiceArrayDriven<TBucketMemberSlot>({
        bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: options.maxCommandsPerSlot }),
    }) as unknown as TSlotContentService;
    return new OIMSingleSlotService({
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
