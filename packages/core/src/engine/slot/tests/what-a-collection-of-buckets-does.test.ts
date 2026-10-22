import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import { oimIsSlotEmpty } from '../utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';
import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMBucketSlot } from '../../bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMKeyedSlot } from '../types/TOIMKeyedSlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';

type Card = { id: string; title: string };

type TCardSlot = TOIMEntitySlot<Card, TOIMStoreKey>;

class MapStore<TKey, TSlot extends TOIMKeyedSlot<TKey>>
implements IOIMSlotStoreService<TKey, TSlot, Map<TKey, TSlot>> {
    public createStore(): Map<TKey, TSlot> { return new Map<TKey, TSlot>(); }
    public ownKey<TOwnedKey extends TKey>(key: TOwnedKey): TOwnedKey { return key; }
    public isSameKey(key: TKey, otherKey: TKey): boolean { return key === otherKey; }
    public get(store: Map<TKey, TSlot>, key: TKey): TSlot | undefined { return store.get(key); }
    public set(store: Map<TKey, TSlot>, key: TKey, slot: TSlot): void { store.set(key, slot); }
    public remove(store: Map<TKey, TSlot>, key: TKey): void { store.delete(key); }
    public getSlots(store: Map<TKey, TSlot>): IterableIterator<TSlot> { return store.values(); }
    public getSlotCount(store: Map<TKey, TSlot>): number { return store.size; }
}

const createFixture =() => {
    // The cards, on the same pair with the ENTITY service — so a card slot has a
    // real owner to be asked when the last bucket lets it go, and the two answers
    // to `hasContent` meet in one test.
    const db = new OIMDB();
    const cardsService = createOIMEntityService<Card>(db, {
        entitySlotStoreService: new MapStore<TOIMStoreKey, TCardSlot>(),
        keyOf: card => card.id,
    });
    const cards = cardsService.createStoreSlot(db);

    // And the decks: buckets of those cards, filed by the same aggregate. A
    // channel of its own with nothing subscribed to it and no flush, which is
    // the whole of "this collection has no effects": the buckets are filed, held
    // and released exactly as below, and nobody is woken.
    const byDeckService = createOIMBucketService<
        TCardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });
    const decks = byDeckService.createStoreSlot(db);
    return { db, cardsService, cards, byDeckService, decks };
};

type TFixture = ReturnType<typeof createFixture>;

const writeBucket = (
    byDeckService: TFixture['byDeckService'], decks: TFixture['decks'], key: TOIMStoreKey, slots: readonly TCardSlot[],
): TOIMBucketSlot<TOIMBucketSlotsSetStore<TCardSlot>, TOIMStoreKey> => {
    const bucket = byDeckService.holdSlotByKey(decks, key);
    byDeckService.slotContentService.writeBucketMemberSlots(bucket, slots);
    bucket.owner.unholdSlot(bucket);
    return bucket;
};

/** A card with a value: its own service keeps its slot, whatever buckets do. */
const card = (cardsService: TFixture['cardsService'], cards: TFixture['cards'], id: string): TCardSlot =>
    cardsService.slotContentService.insertEntity(cards, id, { id, title: id.toUpperCase() });

/**
 * A key with no value yet — the reserved identity a bucket's hold is all that keeps.
 *
 * The hold is kept until the slot is in a bucket and handed back to the caller to
 * give up afterwards: releasing before the join unfiles the very slot this
 * helper exists to hand out.
 */
const reserved = (cardsService: TFixture['cardsService'], cards: TFixture['cards'], id: string): TCardSlot =>
    cardsService.holdSlotByKey(cards, id);

