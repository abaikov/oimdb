import { OIMDB } from '../OIMDB';
import { OIMDefaults } from '../OIMDefaults';
import { OIMSlotContentSetBucketService } from '../../facade/bucket/OIMSlotContentSetBucketService';
import { OIMSlotTreeStoreService } from '../../engine/store/OIMSlotTreeStoreService';
import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsSetStore } from '../../engine/bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMBucketSlotsArrayStore } from '../../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMEntitySlot } from '../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../engine/store/types/TOIMStoreKey';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';
import { OIMSlotContentPositionalArrayBucketService } from '../../facade/bucket/OIMSlotContentPositionalArrayBucketService';
import { OIMBucketCommands } from '../../facade/bucket/OIMBucketCommands';

type TDeckAndSuit = readonly string[];

describe('what a bucket collection keyed by an array files', () => {
    it('answers a fresh array with the same parts with the same bucket when handed a tree-driven store', () => {
        const db = new OIMDB();
        const decksService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentSetBucketService<TOIMEntitySlot, TDeckAndSuit>(), slotStoreService: new OIMSlotTreeStoreService<
                TOIMStoreKey, TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot>, TDeckAndSuit>
            >(OIMDefaults.KEY_TREE_WALK_SCALAR.getValue()) });
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
            >(OIMDefaults.KEY_TREE_WALK_SCALAR.getValue()) });
        const decks = decksService.createStoreSlot(db);
        const redHearts = decksService.holdSlotByKey(decks, ['red', 'hearts']);
        expect(decksService.getSlotByKey(decks, ['red', 'hearts'])).toBe(redHearts);
    });
});
