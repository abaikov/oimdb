import { OIMDB } from '../../db/OIMDB';
import { OIMScalarKeyTreeWalk } from '../../key/OIMScalarKeyTreeWalk';

import { OIMSetBucketContentService } from '../OIMSetBucketContentService';
import { OIMSlotTreeStoreService } from '../../store/OIMSlotTreeStoreService';
import type { TOIMBucketSlot } from '../types/TOIMBucketSlot';
import type { TOIMBucketSlotsSetStore } from '../types/TOIMBucketSlotsSetStore';
import type { TOIMBucketSlotsArrayStore } from '../array/types/TOIMBucketSlotsArrayStore';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { OIMPositionalArrayBucketContentService } from '../OIMPositionalArrayBucketContentService';
import { OIMBucketCommands } from '../OIMBucketCommands';

type TDeckAndSuit = readonly string[];

describe('what a bucket collection keyed by an array files', () => {
    it('answers a fresh array with the same parts with the same bucket when handed a tree-driven store', () => {
        const db = new OIMDB();
        const decksService = createOIMSlotCollectionService({ slotContentService: new OIMSetBucketContentService<TOIMEntitySlot, TDeckAndSuit>(), slotStoreService: new OIMSlotTreeStoreService<
                TOIMStoreKey, TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot>, TDeckAndSuit>
            >(OIMScalarKeyTreeWalk.INSTANCE) });
        const decks = decksService.createStoreSlot(db);
        const redHearts = decksService.holdSlotByKey(decks, ['red', 'hearts']);
        expect(decksService.getSlotByKey(decks, ['red', 'hearts'])).toBe(redHearts);
        expect(decksService.isSameKey(['red', 'hearts'], ['red', 'hearts'])).toBe(true);
        expect(decksService.isSameKey(['red', 'hearts'], ['red', 'spades'])).toBe(false);
    });

    it('does the same in an array-driven collection', () => {
        const db = new OIMDB();
        const decksService = createOIMSlotCollectionService({ slotContentService: new OIMPositionalArrayBucketContentService<TOIMEntitySlot, TDeckAndSuit>({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }) }), slotStoreService: new OIMSlotTreeStoreService<
                TOIMStoreKey, TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot>, TDeckAndSuit>
            >(OIMScalarKeyTreeWalk.INSTANCE) });
        const decks = decksService.createStoreSlot(db);
        const redHearts = decksService.holdSlotByKey(decks, ['red', 'hearts']);
        expect(decksService.getSlotByKey(decks, ['red', 'hearts'])).toBe(redHearts);
    });
});
