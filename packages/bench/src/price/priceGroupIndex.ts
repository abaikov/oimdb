// Prose: ./README.md#pricegroupindex
import {
    OIMSlotStoreServiceMapDriven,
    createOIMBucketService,
} from '../../../core/src/index';
import type {
    OIMDB,
    OIMSlotContentBucketService,
    TOIMBucketSlot,
    TOIMColumnSlot,
    TOIMEntitySlot,
    TOIMStoreKey,
} from '../../../core/src/index';
import type { TPriceDataRow } from './TPriceDataRow';

export const priceGroupIndex = <TSlots>(
    db: OIMDB,
    slots: readonly TOIMEntitySlot<TPriceDataRow, TOIMStoreKey>[],
    slotContentService: OIMSlotContentBucketService<TOIMEntitySlot<TPriceDataRow>, TSlots>,
    /** The address each row is filed under. `group` unless a pair says otherwise. */
    addressOf: (row: TPriceDataRow) => TOIMStoreKey = row => row.group,
) => {
    const bucketService = createOIMBucketService<
        TOIMEntitySlot<TPriceDataRow>, TOIMStoreKey, TSlots, OIMSlotContentBucketService<TOIMEntitySlot<TPriceDataRow>, TSlots>
    >(db, {
        bucketSlotStoreService: new OIMSlotStoreServiceMapDriven(),
        slotContentService,
        columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
    });
    const bucketStoreSlot = bucketService.createStoreSlot(db);

    // Grouped first and written per bucket second, because `writeBucketMemberSlots` states the
    // WHOLE SLOT LIST of one bucket: calling it once per row would leave every
    // bucket holding its last row.
    const slotsByAddress = new Map<TOIMStoreKey, TOIMEntitySlot<TPriceDataRow, TOIMStoreKey>[]>();
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const entity = slot.entity;
        if (entity === undefined) continue;
        const address = addressOf(entity);
        let list = slotsByAddress.get(address);
        if (list === undefined) {
            list = [];
            slotsByAddress.set(address, list);
        }
        list.push(slot);
    }
    const bucketOf = new Map<TOIMStoreKey, TOIMBucketSlot<TSlots, TOIMStoreKey>>();
    for (const [address, list] of slotsByAddress) {
        const heldSlot = bucketService.holdSlotByKey(bucketStoreSlot, address);
        bucketOf.set(address, heldSlot);
        slotContentService.writeBucketMemberSlots(heldSlot, list);
    }

    return { bucketService, bucketStoreSlot, bucketOf, slotsByAddress };
};
