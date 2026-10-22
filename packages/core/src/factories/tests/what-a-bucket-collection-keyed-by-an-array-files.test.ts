import { OIMDB } from '../OIMDB';
import { OIMDefaults } from '../OIMDefaults';
import { createOIMBucketService } from '../createOIMBucketService';
import { OIMSlotContentBucketServiceSetDriven } from '../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import type { OIMSlotContentBucketServiceArrayDriven } from '../../facade/bucket/OIMSlotContentBucketServiceArrayDriven';
import { OIMSlotStoreServiceTreeDriven } from '../../engine/store/OIMSlotStoreServiceTreeDriven';
import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsSetStore } from '../../engine/bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMBucketSlotsArrayStore } from '../../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMEntitySlot } from '../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../engine/store/types/TOIMStoreKey';
import type { TOIMSlotStoreTree } from '../../engine/store/types/TOIMSlotStoreTree';

type TDeckAndSuit = readonly string[];

describe('what a bucket collection keyed by an array files', () => {
    it('answers a fresh array with the same parts with the same bucket when handed a tree-driven store', () => {
        const db = new OIMDB();
        const decksService = createOIMBucketService<
            TOIMEntitySlot, TDeckAndSuit, TOIMBucketSlotsSetStore<TOIMEntitySlot>, OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot>,
            TOIMSlotStoreTree<TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot>, TDeckAndSuit>, TOIMStoreKey>
        >(db, {
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot>(),
            bucketSlotStoreService: new OIMSlotStoreServiceTreeDriven<
                TOIMStoreKey, TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot>, TDeckAndSuit>
            >(OIMDefaults.KEY_TREE_WALK_SCALAR.getValue()),
        });
        const decks = decksService.createStoreSlot(db);
        const redHearts = decksService.holdSlotByKey(decks, ['red', 'hearts']);
        expect(decksService.getSlotByKey(decks, ['red', 'hearts'])).toBe(redHearts);
        expect(decksService.isSameKey(['red', 'hearts'], ['red', 'hearts'])).toBe(true);
        expect(decksService.isSameKey(['red', 'hearts'], ['red', 'spades'])).toBe(false);
    });

    it('does the same in an array-driven collection', () => {
        const db = new OIMDB();
        const decksService = createOIMBucketService<
            TOIMEntitySlot, TDeckAndSuit, TOIMBucketSlotsArrayStore<TOIMEntitySlot>, OIMSlotContentBucketServiceArrayDriven<TOIMEntitySlot>,
            TOIMSlotStoreTree<TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot>, TDeckAndSuit>, TOIMStoreKey>
        >(db, {
            bucketSlotStoreService: new OIMSlotStoreServiceTreeDriven<
                TOIMStoreKey, TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot>, TDeckAndSuit>
            >(OIMDefaults.KEY_TREE_WALK_SCALAR.getValue()),
        });
        const decks = decksService.createStoreSlot(db);
        const redHearts = decksService.holdSlotByKey(decks, ['red', 'hearts']);
        expect(decksService.getSlotByKey(decks, ['red', 'hearts'])).toBe(redHearts);
    });
});
