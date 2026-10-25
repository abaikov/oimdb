import type { OIMDB } from '../OIMDB';
import type { IOIMSlotReleasePolicy } from '../../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotSubscriptionListener } from '../../engine/slot/interfaces/IOIMSlotSubscriptionListener';
import type { IOIMSlotStoreService } from '../../engine/store/interfaces/IOIMSlotStoreService';
import type { IOIMSlotStamp } from '../../engine/slot/interfaces/IOIMSlotStamp';
import type { TOIMColumnSlot } from '../../engine/column/types/TOIMColumnSlot';
import type { TOIMColumnSlotOwnerOptions } from '../../engine/column/types/TOIMColumnSlotOwnerOptions';
import type { OIMPushColumnSlotOwner } from '../../engine/column/OIMPushColumnSlotOwner';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import { createOIMPushColumnSlotOwner } from '../../engine/column/utils/createOIMPushColumnSlotOwner';
import { OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE } from '../defaults/OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE';
import { oimColumnOwnerOptionsWithDefault } from './oimColumnOwnerOptionsWithDefault';

export function oimSlotOwnerOptionsWithDefault<TColumnName extends string>(
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
        columnSlotOwnerOptions: oimColumnOwnerOptionsWithDefault(
            options.columnSlotStoreService, options.columnNames, OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE.getValue(),
        ),
        createColumnSlotOwner: createOIMPushColumnSlotOwner,
    };
}
