import { OIMDB, OIMSlotContentPositionalArrayBucketService, OIMSlotContentSetBucketService } from '../../index';
import type { TOIMEntitySlot } from '../../index';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';
import { OIMBucketCommands } from '../../facade/bucket/OIMBucketCommands';

type TDeckAndSuit = readonly string[];

export function anArrayKeyBringsItsOwnStore(): void {
    const db = new OIMDB();
    createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentSetBucketService<TOIMEntitySlot>() });
    createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentPositionalArrayBucketService<TOIMEntitySlot>() });
    const setContentService = new OIMSlotContentSetBucketService<TOIMEntitySlot>();
    createOIMSlotCollectionService(db, { slotContentService: setContentService });
    // @ts-expect-error the same for the array-driven collection
    createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentPositionalArrayBucketService<TOIMEntitySlot, TDeckAndSuit>({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }) }) });
}
