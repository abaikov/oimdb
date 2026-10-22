import type { OIMDB } from '../OIMDB';
import type { IOIMSlotReleasePolicy } from '../../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotStoreService } from '../../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotOwnerService } from '../../engine/bucket/types/TOIMBucketSlotOwnerService';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { TOIMColumnSlot } from '../../engine/column/types/TOIMColumnSlot';
import type { OIMSlotContentBucketService } from '../../facade/bucket/OIMSlotContentBucketService';
import { createOIMColumnOwnerPushDriven } from '../../engine/column/utils/createOIMColumnOwnerPushDriven';
import { OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE } from '../defaults/OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE';
import { oimColumnOwnerOptionsWithDefault } from './oimColumnOwnerOptionsWithDefault';

export function createOIMBucketSlotOwnerService<TKey, TBucketMemberSlot extends TOIMSlot, TSlots, TStore>(
    db: OIMDB,
    options: {
        slotStoreService: IOIMSlotStoreService<TKey, TOIMBucketSlot<TSlots, TKey>, TStore>;
        slotContentService: OIMSlotContentBucketService<TBucketMemberSlot, TSlots>;
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMColumnSlot> | undefined;
        columnNames?: readonly string[] | undefined;
    },
): TOIMBucketSlotOwnerService<TSlots, TBucketMemberSlot, TKey, TStore> {
    return options.slotContentService.createSlotOwnerService<TKey, TStore>({
        slotStamp: db.slotStamp,
        slotReleasePolicy: options.slotReleasePolicy ?? db.slotReleasePolicy,
        slotStoreService: options.slotStoreService,
        columnOwnerOptions: oimColumnOwnerOptionsWithDefault(
            options.columnSlotStoreService, options.columnNames, OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE.getValue(),
        ),
        createColumnOwner: createOIMColumnOwnerPushDriven,
    });
}
