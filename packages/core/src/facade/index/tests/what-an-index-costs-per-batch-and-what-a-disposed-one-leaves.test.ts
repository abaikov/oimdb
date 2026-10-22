import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import { OIMSlotContentBucketServiceSetDriven } from '../../bucket/OIMSlotContentBucketServiceSetDriven';
import { OIMSlotStoreServiceMapDriven } from '../../../engine/store/OIMSlotStoreServiceMapDriven';
import { OIMIndexKeysServiceAppending } from '../../../engine/index/OIMIndexKeysServiceAppending';
import { OIMIndexKeysServiceReclaiming } from '../../../engine/index/OIMIndexKeysServiceReclaiming';
import type { IOIMIndexKeysService } from '../../../engine/index/interfaces/IOIMIndexKeysService';
import type { TOIMBucketSlot } from '../../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';

type TCard = { id: string; deck: string; suit: string };
type TCardSlot = TOIMEntitySlot<TCard>;
type TSlots = TOIMBucketSlotsSetStore<TCardSlot>;
type TBucket = TOIMBucketSlot<TSlots, string>;

class OIMSlotStoreServiceCountingGets<TSlot extends TBucket> extends OIMSlotStoreServiceMapDriven<TSlot, string> {
    public getCount = 0;

    public override get(store: Map<string, TSlot>, key: string): TSlot | undefined {
        this.getCount++;
        return super.get(store, key);
    }
}

class OIMSlotStoreServiceCountingWalks<TSlot extends TOIMEntitySlot<TCard, TOIMStoreKey>>
    extends OIMSlotStoreServiceMapDriven<TSlot, TOIMStoreKey> {
    public walkCount = 0;

    public override getSlots(store: Map<TOIMStoreKey, TSlot>): IterableIterator<TSlot> {
        this.walkCount++;
        return super.getSlots(store);
    }
}

const createFixture = (indexKeysService: IOIMIndexKeysService) => {
    const db = new OIMDB({ indexKeysService });
    const entitySlotStoreService = new OIMSlotStoreServiceCountingWalks<TOIMEntitySlot<TCard, TOIMStoreKey>>();
    const cardsService = createOIMEntityService<TCard>(db, {
        entitySlotStoreService,
        keyOf: card => card.id,
    });
    const cards = cardsService.createStoreSlot(db);
    const bucketSlotStoreService = new OIMSlotStoreServiceCountingGets<TBucket>();
    const makeIndex = (keyOf: (card: TCard) => string) => {
        const service = createOIMIndexService(db, {
            entityService: cardsService,
            keyOf,
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
            bucketSlotStoreService,
        });
        return { service, store: service.createIndexStoreSlot(cards) };
    };
    const updateEntityByKey = (key: string, patch: Partial<TCard>): void => {
        const slot = cardsService.findSlotByKey(cards, key);
        if (slot !== undefined) cardsService.slotContentService.updateEntity(slot, patch);
    };
    return { db, cardsService, cards, entitySlotStoreService, bucketSlotStoreService, makeIndex, updateEntityByKey };
};

describe('what an index costs per batch', () => {
    it('a batch of R rows into G buckets looks each bucket up once, not once per row', () => {
        const { cardsService, cards, bucketSlotStoreService, makeIndex } = createFixture(new OIMIndexKeysServiceAppending());
        const { service: byDeckService, store: byDeck } = makeIndex(card => card.deck);
        const GROUPS = 5;
        const ROWS = 100;
        const decks = byDeckService.holdSlotsByKeys(byDeck, Array.from({ length: GROUPS }, (_, g) => `d${g}`));
        bucketSlotStoreService.getCount = 0;
        cardsService.slotContentService.upsertEntities(cards, Array.from({ length: ROWS }, (_, i) => ({ id: `c${i}`, deck: `d${i % GROUPS}`, suit: 's' })));
        expect(bucketSlotStoreService.getCount).toBe(GROUPS);
        expect(decks.map(deck => byDeckService.slotContentService.getBucketMemberSlotCount(deck))).toEqual(Array(GROUPS).fill(ROWS / GROUPS));
        for (const deck of decks) deck.owner.unholdSlot(deck);
    });

    it('getByKeys fills every new bucket from one pass over the source', () => {
        const { cardsService, cards, entitySlotStoreService, makeIndex } = createFixture(new OIMIndexKeysServiceAppending());
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deck: 'a', suit: 's' }, { id: 'c2', deck: 'b', suit: 's' }, { id: 'c3', deck: 'a', suit: 's' },
        ]);
        const { service: byDeckService, store: byDeck } = makeIndex(card => card.deck);
        entitySlotStoreService.walkCount = 0;
        const [a, b] = byDeckService.getSlotsByKeys(byDeck, ['a', 'b']);
        expect(entitySlotStoreService.walkCount).toBe(1);
        expect([byDeckService.slotContentService.getBucketMemberSlotCount(a), byDeckService.slotContentService.getBucketMemberSlotCount(b)]).toEqual([2, 1]);
    });
});

