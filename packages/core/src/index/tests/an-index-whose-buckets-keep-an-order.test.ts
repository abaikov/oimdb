import { OIMDB } from '../../db/OIMDB';
import { createOIMSlotCollectionIndexService } from '../createOIMSlotCollectionIndexService';
import { createOIMSortedComputedService } from '../../computed/createOIMSortedComputedService';
import type { OIMPositionalArrayBucketContentService } from '../../bucket/OIMPositionalArrayBucketContentService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMSortColumn } from '../../computed/types/TOIMSortColumn';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { readValueWithoutTracking } from '../../../tests/support/readValueWithoutTracking';

type TCard = { id: string; deck: string; rank: number };
type TCardSlot = TOIMEntitySlot<TCard>;

type TSorter = {
    sortColumns?: readonly TOIMSortColumn<TCard>[];
    comparator?: (left: TCard, right: TCard) => number;
};

const createFixture = (
    slotContentService?: OIMPositionalArrayBucketContentService<TCardSlot>,
    sorter?: TSorter,
) => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMSlotCollectionIndexService({
        entityService: cardsService,
        selectKey: (card: TCard) => card.deck,
        ...(slotContentService === undefined ? {} : { slotContentService }),
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const ordersService = createOIMSortedComputedService({ indexService: byDeckService, ...sorter });
    const orders = ordersService.createSortedStoreSlot(byDeck);
    const idsIn = (deck: string): string[] =>
        Array.from(byDeckService.slotContentService.getBucketMemberSlots(byDeckService.getSlotByKey(byDeck, deck))).map(slot => slot.entity?.id ?? '');
    return { db, cards, cardsService, byDeck, byDeckService, orders, ordersService, idsIn };
};

describe('an index whose buckets are array-driven', () => {
    it('files entity slots in arrival order when no service is passed', () => {
        const { db, cards, cardsService, idsIn } = createFixture();
        cardsService.writeInBatch(cards, () => ([
            { id: 'c3', deck: 'spades', rank: 3 },
            { id: 'c1', deck: 'spades', rank: 1 },
            { id: 'c2', deck: 'clubs', rank: 2 },
        ]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        db.flush();
        expect(idsIn('spades')).toEqual(['c3', 'c1']);
        expect(idsIn('clubs')).toEqual(['c2']);
    });

    it('reads a key\'s order sorted by the sorter the index was handed, and leaves the bucket in arrival order', () => {
        const { db, cards, cardsService, ordersService, orders, idsIn } = createFixture(undefined, {
            comparator: (left, right) => left.rank - right.rank,
        });
        const order = ordersService.holdSlotByKey(orders, 'spades');
        cardsService.writeInBatch(cards, () => ([
            { id: 'c3', deck: 'spades', rank: 3 },
            { id: 'c1', deck: 'spades', rank: 1 },
            { id: 'c2', deck: 'spades', rank: 2 },
        ]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        db.flush();
        expect(readValueWithoutTracking(order).map(slot => slot.entity?.id)).toEqual(['c1', 'c2', 'c3']);
        expect(idsIn('spades')).toEqual(['c3', 'c1', 'c2']);
        order.owner.unholdSlot(order);
    });

    it('moves an entity slot to its new bucket when its key changes', () => {
        const { db, cards, cardsService, idsIn } = createFixture();
        cardsService.writeInBatch(cards, () => ([
            { id: 'c1', deck: 'spades', rank: 1 },
            { id: 'c2', deck: 'spades', rank: 2 },
        ]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        db.flush();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'clubs', rank: 1 });
        db.flush();
        expect(idsIn('spades')).toEqual(['c2']);
        expect(idsIn('clubs')).toEqual(['c1']);
    });
});
