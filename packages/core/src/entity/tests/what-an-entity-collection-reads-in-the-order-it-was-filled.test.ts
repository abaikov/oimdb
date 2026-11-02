import {
    OIMDB, OIMEffectService, OIMSetBucketContentService, createOIMSlotCollectionIndexService, createOIMEntityContentService,
    createOIMSlotCollectionService, oimIsSlotEmpty, OIMSlotAtUnholdReleasePolicy, OIMSlotCollectionBucketService,
    createOIMEntitySlotCollectionStoreAggregate, oimIsSlotReleased,
} from '@oimdb/core';
import type { TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';

type TCard = { id: string; title: string };

const collectionBucketService = OIMSlotCollectionBucketService.INSTANCE;

describe('what an entity collection reads in the order it was filled', () => {
    it('lists its entities in the order they got data while it is held, with the ones already there first', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
        const cardsBucketSlot = collectionBucketService.holdBucketSlot(cards.storeSlot);
        cards.writeSlotContentByKey('b', { id: 'b', title: 'Two' });
        cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace' });
        db.flush();
        expect(cards.getEntities().map(card => card.id)).toEqual(['b', 'a']);
        cards.writeSlotContentByKey('c', { id: 'c', title: 'Three' });
        cards.writeSlotContentByKey('b', { id: 'b', title: 'Two again' });
        db.flush();
        expect(cards.getEntities().map(card => card.title)).toEqual(['Two again', 'Ace', 'Three']);
        cardsBucketSlot.unholdSlot();
    });

    it('drops a cleared entity and puts one written again at the end', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
        const cardsBucketSlot = collectionBucketService.holdBucketSlot(cards.storeSlot);
        cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace' });
        cards.writeSlotContentByKey('b', { id: 'b', title: 'Two' });
        db.flush();
        expect(cards.getEntityCount()).toBe(2);
        cards.getSlotByKey('a').clearSlotContent();
        db.flush();
        expect(cards.getEntities().map(card => card.id)).toEqual(['b']);
        cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace again' });
        db.flush();
        expect(cards.getEntities().map(card => card.id)).toEqual(['b', 'a']);
        cardsBucketSlot.unholdSlot();
    });

    it('wakes a count reader on arrivals and departures and not on an edit', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
        const ace = cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace' });
        db.flush();
        const counts: number[] = [];
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => { counts.push(cards.getEntityCount()); });
        ace.updateEntity({ title: 'Ace of spades' });
        db.flush();
        cards.writeSlotContentByKey('b', { id: 'b', title: 'Two' });
        db.flush();
        ace.clearSlotContent();
        db.flush();
        expect(counts).toEqual([1, 2, 1]);
    });

    it('wakes an entities reader on an edit as well', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
        const ace = cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace' });
        db.flush();
        const titles: string[][] = [];
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => { titles.push(cards.getEntities().map(card => card.title)); });
        ace.updateEntity({ title: 'Ace of spades' });
        db.flush();
        expect(titles).toEqual([['Ace'], ['Ace of spades']]);
    });

    it('lets the bucket go at the flush when nobody holds it, and builds a new one on the next read', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
        cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace' });
        const firstBucketSlot = collectionBucketService.getBucketSlot(cards.storeSlot);
        expect(collectionBucketService.getBucketSlot(cards.storeSlot)).toBe(firstBucketSlot);
        db.flush();
        expect(oimIsSlotReleased(firstBucketSlot)).toBe(true);
        cards.writeSlotContentByKey('b', { id: 'b', title: 'Two' });
        const nextBucketSlot = collectionBucketService.getBucketSlot(cards.storeSlot);
        expect(nextBucketSlot).not.toBe(firstBucketSlot);
        expect(nextBucketSlot.getBucketMemberSlotCount()).toBe(2);
    });

    it('does not hold its entities, so an entity nobody else holds goes by its release policy while the bucket is read', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db, { slotReleasePolicy: OIMSlotAtUnholdReleasePolicy.INSTANCE });
        const cardsBucketSlot = collectionBucketService.holdBucketSlot(cards.storeSlot);
        const ace = cards.holdSlotByKey('a');
        ace.writeSlotContent({ id: 'a', title: 'Ace' });
        db.flush();
        expect(cardsBucketSlot.getBucketMemberSlotCount()).toBe(1);
        ace.unholdSlot();
        expect(oimIsSlotReleased(ace)).toBe(true);
        expect(cardsBucketSlot.getBucketMemberSlotCount()).toBe(0);
        cardsBucketSlot.unholdSlot();
    });

    it('keeps an entity a tracked reader shows, because the reader holds it', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db, { slotReleasePolicy: OIMSlotAtUnholdReleasePolicy.INSTANCE });
        const ace = cards.holdSlotByKey('a');
        ace.writeSlotContent({ id: 'a', title: 'Ace' });
        db.flush();
        const shown: string[][] = [];
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => { shown.push(cards.getEntities().map(card => card.id)); });
        ace.unholdSlot();
        db.flush();
        expect(oimIsSlotReleased(ace)).toBe(false);
        expect(shown).toEqual([['a']]);
    });

    it('takes back an entity released in the middle of a flush without refusing it as a write', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db, { slotReleasePolicy: OIMSlotAtUnholdReleasePolicy.INSTANCE });
        const cardsBucketSlot = collectionBucketService.holdBucketSlot(cards.storeSlot);
        const ace = cards.holdSlotByKey('a');
        ace.writeSlotContent({ id: 'a', title: 'Ace' });
        const isAceShown = cards.holdSlotByKey('shown');
        isAceShown.writeSlotContent({ id: 'shown', title: 'yes' });
        db.flush();
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            if (isAceShown.entity?.title === 'yes') void ace.entity;
        });
        ace.unholdSlot();
        db.flush();
        isAceShown.updateEntity({ title: 'no' });
        expect(() => db.flush()).not.toThrow();
        expect(oimIsSlotReleased(ace)).toBe(true);
        expect(cardsBucketSlot.getBucketMemberSlotCount()).toBe(1);
        cardsBucketSlot.unholdSlot();
        isAceShown.unholdSlot();
    });

    it('writes to an entity nobody holds stay off the channel while the bucket is read', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
        const ace = cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace' });
        const cardsBucketSlot = collectionBucketService.holdBucketSlot(cards.storeSlot);
        db.flush();
        const changedAtRevision = ace.changedAtRevision;
        ace.updateEntity({ title: 'Ace of spades' });
        expect(ace.holdCount).toBe(0);
        expect(ace.changedAtRevision).toBe(changedAtRevision);
        cardsBucketSlot.unholdSlot();
    });
    it('is not empty after a build that found entities', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
        cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace' });
        expect(oimIsSlotEmpty(collectionBucketService.getBucketSlot(cards.storeSlot))).toBe(false);
    });

    it('an index read inside an effect wakes it when a member is edited', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard & { deck: string }>() });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMSlotCollectionIndexService({
            entityService: cardsService,
            slotContentService: new OIMSetBucketContentService<TOIMEntitySlot<TCard & { deck: string }, TOIMStoreKey>, string>(),
            keyOf: (card: TCard & { deck: string }) => card.deck,
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const ace = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'Ace', deck: 'x' });
        db.flush();
        const titles: string[][] = [];
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            titles.push(byDeckService.getEntitiesByKey(byDeck, 'x').map(card => card.title));
        });
        ace.updateEntity({ title: 'Ace of spades' });
        db.flush();
        expect(titles).toEqual([['Ace'], ['Ace of spades']]);
    });
});
