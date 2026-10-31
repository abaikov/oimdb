import { OIMSlotContentPositionalArrayBucketService, OIMSlotContentSetBucketService } from '../../index';
import type { TOIMEntitySlot } from '../../index';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { OIMBucketCommands } from '../../bucket/OIMBucketCommands';

type TDeckAndSuit = readonly string[];

export function anArrayKeyBringsItsOwnStore(): void {
    createOIMSlotCollectionService({ slotContentService: new OIMSlotContentSetBucketService<TOIMEntitySlot>() });
    createOIMSlotCollectionService({ slotContentService: new OIMSlotContentPositionalArrayBucketService<TOIMEntitySlot>() });
    const setContentService = new OIMSlotContentSetBucketService<TOIMEntitySlot>();
    createOIMSlotCollectionService({ slotContentService: setContentService });
    // @ts-expect-error the same for the array-driven collection
    createOIMSlotCollectionService({ slotContentService: new OIMSlotContentPositionalArrayBucketService<TOIMEntitySlot, TDeckAndSuit>({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }) }) });
}
