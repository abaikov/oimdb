import { OIMDB } from '../../../factories/OIMDB';
import { createOIMSlotCollectionIndexService } from '../../../factories/createOIMSlotCollectionIndexService';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';
import { OIMSlotTreeStoreService } from '../../../engine/store/OIMSlotTreeStoreService';
import { OIMDefaults } from '../../../factories/OIMDefaults';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import type { TOIMBucketSlot } from '../../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsArrayStore } from '../../../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { IOIMSlotStoreService } from '../../../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMSlotStoreTree } from '../../../engine/store/types/TOIMSlotStoreTree';

type TCard = { id: string; deck: string; suit: string };

const byDeckAndSuitBucketStoreService = <TSlots = TOIMBucketSlotsArrayStore<TOIMEntitySlot<TCard>>>() => new OIMSlotTreeStoreService<
    TOIMStoreKey, TOIMBucketSlot<TSlots, readonly [string, string]>
>(OIMDefaults.KEY_TREE_WALK_SCALAR.getValue()) as unknown as IOIMSlotStoreService<
    readonly [string, string], TOIMBucketSlot<TSlots, readonly [string, string]>,
    TOIMSlotStoreTree<TOIMBucketSlot<TSlots, readonly [string, string]>, TOIMStoreKey>
>;


describe('what a read of several keys scans', () => {
    it('fills every composite bucket it mints from one pass over the source', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });
        const cards = cardsService.createStoreSlot(db);
        cardsService.writeInBatch(cards, () => ([
            { id: 'c1', deck: 'red', suit: 'hearts' },
            { id: 'c2', deck: 'red', suit: 'hearts' },
            { id: 'c3', deck: 'red', suit: 'spades' },
            { id: 'c4', deck: 'blue', suit: 'hearts' },
        ]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        db.flush();
        const byDeckAndSuitService = createOIMSlotCollectionIndexService(db, { bucketSlotStoreService: byDeckAndSuitBucketStoreService(),
            entityService: cardsService,
            keyOf: (card: TCard): readonly [string, string] => [card.deck, card.suit], columns: ['deck', 'suit'],
        });
        const byDeckAndSuit = byDeckAndSuitService.createIndexStoreSlot(cards);
        const getSlots = jest.spyOn(cardsService, 'getSlots');

        const [redHearts, redSpades, blueHearts, blueSpades] = byDeckAndSuitService.getSlotsByKeys(byDeckAndSuit, [
            ['red', 'hearts'], ['red', 'spades'], ['blue', 'hearts'], ['blue', 'spades'],
        ]);

        expect(getSlots).toHaveBeenCalledTimes(1);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(redHearts)).toBe(2);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(redSpades)).toBe(1);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(blueHearts)).toBe(1);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(blueSpades)).toBe(0);
    });

    it('inside a frame, after a hand mutation, fills the minted buckets and leaves the mutated entity where the index filed it', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMSlotCollectionIndexService(db, { entityService: cardsService, keyOf: (card: TCard) => card.deck });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        byDeckService.holdSlotByKey(byDeck, 'spades');
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades', suit: 's' });
        cardsService.writeSlotContentByKey(cards, 'h1', { id: 'h1', deck: 'hearts', suit: 'h' });
        const trigger = cardsService.writeSlotContentByKey(cards, 't', { id: 't', deck: 'none', suit: 'n' });
        db.flush();
        (card.entity as TCard).deck = 'clubs';

        const memberCountsInsideTheFrame: number[][] = [];
        OIMEffectService.INSTANCE.createEffect(db, [trigger], [], () => {
            const [clubs, hearts] = byDeckService.getSlotsByKeys(byDeck, ['clubs', 'hearts']);
            memberCountsInsideTheFrame.push([
                byDeckService.slotContentService.getBucketMemberSlotCount(clubs),
                byDeckService.slotContentService.getBucketMemberSlotCount(hearts),
            ]);
        });
        cardsService.slotContentService.updateEntity(trigger, { deck: 'none again' });
        db.flush();

        expect(memberCountsInsideTheFrame).toEqual([[0, 1]]);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades').map(entity => entity?.id)).toEqual(['c1']);

        byDeckService.holdSlotByKey(byDeck, 'clubs');
        cardsService.slotContentService.markEntityChanged(card, ['deck']);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades')).toEqual([]);
        expect(byDeckService.getEntitiesByKey(byDeck, 'clubs').map(entity => entity?.id)).toEqual(['c1']);
    });
});