describe('one bucket per key, and the key is how it is found again', () => {
    it('hands the same bucket back for the same key', () => {
        const { cardsService, cards, byDeckService, decks } = createFixture();
        const a = card(cardsService, cards, 'a');
        const first = writeBucket(byDeckService, decks, 'd1', [a]);
        const second = writeBucket(byDeckService, decks, 'd1', [a]);
        expect(second).toBe(first);
        expect(byDeckService.getSlotByKey(decks, 'd1')).toBe(first);
        expect(byDeckService.getSlotCount(decks)).toBe(1);
    });

    it('files one bucket per key and no more', () => {
        const { cardsService, cards, byDeckService, decks } = createFixture();
        const a = card(cardsService, cards, 'a');
        const b = card(cardsService, cards, 'b');
        expect(writeBucket(byDeckService, decks, 'd2', [b])).not.toBe(writeBucket(byDeckService, decks, 'd1', [a]));
        expect(byDeckService.getSlotCount(decks)).toBe(2);
    });

    it('mints a bucket with its slots empty and its owner filed', () => {
        const { decks, byDeckService } = createFixture();
        const bucket = byDeckService.holdSlotByKey(decks, 'd1');
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(bucket)).toBe(0);
        expect(bucket.key).toBe('d1');
        // Assigned by whoever FILES, which is the aggregate — the service mints
        // a bucket that does not know where it will live.
        expect(bucket.owner).toBe((byDeckService as unknown as { slotOwnerService: unknown }).slotOwnerService);
        // bucket was the one identity that had to be settled before a consumer
        // could arrive on it. An ordered bucket's order is a derivation settled
        // by the read, so a bucket is current at every instant and carries no
        // maintainer. `owner` is the only reference a bucket has, and the line
        // above is the whole of what this case can ask.
    });

    it('a read mints, and the mint is the collector\'s until the next flush', () => {
        const { db, decks, byDeckService } = createFixture();
        expect(byDeckService.getSlotCount(decks)).toBe(0);

        const bucket = byDeckService.getSlotByKey(decks, 'd1');
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(bucket)).toBe(0);
        expect(oimIsSlotEmpty(bucket)).toBe(true);
        expect(byDeckService.getSlotCount(decks)).toBe(1);

        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(byDeckService.getSlotCount(decks)).toBe(0);
        expect(oimIsSlotReleased(bucket)).toBe(true);
    });
});

describe('the slots it holds keep their bucket, and that is the asymmetry', () => {
    it('keeps a bucket with slots that nothing else points at', () => {
        const { cardsService, cards, byDeckService, decks } = createFixture();
        const bucket = writeBucket(byDeckService, decks, 'd1', [card(cardsService, cards, 'a')]);
        expect(bucket.holdCount).toBe(0);
        expect(bucket.effects).toBeUndefined();

        bucket.owner.holdSlot(bucket);
        bucket.owner.unholdSlot(bucket);
        expect(byDeckService.getSlotCount(decks)).toBe(1);
        expect(byDeckService.getSlotByKey(decks, 'd1')).toBe(bucket);
    });

    it('lets an empty bucket that nothing points at go', () => {
        const { db, byDeckService, decks } = createFixture();
        const bucket = byDeckService.getSlotByKey(decks, 'd1');
        byDeckService.slotContentService.writeBucketMemberSlots(bucket, []);
        expect(byDeckService.getSlotCount(decks)).toBe(1);

        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);

        expect(byDeckService.getSlotCount(decks)).toBe(0);
        expect(oimIsSlotReleased(bucket)).toBe(true);
        expect(byDeckService.getSlotByKey(decks, 'd1')).not.toBe(bucket);
    });

    it('lets a bucket go once its last slot leaves, in the write that takes it', () => {
        const { cardsService, cards, byDeckService, decks } = createFixture();
        const bucket = writeBucket(byDeckService, decks, 'd1', [card(cardsService, cards, 'a')]);

        writeBucket(byDeckService, decks, 'd1', []);

        expect(byDeckService.slotContentService.getBucketMemberSlotCount(bucket)).toBe(0);
        expect(oimIsSlotReleased(bucket)).toBe(true);
        expect(byDeckService.getSlotCount(decks)).toBe(0);
    });

    it('and a hold carries it past that write, to the give-back', () => {
        const { cardsService, cards, byDeckService, decks } = createFixture();
        const bucket = writeBucket(byDeckService, decks, 'd1', [card(cardsService, cards, 'a')]);
        bucket.owner.holdSlot(bucket);

        writeBucket(byDeckService, decks, 'd1', []);
        expect(oimIsSlotReleased(bucket)).toBe(false);

        bucket.owner.unholdSlot(bucket);
        expect(byDeckService.getSlotCount(decks)).toBe(0);
    });

    it('empties and asks in one call, through delete', () => {
        const { cardsService, cards, byDeckService, decks } = createFixture();
        const bucket = writeBucket(byDeckService, decks, 'd1', [card(cardsService, cards, 'a')]);
        byDeckService.slotContentService.clearBucketMemberSlots(bucket);
        expect(byDeckService.getSlotCount(decks)).toBe(0);
        expect(oimIsSlotReleased(bucket)).toBe(true);
        expect(byDeckService.getSlotByKey(decks, 'd1')).not.toBe(bucket);
    });

    it('keeps an empty bucket while something holds it, and drops it after', () => {
        const { byDeckService, decks } = createFixture();
        const heldSlot = byDeckService.holdSlotByKey(decks, 'd1');
        heldSlot.owner.holdSlot(heldSlot);
        heldSlot.owner.unholdSlot(heldSlot);
        expect(byDeckService.getSlotCount(decks)).toBe(1);

        heldSlot.owner.unholdSlot(heldSlot);
        expect(byDeckService.getSlotCount(decks)).toBe(0);
    });
});

