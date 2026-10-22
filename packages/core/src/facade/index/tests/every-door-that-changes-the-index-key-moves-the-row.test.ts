import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import { OIMSlotContentBucketServiceSetDriven } from '../../bucket/OIMSlotContentBucketServiceSetDriven';
import type { TOIMBucketSlot } from '../../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';

type TCard = { id: string; deck: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;
type TSlots = TOIMBucketSlotsSetStore<TCardSlot>;
type TBucket = TOIMBucketSlot<TSlots, TOIMStoreKey>;

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
    const idsIn = (bucket: TBucket): string[] =>
        Array.from(byDeckService.slotContentService.getBucketMemberSlots(bucket))
            .map(slot => slot.entity?.id ?? '')
            .sort();
    const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
    const clubs = byDeckService.holdSlotByKey(byDeck, 'clubs');
    cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades', title: 'ace' });
    cardsService.slotContentService.upsertEntity(cards, { id: 'c2', deck: 'spades', title: 'two' });
    db.flush();
    return { db, cardsService, cards, idsIn, spades, clubs };
};

describe('every door that changes the index key moves the row', () => {
    it('moves the row when the key is patched through update', () => {
        const fixture = createFixture();
        const slot = fixture.cardsService.getSlotByKey(fixture.cards, 'c1');

        fixture.cardsService.slotContentService.updateEntity(slot, { deck: 'clubs' });
        fixture.db.flush();

        expect(fixture.idsIn(fixture.spades)).toEqual(['c2']);
        expect(fixture.idsIn(fixture.clubs)).toEqual(['c1']);
    });

    it('moves the row when the key column is written through updateEntityColumn', () => {
        const fixture = createFixture();
        const slot = fixture.cardsService.getSlotByKey(fixture.cards, 'c1');

        fixture.cardsService.slotContentService.updateEntityColumn(slot, 'deck', 'clubs');
        fixture.db.flush();

        expect(fixture.idsIn(fixture.spades)).toEqual(['c2']);
        expect(fixture.idsIn(fixture.clubs)).toEqual(['c1']);
    });

    it('moves the row when the key is patched through updateByKey', () => {
        const fixture = createFixture();

        const slot = fixture.cardsService.findSlotByKey(fixture.cards, 'c1');
        if (slot !== undefined) fixture.cardsService.slotContentService.updateEntity(slot, { deck: 'clubs' });
        fixture.db.flush();

        expect(fixture.idsIn(fixture.spades)).toEqual(['c2']);
        expect(fixture.idsIn(fixture.clubs)).toEqual(['c1']);
    });

    it('leaves the buckets alone when a patch touches no index key', () => {
        const fixture = createFixture();

        const slot = fixture.cardsService.findSlotByKey(fixture.cards, 'c1');
        if (slot !== undefined) fixture.cardsService.slotContentService.updateEntity(slot, { title: 'joker' });
        fixture.db.flush();

        expect(fixture.idsIn(fixture.spades)).toEqual(['c1', 'c2']);
        expect(fixture.idsIn(fixture.clubs)).toEqual([]);
    });
});
