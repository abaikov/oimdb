import { OIMDB, OIMSlotContentBucketServiceArrayDriven, OIMSlotContentBucketServiceSetDriven, createOIMBucketService } from '../../index';
import type { TOIMEntitySlot } from '../../index';
import type { TOIMBucketSlotsSetStore } from '../../engine/bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMBucketSlotsArrayStore } from '../../engine/bucket/array/types/TOIMBucketSlotsArrayStore';

type TDeckAndSuit = readonly string[];

export function anArrayKeyBringsItsOwnStore(): void {
    const db = new OIMDB();
    createOIMBucketService<
        TOIMEntitySlot, string, TOIMBucketSlotsSetStore<TOIMEntitySlot>, OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot>() });
    createOIMBucketService<
        TOIMEntitySlot, string, TOIMBucketSlotsArrayStore<TOIMEntitySlot>, OIMSlotContentBucketServiceArrayDriven<TOIMEntitySlot>
    >(db, { slotContentService: new OIMSlotContentBucketServiceArrayDriven<TOIMEntitySlot>() });
    const setContentService = new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot>();
    createOIMBucketService<
        TOIMEntitySlot, TDeckAndSuit, TOIMBucketSlotsSetStore<TOIMEntitySlot>, OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot>
    // @ts-expect-error a map-driven store compares arrays by reference, so an array key must bring its store
    >(db, { slotContentService: setContentService });
    // @ts-expect-error the same for the array-driven collection
    createOIMBucketService<TOIMEntitySlot, TDeckAndSuit>(db, {});
}