describe('what a bucket costs the slot it holds, and that it is paid back', () => {
    it('takes one hold per bucket and gives every one of them back', () => {
        const { cardsService, cards, byDeckService, decks } = createFixture();
        const a = card(cardsService, cards, 'a');
        expect(a.holdCount).toBe(0);

        const first = writeBucket(byDeckService, decks, 'd1', [a]);
        expect(a.holdCount).toBe(1);
        const second = writeBucket(byDeckService, decks, 'd2', [a]);
        expect(a.holdCount).toBe(2);

        byDeckService.slotContentService.clearBucketMemberSlots(first);
        expect(a.holdCount).toBe(1);
        byDeckService.slotContentService.clearBucketMemberSlots(second);
        // Still filed: its own value is what keeps it, never a bucket.
        expect(a.holdCount).toBe(0);
        expect(cardsService.getSlotByKey(cards, 'a')).toBe(a);
    });

    it('takes ONE hold for a slot named twice, because the set records it once', () => {
        const { cardsService, cards, byDeckService, decks } = createFixture();
        const a = card(cardsService, cards, 'a');
        const bucket = writeBucket(byDeckService, decks, 'd1', [a, a]);
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(bucket)).toBe(1);
        expect(a.holdCount).toBe(1);

        byDeckService.slotContentService.clearBucketMemberSlots(bucket);
        expect(a.holdCount).toBe(0);
    });

    it('gives back exactly the holds the slots it replaces had taken', () => {
        const { cardsService, cards, byDeckService, decks } = createFixture();
        const a = card(cardsService, cards, 'a');
        const b = card(cardsService, cards, 'b');
        const c = card(cardsService, cards, 'c');
        writeBucket(byDeckService, decks, 'd1', [a, b]);
        expect([a.holdCount, b.holdCount, c.holdCount]).toEqual([1, 1, 0]);

        writeBucket(byDeckService, decks, 'd1', [b, c]);
        expect([a.holdCount, b.holdCount, c.holdCount]).toEqual([0, 1, 1]);
    });

    it('moves nothing when the set written is the one it already holds', () => {
        const { cardsService, cards, byDeckService, decks } = createFixture();
        const a = card(cardsService, cards, 'a');
        const b = card(cardsService, cards, 'b');
        writeBucket(byDeckService, decks, 'd1', [a, b]);
        writeBucket(byDeckService, decks, 'd1', [b, a]);
        expect([a.holdCount, b.holdCount]).toEqual([1, 1]);
    });

    it('asks the slot\'s owner when the last bucket lets it go', () => {
        const { cardsService, cards, byDeckService, decks } = createFixture();
        // A key whose value has not arrived: nothing keeps it but this bucket.
        const ghost = reserved(cardsService, cards, 'ghost');
        expect(cardsService.getSlotByKey(cards, 'ghost')).toBe(ghost);

        const bucket = writeBucket(byDeckService, decks, 'd1', [ghost]);
        // The slot is in the bucket, so the reservation can be given up.
        ghost.owner.unholdSlot(ghost);
        expect(ghost.holdCount).toBe(1);

        byDeckService.slotContentService.clearBucketMemberSlots(bucket);
        expect(ghost.holdCount).toBe(0);
        expect(oimIsSlotReleased(ghost)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    it('never lets a slot that is both leaving and arriving pass through zero', () => {
        const { cardsService, cards, byDeckService, decks } = createFixture();
        const ghost = reserved(cardsService, cards, 'ghost');
        const a = card(cardsService, cards, 'a');
        writeBucket(byDeckService, decks, 'd1', [ghost, a]);
        ghost.owner.unholdSlot(ghost);

        // The rewrite evicts everyone and rejoins `ghost`. Give the holds back
        // first and `ghost` reaches zero between the two loops, its own
        // collection unfiles it, and the rejoin files it into a bucket the
        // collection no longer holds under its key.
        writeBucket(byDeckService, decks, 'd1', [ghost]);
        expect(ghost.holdCount).toBe(1);
        expect(cardsService.getSlotByKey(cards, 'ghost')).toBe(ghost);
        expect(a.holdCount).toBe(0);
    });
});
