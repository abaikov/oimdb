import type { OIMDB } from '../../db/OIMDB';
import type { IOIMSlotReleasePolicy } from '../../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotSubscriptionListener } from '../interfaces/IOIMSlotSubscriptionListener';
import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { IOIMSlotStamp } from '../interfaces/IOIMSlotStamp';
import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';
import type { TOIMColumnSlotOwnerOptions } from '../../column/types/TOIMColumnSlotOwnerOptions';
import type { OIMPushColumnSlotOwner } from '../../column/OIMPushColumnSlotOwner';
import type { TOIMSlot } from '../types/TOIMSlot';
import { createOIMPushColumnSlotOwner } from '../../column/utils/createOIMPushColumnSlotOwner';
import { OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE } from '../../db/constants/OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE';
import { oimResolveColumnSlotOwnerOptions } from '../../column/utils/oimResolveColumnSlotOwnerOptions';

export function oimResolveSlotOwnerServiceOptions<TColumnName extends string>(
    db: OIMDB,
    options: {
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        slotSubscriptionListener?: IOIMSlotSubscriptionListener | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMColumnSlot> | undefined;
        columnNames?: readonly TColumnName[] | undefined;
    },
): {
    slotStamp: IOIMSlotStamp<TOIMSlot> | undefined;
    slotReleasePolicy: IOIMSlotReleasePolicy | undefined;
    slotSubscriptionListener: IOIMSlotSubscriptionListener | undefined;
    columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TOIMColumnSlot, TColumnName>;
    createColumnSlotOwner: (columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TOIMColumnSlot, TColumnName>) => OIMPushColumnSlotOwner;
} {
    return {
        slotStamp: db.slotStamp,
        slotReleasePolicy: options.slotReleasePolicy ?? db.slotReleasePolicy,
        slotSubscriptionListener: options.slotSubscriptionListener,
        columnSlotOwnerOptions: oimResolveColumnSlotOwnerOptions(
            options.columnSlotStoreService, options.columnNames, OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE.getValue(),
        ),
        createColumnSlotOwner: createOIMPushColumnSlotOwner,
    };
}
