import { OIMDB } from '../../db/OIMDB';
import { OIMDefaults } from '../../db/OIMDefaults';
import { OIMSlotContentSetBucketService } from '../OIMSlotContentSetBucketService';
import { OIMSlotTreeStoreService } from '../../store/OIMSlotTreeStoreService';
import type { TOIMBucketSlot } from '../types/TOIMBucketSlot';
import type { TOIMBucketSlotsSetStore } from '../types/TOIMBucketSlotsSetStore';
import type { TOIMBucketSlotsArrayStore } from '../array/types/TOIMBucketSlotsArrayStore';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { OIMSlotContentPositionalArrayBucketService } from '../OIMSlotContentPositionalArrayBucketService';
import { OIMBucketCommands } from '../OIMBucketCommands';

type TDeckAndSuit = readonly string[];

describe('what a bucket collection keyed by an array files', () => {
    it('answers a fresh array with the same parts with the same bucket when handed a tree-driven store', () => {
        const db = new OIMDB();
        const decksService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentSetBucketService<TOIMEntitySlot, TDeckAndSuit>(), slotStoreService: new OIMSlotTreeStoreService<
                TOIMStoreKey, TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot>, TDeckAndSuit>
            >(OIMDefaults.SCALAR_KEY_TREE_WALK.getValue()) });
        const decks = decksService.createStoreSlot(db);
        const redHearts = decksService.holdSlotByKey(decks, ['red', 'hearts']);
        expect(decksService.getSlotByKey(decks, ['red', 'hearts'])).toBe(redHearts);
        expect(decksService.isSameKey(['red', 'hearts'], ['red', 'hearts'])).toBe(true);
        expect(decksService.isSameKey(['red', 'hearts'], ['red', 'spades'])).toBe(false);
    });

    it('does the same in an array-driven collection', () => {
        const db = new OIMDB();
        const decksService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentPositionalArrayBucketService<TOIMEntitySlot, TDeckAndSuit>({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }) }), slotStoreService: new OIMSlotTreeStoreService<
                TOIMStoreKey, TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot>, TDeckAndSuit>
            >(OIMDefaults.SCALAR_KEY_TREE_WALK.getValue()) });
        const decks = decksService.createStoreSlot(db);
        const redHearts = decksService.holdSlotByKey(decks, ['red', 'hearts']);
        expect(decksService.getSlotByKey(decks, ['red', 'hearts'])).toBe(redHearts);
    });
});
