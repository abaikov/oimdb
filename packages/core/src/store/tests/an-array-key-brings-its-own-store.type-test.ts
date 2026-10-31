import { OIMPositionalArrayBucketContentService, OIMSetBucketContentService } from '../../index';
import type { TOIMEntitySlot } from '../../index';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { OIMBucketCommands } from '../../bucket/OIMBucketCommands';

type TDeckAndSuit = readonly string[];

export function anArrayKeyBringsItsOwnStore(): void {
    createOIMSlotCollectionService({ slotContentService: new OIMSetBucketContentService<TOIMEntitySlot>() });
    createOIMSlotCollectionService({ slotContentService: new OIMPositionalArrayBucketContentService<TOIMEntitySlot>() });
    const setContentService = new OIMSetBucketContentService<TOIMEntitySlot>();
    createOIMSlotCollectionService({ slotContentService: setContentService });
    // @ts-expect-error the same for the array-driven collection
    createOIMSlotCollectionService({ slotContentService: new OIMPositionalArrayBucketContentService<TOIMEntitySlot, TDeckAndSuit>({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }) }) });
}