describe('what a disposed index leaves on the rows', () => {
    it('appending: the next index takes a new position and the old entry stays unread', () => {
        const { cardsService, cards, makeIndex, updateEntityByKey } = createFixture(new OIMIndexKeysServiceAppending());
        const { service: bySuitService, store: bySuit } = makeIndex(card => card.suit);
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'a', suit: 'hearts' });
        bySuitService.getSlotByKey(bySuit, 'hearts');
        updateEntityByKey('c1', { suit: 'clubs' });
        bySuitService.disposeIndexStoreSlot(bySuit);
        const { service: byDeckService, store: byDeck } = makeIndex(card => card.deck);
        const deck = byDeckService.holdSlotByKey(byDeck, 'a');
        expect(card.indexKeys).toEqual(['clubs', 'a']);
        updateEntityByKey('c1', { deck: 'b' });
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(deck)).toBe(0);
        deck.owner.unholdSlot(deck);
    });

    it('a hundred disposed indexes cost a write nothing once none is alive', () => {
        const { cardsService, cards, makeIndex } = createFixture(new OIMIndexKeysServiceAppending());
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'a', suit: 'hearts' });
        for (let i = 0; i < 100; i++) {
            const { service, store } = makeIndex(card => card.deck);
            service.disposeIndexStoreSlot(store);
        }
        const listenerVisits = jest.spyOn(Array.prototype, 'slice');

        cardsService.slotContentService.upsertEntities(cards, [{ id: 'c1', deck: 'b', suit: 'hearts' }]);
        const slices = listenerVisits.mock.calls.length;
        listenerVisits.mockRestore();

        expect(slices).toBe(0);
        const listeners = (cards as unknown as { contentChangeListeners: readonly unknown[] }).contentChangeListeners;
        expect(listeners.length).toBe(0);
    });

    it('the one index alive among a hundred disposed ones still hears every write, in the order it was added', () => {
        const { cardsService, cards, makeIndex } = createFixture(new OIMIndexKeysServiceAppending());
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'a', suit: 'hearts' });
        const { service: bySuitService, store: bySuit } = makeIndex(row => row.suit);
        for (let i = 0; i < 100; i++) {
            const { service, store } = makeIndex(row => row.deck);
            service.disposeIndexStoreSlot(store);
        }
        const { service: byDeckService, store: byDeck } = makeIndex(row => row.deck);
        const hearts = bySuitService.holdSlotByKey(bySuit, 'hearts');
        const deckB = byDeckService.holdSlotByKey(byDeck, 'b');

        cardsService.slotContentService.updateEntity(card, { deck: 'b', suit: 'clubs' });

        expect(bySuitService.slotContentService.getBucketMemberSlotCount(hearts)).toBe(0);
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(deckB)).toBe(1);
        const listeners = (cards as unknown as { contentChangeListeners: readonly unknown[] }).contentChangeListeners;
        expect(listeners.length).toBe(2);
        hearts.owner.unholdSlot(hearts);
        deckB.owner.unholdSlot(deckB);
    });

    it('reclaiming: dispose wipes the position on every row and the next index reuses it', () => {
        const { cardsService, cards, makeIndex, updateEntityByKey } = createFixture(new OIMIndexKeysServiceReclaiming());
        const { service: bySuitService, store: bySuit } = makeIndex(card => card.suit);
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'a', suit: 'hearts' });
        bySuitService.disposeIndexStoreSlot(bySuit);
        expect(card.indexKeys).toEqual([undefined]);
        const { service: byDeckService, store: byDeck } = makeIndex(card => card.deck);
        const deck = byDeckService.holdSlotByKey(byDeck, 'a');
        expect(card.indexKeys).toEqual(['a']);
        updateEntityByKey('c1', { deck: 'b' });
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(deck)).toBe(0);
        deck.owner.unholdSlot(deck);
    });
});
