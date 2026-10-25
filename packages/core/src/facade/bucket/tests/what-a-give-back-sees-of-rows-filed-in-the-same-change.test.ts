import { OIMDB } from '../../../factories/OIMDB';
import { createOIMSlotCollectionIndexService } from '../../../factories/createOIMSlotCollectionIndexService';
import { OIMChannelService } from '../../../engine/channel/OIMChannelService';
import { OIMSlotContentSetBucketService } from '../OIMSlotContentSetBucketService';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import { oimIsSlotReleased } from '../../../engine/slot/utils/oimIsSlotReleased';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

type TCard = { id: string; deck: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMSlotCollectionIndexService(db, {
        entityService: cardsService,
        keyOf: (card: TCard) => card.deck,
        slotContentService: new OIMSlotContentSetBucketService<TCardSlot>(),
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    return { db, cardsService, cards, byDeckService, byDeck };
};

afterEach(() => {
    jest.restoreAllMocks();
});

describe('what a give-back sees of rows filed in the same change', () => {
    it('keeps a bucket that was filled inside the change it is given back in', () => {
        const fixture = createFixture();
        const deck = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'd');
        fixture.db.flush();
        fixture.cardsService.writeInBatch(fixture.cards, () => ([{ id: 'c0', deck: 'd' }, { id: 'c1', deck: 'd' }]).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        deck.owner.unholdSlot(deck);
        fixture.db.flush();

        expect(oimIsSlotReleased(deck)).toBe(false);
        expect(fixture.byDeckService.slotContentService.getBucketMemberSlotCount(deck)).toBe(2);
    });

    it('leaves the rows of such a bucket reachable, so neither is stranded', () => {
        const fixture = createFixture();
        const deck = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'd');
        fixture.db.flush();
        fixture.cardsService.writeInBatch(fixture.cards, () => ([{ id: 'c0', deck: 'd' }]).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        deck.owner.unholdSlot(deck);
        fixture.db.flush();

        expect(fixture.cardsService.findSlotByKey(fixture.cards, 'c0')?.entity).toEqual({ id: 'c0', deck: 'd' });
        expect(fixture.byDeckService.hasSlotContentByKey(fixture.byDeck, 'd')).toBe(true);
    });

    it('still releases a bucket given back inside a change that filled nothing into it', () => {
        const fixture = createFixture();
        const deck = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'd');
        fixture.db.flush();
        fixture.cardsService.writeInBatch(fixture.cards, () => ([{ id: 'c0', deck: 'other' }]).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        deck.owner.unholdSlot(deck);
        fixture.db.flush();

        expect(oimIsSlotReleased(deck)).toBe(true);
        expect(fixture.byDeckService.hasSlotContentByKey(fixture.byDeck, 'd')).toBe(false);
    });

    it('names a bucket filled and given back in one change exactly once', () => {
        const fixture = createFixture();
        const deck = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'd');
        fixture.db.flush();
        const write = jest.spyOn(OIMChannelService.INSTANCE, 'writeWithoutFlushCheck');
        fixture.cardsService.writeInBatch(fixture.cards, () => ([{ id: 'c0', deck: 'd' }, { id: 'c1', deck: 'd' }]).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        deck.owner.unholdSlot(deck);
        fixture.db.flush();

        expect(write.mock.calls.filter(([, slot]) => slot === deck).length).toBe(1);
    });
});
