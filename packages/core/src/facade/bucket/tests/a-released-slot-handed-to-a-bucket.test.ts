import {
    OIMDB, OIMSlotContentBucketServiceSetDriven, OIMSlotReleasePolicyAtUnhold, createOIMBucketService, createOIMEntityService,
} from '../../../index';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';

type TCard = { id: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const createDecksService = (db: OIMDB) => createOIMBucketService<
    TCardSlot, string, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
>(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, {
        keyOf: card => card.id, slotReleasePolicy: new OIMSlotReleasePolicyAtUnhold(),
    });
    const cards = cardsService.createStoreSlot(db);
    const two = cardsService.holdSlotByKey(cards, 'two');
    cardsService.slotContentService.upsertEntity(cards, { id: 'two' });
    const ace = cardsService.holdSlotByKey(cards, 'ace');
    cardsService.slotContentService.upsertEntity(cards, { id: 'ace' });
    ace.owner.unholdSlot(ace);
    return { db, two, ace };
};

describe('a released slot handed to a bucket', () => {
    it('is refused by a list door before the bucket changes', () => {
        const { db, two, ace } = createFixture();
        const decksService = createDecksService(db);
        const decks = decksService.createStoreSlot(db);
        const deck = decksService.holdSlotByKey(decks, 'd');
        const holdsBefore = two.holdCount;

        expect(() => { decksService.slotContentService.addBucketMemberSlots(deck, [two, ace]); }).toThrow(/released/);

        expect(decksService.slotContentService.getBucketMemberSlotCount(deck)).toBe(0);
        expect(two.holdCount).toBe(holdsBefore);
    });

    it('is refused by a whole-list write, which leaves the members it had and their holds', () => {
        const { db, two, ace } = createFixture();
        const decksService = createDecksService(db);
        const decks = decksService.createStoreSlot(db);
        const deck = decksService.holdSlotByKey(decks, 'd');
        decksService.slotContentService.addBucketMemberSlots(deck, [two]);
        const holdsBefore = two.holdCount;

        expect(() => { decksService.slotContentService.writeBucketMemberSlots(deck, [ace]); }).toThrow(/released/);

        expect([...decksService.slotContentService.getBucketMemberSlots(deck)]).toEqual([two]);
        expect(two.holdCount).toBe(holdsBefore);
    });

    it('is refused by a door by key before the bucket changes', () => {
        const { db, ace } = createFixture();
        const decksService = createDecksService(db);
        const decks = decksService.createStoreSlot(db);
        const deck = decksService.holdSlotByKey(decks, 'd');

        expect(() => {
            const bucketSlot = decksService.findSlotByKey(decks, 'd');
            if (bucketSlot !== undefined) decksService.slotContentService.addBucketMemberSlot(bucketSlot, ace);
        }).toThrow(/released/);

        expect(decksService.slotContentService.getBucketMemberSlotCount(deck)).toBe(0);
    });

    it('is refused by a positional insert before the list changes', () => {
        const { db, two, ace } = createFixture();
        const pageService = createOIMBucketService<TCardSlot, string>(db);
        const page = pageService.createStoreSlot(db);
        const bucket = pageService.holdSlotByKey(page, 'p');
        pageService.slotContentService.insertBucketMemberSlotAt(bucket, 0, two);

        expect(() => { pageService.slotContentService.insertBucketMemberSlotAt(bucket, 1, ace); }).toThrow(/released/);

        expect([...pageService.slotContentService.getBucketMemberSlots(bucket)]).toEqual([two]);
    });
});
