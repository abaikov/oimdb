import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import { OIMChannelService } from '../../../engine/channel/OIMChannelService';
import { OIMSlotContentBucketServiceSetDriven } from '../OIMSlotContentBucketServiceSetDriven';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import { oimIsSlotReleased } from '../../../engine/slot/utils/oimIsSlotReleased';

type TCard = { id: string; deck: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMIndexService(db, {
        entityService: cardsService,
        keyOf: (card: TCard) => card.deck,
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
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

        OIMChannelService.INSTANCE.openSubframe(fixture.db.defaultChannelSlot);
        fixture.cardsService.slotContentService.upsertEntities(fixture.cards, [{ id: 'c0', deck: 'd' }, { id: 'c1', deck: 'd' }]);
        deck.owner.unholdSlot(deck);
        OIMChannelService.INSTANCE.closeSubframe(fixture.db.defaultChannelSlot);
        fixture.db.flush();

        expect(oimIsSlotReleased(deck)).toBe(false);
        expect(fixture.byDeckService.slotContentService.getBucketMemberSlotCount(deck)).toBe(2);
    });

    it('leaves the rows of such a bucket reachable, so neither is stranded', () => {
        const fixture = createFixture();
        const deck = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'd');
        fixture.db.flush();

        OIMChannelService.INSTANCE.openSubframe(fixture.db.defaultChannelSlot);
        fixture.cardsService.slotContentService.upsertEntities(fixture.cards, [{ id: 'c0', deck: 'd' }]);
        deck.owner.unholdSlot(deck);
        OIMChannelService.INSTANCE.closeSubframe(fixture.db.defaultChannelSlot);
        fixture.db.flush();

        expect(fixture.cardsService.slotContentService.findEntityByKey(fixture.cards, 'c0')).toEqual({ id: 'c0', deck: 'd' });
        expect(fixture.byDeckService.hasSlotContentByKey(fixture.byDeck, 'd')).toBe(true);
    });

    it('still releases a bucket given back inside a change that filled nothing into it', () => {
        const fixture = createFixture();
        const deck = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'd');
        fixture.db.flush();

        OIMChannelService.INSTANCE.openSubframe(fixture.db.defaultChannelSlot);
        fixture.cardsService.slotContentService.upsertEntities(fixture.cards, [{ id: 'c0', deck: 'other' }]);
        deck.owner.unholdSlot(deck);
        OIMChannelService.INSTANCE.closeSubframe(fixture.db.defaultChannelSlot);
        fixture.db.flush();

        expect(oimIsSlotReleased(deck)).toBe(true);
        expect(fixture.byDeckService.hasSlotContentByKey(fixture.byDeck, 'd')).toBe(false);
    });

    it('names a bucket filled and given back in one change exactly once', () => {
        const fixture = createFixture();
        const deck = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'd');
        fixture.db.flush();
        const write = jest.spyOn(OIMChannelService.INSTANCE, 'writeWithoutFlushCheck');

        OIMChannelService.INSTANCE.openSubframe(fixture.db.defaultChannelSlot);
        fixture.cardsService.slotContentService.upsertEntities(fixture.cards, [{ id: 'c0', deck: 'd' }, { id: 'c1', deck: 'd' }]);
        deck.owner.unholdSlot(deck);
        OIMChannelService.INSTANCE.closeSubframe(fixture.db.defaultChannelSlot);
        fixture.db.flush();

        expect(write.mock.calls.filter(([, slot]) => slot === deck).length).toBe(1);
    });
});
