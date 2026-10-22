import { OIMDB } from '../../../factories/OIMDB';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMBucketSlot } from '../../bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';

type TCard = { id: string; deckId: string };
type TCardSlot = TOIMEntitySlot<TCard>;
type TDeckBucket = TOIMBucketSlot<TOIMBucketSlotsSetStore<TCardSlot>, string>;

class StoreServiceThatCountsEveryLookup
implements IOIMSlotStoreService<string, TDeckBucket, Map<string, TDeckBucket>> {
    public lookups = 0;

    public filings = 0;

    public createStore(): Map<string, TDeckBucket> { return new Map<string, TDeckBucket>(); }
    public ownKey<TOwnedKey extends string>(key: TOwnedKey): TOwnedKey { return key; }

    public isSameKey(key: string, otherKey: string): boolean { return key === otherKey; }

    public get(store: Map<string, TDeckBucket>, key: string): TDeckBucket | undefined {
        this.lookups++;
        return store.get(key);
    }

    public set(store: Map<string, TDeckBucket>, key: string, slot: TDeckBucket): void {
        this.filings++;
        store.set(key, slot);
    }

    public remove(store: Map<string, TDeckBucket>, key: string): void { store.delete(key); }

    public getSlots(store: Map<string, TDeckBucket>): IterableIterator<TDeckBucket> {
        return store.values();
    }

    public getSlotCount(store: Map<string, TDeckBucket>): number { return store.size; }
}

const createFixture =() => {
    const db = new OIMDB();
    const bucketSlotStoreService = new StoreServiceThatCountsEveryLookup();
    const byDeckService = createOIMBucketService<
        TCardSlot, string, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>,
        Map<string, TDeckBucket>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(), bucketSlotStoreService });
    const byDeck = byDeckService.createStoreSlot(db);
    return { db, byDeck, byDeckService, bucketSlotStoreService };
};

describe('what a door pays to resolve one key', () => {
    it('getByKey asks the store once for a key nothing is filed under', () => {
        const { byDeck, byDeckService, bucketSlotStoreService } = createFixture();

        const deck = byDeckService.getSlotByKey(byDeck, 'd1');

        expect(bucketSlotStoreService.lookups).toBe(1);
        expect(bucketSlotStoreService.filings).toBe(1);
        expect(byDeckService.getSlotByKey(byDeck, 'd1')).toBe(deck);
        expect(deck.holdCount).toBe(1);
    });

    it('getByKey asks the store once for a key that already has one', () => {
        const { byDeck, byDeckService, bucketSlotStoreService } = createFixture();
        const deck = byDeckService.getSlotByKey(byDeck, 'd1');
        bucketSlotStoreService.lookups = 0;

        expect(byDeckService.getSlotByKey(byDeck, 'd1')).toBe(deck);
        expect(bucketSlotStoreService.lookups).toBe(1);
    });

    it('holdByKey asks the store once, filed or not', () => {
        const { byDeck, byDeckService, bucketSlotStoreService } = createFixture();

        const deck = byDeckService.holdSlotByKey(byDeck, 'd1');

        expect(bucketSlotStoreService.lookups).toBe(1);
        expect(bucketSlotStoreService.filings).toBe(1);
        expect(byDeckService.getSlotByKey(byDeck, 'd1')).toBe(deck);
        expect(deck.holdCount).toBe(1);

        bucketSlotStoreService.lookups = 0;
        expect(byDeckService.holdSlotByKey(byDeck, 'd1')).toBe(deck);
        expect(bucketSlotStoreService.lookups).toBe(1);
        expect(deck.holdCount).toBe(2);
    });
});
