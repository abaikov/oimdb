import { OIMBucketArrayMembershipUnique } from '../OIMBucketArrayMembershipUnique';
import { OIMDB } from '../../../../factories/OIMDB';
import { createOIMEntityService } from '../../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../../factories/createOIMBucketService';
import { createOIMIndexService } from '../../../../factories/createOIMIndexService';
import { createOIMComputedServiceSorted } from '../../../../factories/createOIMComputedServiceSorted';
import { OIMSlotContentBucketServiceArrayDriven } from '../../../../facade/bucket/OIMSlotContentBucketServiceArrayDriven';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsArrayStore } from '../types/TOIMBucketSlotsArrayStore';
import type { TOIMBucketSlotsArrayUniqueStore } from '../types/TOIMBucketSlotsArrayUniqueStore';

type Card = { id: string; rank: number };
type TCardSlot = TOIMEntitySlot<Card>;
type TSlots = TOIMBucketSlotsArrayStore<TCardSlot>;
type TUniqueSlots = TOIMBucketSlotsArrayUniqueStore<TCardSlot>;

const createContext = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<Card>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards };
};

let context = createContext();

beforeEach(() => {
    context = createContext();
});

function cardSlot(id: string, rank: number): TCardSlot {
    return context.cardsService.slotContentService.upsertEntity(context.cards, { id, rank });
}

function makePositional() {
    const service = new OIMSlotContentBucketServiceArrayDriven<TCardSlot>();
    const decksService = createOIMBucketService<
        TCardSlot, TOIMStoreKey, TSlots, OIMSlotContentBucketServiceArrayDriven<TCardSlot>
    >(context.db, { slotContentService: service });
    const decks = decksService.createStoreSlot(context.db);
    return { service, bucket: decksService.holdSlotByKey(decks, 'group') };
}

function makeUnique() {
    const service = new OIMSlotContentBucketServiceArrayDriven<TCardSlot, TUniqueSlots>({
        bucketArrayMembership: new OIMBucketArrayMembershipUnique<TCardSlot>(),
    });
    const decksService = createOIMBucketService<
        TCardSlot, TOIMStoreKey, TUniqueSlots, OIMSlotContentBucketServiceArrayDriven<TCardSlot, TUniqueSlots>
    >(context.db, { slotContentService: service });
    const decks = decksService.createStoreSlot(context.db);
    return { service, bucket: decksService.holdSlotByKey(decks, 'group') };
}

function idsOf(slots: Iterable<TCardSlot>): (string | undefined)[] {
    return [...slots].map(slot => slot.entity?.id);
}

function expectSlotsToBe(got: Iterable<TCardSlot>, wanted: readonly TCardSlot[]): void {
    const slots = [...got];
    expect(idsOf(slots)).toEqual(idsOf(wanted));
    for (let at = 0; at < wanted.length; at++) expect(slots[at] === wanted[at]).toBe(true);
}

function eight(): TCardSlot[] {
    return ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, at) => cardSlot(id, (at + 1) * 10));
}

const eightCards = (): Card[] =>
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, at) => ({ id, rank: (at + 1) * 10 }));

type TDuringCompare = { current: (left: Card, right: Card) => void; compared: number };

const passThrough = (): void => undefined;

function refusing(id: string): (left: Card, right: Card) => void {
    return (left, right) => {
        if (left.id === id || right.id === id) throw new Error('the sorter refused this pair');
    };
}

function makeIndexOrder() {
    const during: TDuringCompare = { current: passThrough, compared: 0 };
    const db = new OIMDB();
    const cardsService = createOIMEntityService<Card>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byGroupService = createOIMIndexService(db, {
        entityService: cardsService,
        keyOf: (_card: Card): string => 'group',
    });
    const byGroup = byGroupService.createIndexStoreSlot(cards);
    const ordersService = createOIMComputedServiceSorted({
        indexService: byGroupService,
        sortColumns: [{ column: 'rank', direction: 'asc' }],
        comparator: (left: Card, right: Card) => {
            during.compared++;
            during.current(left, right);
            return left.rank - right.rank;
        },
    });
    const orders = ordersService.createSortedStoreSlot(byGroup);
    const order = ordersService.computedCollectionService.holdSlotByKey(orders, 'group');
    const getOrderValue = () => ordersService.computedCollectionService.slotContentService.getValueForSlot(order);
    const ids = (): (string | undefined)[] => getOrderValue().map(slot => slot.entity?.id);
    const upsertEntities = (entities: readonly Card[]): void => {
        cardsService.slotContentService.upsertEntities(cards, entities);
    };
    const upsertEntity = (entity: Card): void => {
        cardsService.slotContentService.upsertEntity(cards, entity);
    };
    const updateEntityByKey = (id: string, patch: Partial<Card>): void => {
        const slot = cardsService.findSlotByKey(cards, id);
        if (slot !== undefined) cardsService.slotContentService.updateEntity(slot, patch);
    };
    return { upsertEntities, upsertEntity, updateEntityByKey, getOrderValue, during, ids };
}

describe('a bucket hands its slots back in the order they were put in', () => {
    it('hands back the live list itself and never a copy', () => {
        const { service, bucket } = makePositional();
        service.addBucketMemberSlot(bucket, cardSlot('a', 10));

        expect(service.getBucketMemberSlots(bucket)).toBe(bucket.bucketSlotsStore.bucketMemberSlots);
    });

    it('keeps the order the slots were added in', () => {
        const { service, bucket } = makePositional();
        service.addBucketMemberSlot(bucket, cardSlot('c', 30));
        service.addBucketMemberSlot(bucket, cardSlot('a', 10));

        expect(idsOf(service.getBucketMemberSlots(bucket))).toEqual(['c', 'a']);
    });
});

describe('a slot arriving and a slot leaving', () => {
    it('takes a removed slot out of the list and leaves the order of the rest alone', () => {
        const { service, bucket } = makePositional();
        const slots = eight();
        for (const slot of slots) service.addBucketMemberSlot(bucket, slot);

        service.removeBucketMemberSlot(bucket, slots[3]);

        expect(idsOf(service.getBucketMemberSlots(bucket))).toEqual(['a', 'b', 'c', 'e', 'f', 'g', 'h']);
    });

    it('ignores a removal of a slot it does not hold', () => {
        const { service, bucket } = makePositional();
        service.addBucketMemberSlot(bucket, cardSlot('a', 10));

        service.removeBucketMemberSlot(bucket, cardSlot('stranger', 99));
        expect(service.getBucketMemberSlotCount(bucket)).toBe(1);
    });
});

function reconcileFindsNothing(held: readonly TCardSlot[], slots: readonly TCardSlot[]): boolean {
    const { service, bucket } = makePositional();
    for (const slot of held) service.addBucketMemberSlot(bucket, slot);
    return !service.writeBucketMemberSlots(bucket, slots);
}

describe('whether the caller\'s list is the slots already held', () => {
    it('says a bucket does NOT hold the same slots named in another order', () => {
        const a = cardSlot('a', 10);
        const b = cardSlot('b', 20);

        expect(reconcileFindsNothing([a, b], [a, b])).toBe(true);
        expect(reconcileFindsNothing([a, b], [b, a])).toBe(false);
    });

    it('counts a slot named twice as two of the slots a bucket holds', () => {
        const a = cardSlot('a', 10);
        const b = cardSlot('b', 20);

        expect(reconcileFindsNothing([a, b], [a, a, b])).toBe(false);
        expect(reconcileFindsNothing([a, b], [b, a, b])).toBe(false);
    });

    it('holds exactly a list with a repeat once it has actually joined that repeat', () => {
        const a = cardSlot('a', 10);
        const b = cardSlot('b', 20);

        expect(reconcileFindsNothing([b, b, a], [b, b, a])).toBe(true);
        expect(reconcileFindsNothing([b, b, a], [a, b, b])).toBe(false);
    });

    it('refuses a list naming fewer slots than the bucket holds', () => {
        const a = cardSlot('a', 10);

        expect(reconcileFindsNothing([a, cardSlot('b', 20)], [a])).toBe(false);
    });

    it('refuses a list naming a slot the bucket does not hold', () => {
        const a = cardSlot('a', 10);

        expect(reconcileFindsNothing([a], [cardSlot('stranger', 99)])).toBe(false);
        expect(reconcileFindsNothing([a], [a, cardSlot('stranger', 99)])).toBe(false);
    });

    it('describes a bucket that took the same slot twice, by the list that built it', () => {
        const { service, bucket } = makePositional();
        const a = cardSlot('a', 10);
        service.addBucketMemberSlot(bucket, a);
        service.addBucketMemberSlot(bucket, a);

        expect(service.getBucketMemberSlotCount(bucket)).toBe(2);
        expect(reconcileFindsNothing([a, a], [a])).toBe(false);
        expect(reconcileFindsNothing([a, a], [a, a])).toBe(true);
    });
});

describe('what the deduplicating service keeps that the plain one does not', () => {
    it('holds once a slot added twice, where the plain one holds it twice', () => {
        const plain = makePositional();
        const unique = makeUnique();
        const a = cardSlot('a', 10);

        plain.service.addBucketMemberSlot(plain.bucket, a);
        plain.service.addBucketMemberSlot(plain.bucket, a);
        unique.service.addBucketMemberSlot(unique.bucket, a);
        unique.service.addBucketMemberSlot(unique.bucket, a);

        expect(plain.service.getBucketMemberSlotCount(plain.bucket)).toBe(2);
        expect(idsOf(plain.service.getBucketMemberSlots(plain.bucket))).toEqual(['a', 'a']);
        expect(unique.service.getBucketMemberSlotCount(unique.bucket)).toBe(1);
        expect(idsOf(unique.service.getBucketMemberSlots(unique.bucket))).toEqual(['a']);
    });

    it('settles a removal of a slot it does not hold in one hash, without touching the list', () => {
        const { service, bucket } = makeUnique();
        const a = cardSlot('a', 10);
        service.addBucketMemberSlot(bucket, a);

        service.removeBucketMemberSlot(bucket, cardSlot('stranger', 99));
        expect(service.getBucketMemberSlotCount(bucket)).toBe(1);
        expect(idsOf(service.getBucketMemberSlots(bucket))).toEqual(['a']);
    });

    it('lets a slot back in after it left, because every departure clears the set too', () => {
        const { service, bucket } = makeUnique();
        const a = cardSlot('a', 10);
        const b = cardSlot('b', 20);
        const c = cardSlot('c', 30);
        service.addBucketMemberSlot(bucket, a);
        service.addBucketMemberSlot(bucket, b);
        service.addBucketMemberSlot(bucket, c);

        expect(service.getBucketMemberSlotPosition(bucket, a)).toBe(0);
        service.removeBucketMemberSlot(bucket, a);
        expect(service.getBucketMemberSlotPosition(bucket, a)).toBe(-1);
        expect(service.getBucketMemberSlotPosition(bucket, b)).toBe(0);
        service.removeBucketMemberSlot(bucket, b);
        expect(service.getBucketMemberSlotPosition(bucket, b)).toBe(-1);
        service.addBucketMemberSlot(bucket, a);
        expect(idsOf(service.getBucketMemberSlots(bucket))).toEqual(['c', 'a']);

        expect(service.getBucketMemberSlotCount(bucket)).toBe(2);
        service.clearBucketMemberSlots(bucket);
        expect(service.getBucketMemberSlotCount(bucket)).toBe(0);
        service.addBucketMemberSlot(bucket, a);
        expect(idsOf(service.getBucketMemberSlots(bucket))).toEqual(['a']);
    });

    it('keeps the set and the list answering the same thing through every door it still has', () => {
        const { service, bucket } = makeUnique();
        const a = cardSlot('a', 10);
        const b = cardSlot('b', 20);
        service.addBucketMemberSlot(bucket, a);
        service.addBucketMemberSlot(bucket, b);
        const changedAtRevision = bucket.changedAtRevision;
        service.addBucketMemberSlot(bucket, b);
        expect(bucket.changedAtRevision).toBe(changedAtRevision);
        expect(service.getBucketMemberSlotCount(bucket)).toBe(2);
        expect(bucket.bucketSlotsStore.uniqueBucketMemberSlots.size).toBe(2);

        service.removeBucketMemberSlot(bucket, b);

        expect(service.getBucketMemberSlotCount(bucket)).toBe(1);
        expect(idsOf(service.getBucketMemberSlots(bucket))).toEqual(['a']);
        expect(bucket.bucketSlotsStore.uniqueBucketMemberSlots.size).toBe(1);
        expect(bucket.bucketSlotsStore.uniqueBucketMemberSlots.has(a)).toBe(true);
        expect(bucket.bucketSlotsStore.uniqueBucketMemberSlots.has(b)).toBe(false);

        service.clearBucketMemberSlots(bucket);
        expect(service.getBucketMemberSlotCount(bucket)).toBe(0);
        expect(bucket.bucketSlotsStore.uniqueBucketMemberSlots.size).toBe(0);
    });
});

describe('positions, for the service whose order the caller places', () => {
    it('clamps a placement to the ends of the list rather than leaving a hole', () => {
        const { service, bucket } = makePositional();
        const a = cardSlot('a', 10);
        const b = cardSlot('b', 20);
        service.insertBucketMemberSlotAt(bucket, -5, a);
        service.insertBucketMemberSlotAt(bucket, 99, b);

        expect(idsOf(service.getBucketMemberSlots(bucket))).toEqual(['a', 'b']);
        expect(service.getBucketMemberSlotAt(bucket, 0)).toBe(a);
        expect(service.getBucketMemberSlotAt(bucket, 7)).toBeUndefined();
    });

    it('takes a run out and hands it back, and takes nothing for a count of none', () => {
        const { service, bucket } = makePositional();
        const slots = eight();
        for (const slot of slots) service.addBucketMemberSlot(bucket, slot);

        expectSlotsToBe(service.removeBucketMemberSlotRange(bucket, 6, 99), [slots[6], slots[7]]);
        expect(service.removeBucketMemberSlotRange(bucket, 0, 0).length).toBe(0);
        expect(service.removeBucketMemberSlotRange(bucket, 99, 1).length).toBe(0);
        expect(service.removeBucketMemberSlotAt(bucket, 99)).toBeUndefined();
        expect(service.getBucketMemberSlotCount(bucket)).toBe(6);
    });

    it('scans its list to say whether a slot is in it and where', () => {
        const { service, bucket } = makePositional();
        const slots = eight();
        for (const slot of slots) service.addBucketMemberSlot(bucket, slot);

        expect(service.hasBucketMemberSlot(bucket, slots[5])).toBe(true);
        expect(service.hasBucketMemberSlot(bucket, cardSlot('stranger', 99))).toBe(false);
        expect(service.getBucketMemberSlotPosition(bucket, slots[5])).toBe(5);
        expect(service.getBucketMemberSlotPosition(bucket, cardSlot('stranger', 99))).toBe(-1);
    });

    it('moves one slot and says which, and says nothing when the list is what it was', () => {
        const { service, bucket } = makePositional();
        const slots = eight();
        for (const slot of slots) service.addBucketMemberSlot(bucket, slot);

        expect(service.moveBucketMemberSlotToPosition(bucket, 0, 2)).toBe(slots[0]);
        expect(idsOf(service.getBucketMemberSlots(bucket))).toEqual(['b', 'c', 'a', 'd', 'e', 'f', 'g', 'h']);
        expect(service.moveBucketMemberSlotToPosition(bucket, 2, 2)).toBeUndefined();
        expect(service.moveBucketMemberSlotToPosition(bucket, -1, 2)).toBeUndefined();
        expect(service.moveBucketMemberSlotToPosition(bucket, 0, 99)).toBeUndefined();
    });

    it('moves a run to a landing keyed on the list without the run in it', () => {
        const { service, bucket } = makePositional();
        const slots = eight();
        for (const slot of slots) service.addBucketMemberSlot(bucket, slot);
        const order = (): (string | undefined)[] => idsOf(service.getBucketMemberSlots(bucket));

        service.moveBucketMemberSlotRangeToPosition(bucket, 0, 2, 3);
        expect(order()).toEqual(['c', 'd', 'e', 'a', 'b', 'f', 'g', 'h']);
        expect(service.getBucketMemberSlotAt(bucket, 3)).toBe(slots[0]);
        expect(service.getBucketMemberSlotAt(bucket, 4)).toBe(slots[1]);
        service.moveBucketMemberSlotRangeToPosition(bucket, 3, 2, 3);
        expect(order()).toEqual(['c', 'd', 'e', 'a', 'b', 'f', 'g', 'h']);
        service.moveBucketMemberSlotRangeToPosition(bucket, 0, 0, 1);
        expect(order()).toEqual(['c', 'd', 'e', 'a', 'b', 'f', 'g', 'h']);
        service.moveBucketMemberSlotRangeToPosition(bucket, 99, 1, 0);
        expect(order()).toEqual(['c', 'd', 'e', 'a', 'b', 'f', 'g', 'h']);
        service.moveBucketMemberSlotRangeToPosition(bucket, 6, 99, 0);
        expect(order()).toEqual(['g', 'h', 'c', 'd', 'e', 'a', 'b', 'f']);
        expect(service.getBucketMemberSlotAt(bucket, 0)).toBe(slots[6]);
        expect(service.getBucketMemberSlotAt(bucket, 1)).toBe(slots[7]);
        service.moveBucketMemberSlotRangeToPosition(bucket, 0, 2, 99);
        expect(order()).toEqual(['c', 'd', 'e', 'a', 'b', 'f', 'g', 'h']);
        expect(service.getBucketMemberSlotAt(bucket, 6)).toBe(slots[6]);
        expect(service.getBucketMemberSlotAt(bucket, 7)).toBe(slots[7]);
        service.moveBucketMemberSlotRangeToPosition(bucket, 6, 2, 99);
        expect(order()).toEqual(['c', 'd', 'e', 'a', 'b', 'f', 'g', 'h']);
        service.moveBucketMemberSlotRangeToPosition(bucket, 6, 2, -5);
        expect(order()).toEqual(['g', 'h', 'c', 'd', 'e', 'a', 'b', 'f']);
        expect(service.getBucketMemberSlotAt(bucket, 0)).toBe(slots[6]);
        expect(service.getBucketMemberSlotAt(bucket, 1)).toBe(slots[7]);
    });
});

describe('an index order keeps its entity slots in the sorter\'s order under writes', () => {
    it('puts entities in the sorter\'s order however they arrived', () => {
        const { upsertEntities, ids } = makeIndexOrder();
        upsertEntities([{ id: 'c', rank: 30 }, { id: 'a', rank: 10 }, { id: 'b', rank: 20 }]);

        expect(ids()).toEqual(['a', 'b', 'c']);
    });

    it('sorts once and asks the sorter nothing on the next read', () => {
        const { upsertEntities, getOrderValue, during, ids } = makeIndexOrder();
        upsertEntities(eightCards());
        expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
        const before = getOrderValue();
        during.compared = 0;

        expect(getOrderValue()).toBe(before);
        expect(during.compared).toBe(0);
    });

    it('lands an arrival that belongs in the middle in the middle', () => {
        const { upsertEntities, upsertEntity, ids } = makeIndexOrder();
        upsertEntities(eightCards());
        expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);

        upsertEntity({ id: 'mid', rank: 45 });

        expect(ids()).toEqual(['a', 'b', 'c', 'd', 'mid', 'e', 'f', 'g', 'h']);
    });

    it('re-places the entity whose rank moved', () => {
        const { upsertEntities, updateEntityByKey, ids } = makeIndexOrder();
        upsertEntities(eightCards());
        expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);

        updateEntityByKey('d', { rank: 75 });

        expect(ids()).toEqual(['a', 'b', 'c', 'e', 'f', 'g', 'd', 'h']);
    });

    it('puts back exactly where it sat an entity whose new rank left the order alone', () => {
        const { upsertEntities, updateEntityByKey, getOrderValue, ids } = makeIndexOrder();
        upsertEntities(eightCards());
        expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
        const before = getOrderValue();

        updateEntityByKey('c', { rank: 35 });

        expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
        expect(getOrderValue()).toBe(before);
    });

    it('separates two entities whose ranks both drop below the first, and brings them back the other way round', () => {
        const { upsertEntities, updateEntityByKey, ids } = makeIndexOrder();
        upsertEntities([{ id: 'a', rank: 10 }, { id: 'b', rank: 20 }, { id: 'c', rank: 30 }]);
        expect(ids()).toEqual(['a', 'b', 'c']);

        updateEntityByKey('b', { rank: 7 });
        updateEntityByKey('c', { rank: 5 });

        expect(ids()).toEqual(['c', 'b', 'a']);
    });
});

describe('entities the sorter cannot separate keep the places they hold', () => {
    const withATieRun = () => {
        const fixture = makeIndexOrder();
        fixture.upsertEntities([
            { id: 'a', rank: 10 }, { id: 't1', rank: 20 }, { id: 't2', rank: 20 }, { id: 't3', rank: 20 }, { id: 'z', rank: 30 },
        ]);
        expect(fixture.ids()).toEqual(['a', 't1', 't2', 't3', 'z']);
        return fixture;
    };

    it('puts an entity whose rank was rewritten unchanged back among its equals exactly where it sat', () => {
        const { updateEntityByKey, ids } = withATieRun();

        updateEntityByKey('t1', { rank: 20 });

        expect(ids()).toEqual(['a', 't1', 't2', 't3', 'z']);
    });

    it('puts an entity that moved INTO a tie run at the front of it, where it came from', () => {
        const { updateEntityByKey, ids } = withATieRun();

        updateEntityByKey('a', { rank: 20 });

        expect(ids()).toEqual(['a', 't1', 't2', 't3', 'z']);
    });

    it('moves an entity that joins a run of equals from in front of it to the head of that run', () => {
        const { upsertEntities, updateEntityByKey, ids } = makeIndexOrder();
        upsertEntities([{ id: 'm', rank: 5 }, { id: 'a', rank: 10 }, { id: 't1', rank: 20 }, { id: 't2', rank: 20 }]);
        expect(ids()).toEqual(['m', 'a', 't1', 't2']);

        updateEntityByKey('m', { rank: 20 });

        expect(ids()).toEqual(['a', 'm', 't1', 't2']);
    });

    it('keeps an entity that arrives at a tie from behind last among the equals it reached', () => {
        const { updateEntityByKey, ids } = withATieRun();

        updateEntityByKey('z', { rank: 20 });

        expect(ids()).toEqual(['a', 't1', 't2', 't3', 'z']);
    });
});

describe('a sorter that throws costs an order and never an entity', () => {
    it('settles to the sorter\'s order on the next read after it threw over an entity whose rank moved', () => {
        const { upsertEntities, updateEntityByKey, getOrderValue, during, ids } = makeIndexOrder();
        upsertEntities(eightCards());
        expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
        updateEntityByKey('d', { rank: 75 });

        during.current = refusing('d');
        expect(() => getOrderValue()).toThrow('the sorter refused this pair');

        during.current = passThrough;
        expect(ids()).toEqual(['a', 'b', 'c', 'e', 'f', 'g', 'd', 'h']);
    });

    it('settles to the sorter\'s order on the next read after it threw over two entities that tie', () => {
        const { upsertEntities, updateEntityByKey, getOrderValue, during, ids } = makeIndexOrder();
        upsertEntities([{ id: 'a', rank: 10 }, { id: 'b', rank: 20 }, { id: 'c', rank: 30 }]);
        expect(ids()).toEqual(['a', 'b', 'c']);
        updateEntityByKey('b', { rank: 5 });
        updateEntityByKey('c', { rank: 5 });

        during.current = refusing('b');
        expect(() => getOrderValue()).toThrow('the sorter refused this pair');

        during.current = passThrough;
        expect(ids()).toEqual(['b', 'c', 'a']);
    });

    it('keeps every arrival after it threw while placing them', () => {
        const { upsertEntities, upsertEntity, getOrderValue, during, ids } = makeIndexOrder();
        upsertEntities(eightCards());
        expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
        upsertEntity({ id: 'first', rank: 45 });
        upsertEntity({ id: 'second', rank: 55 });

        during.current = refusing('second');
        expect(() => getOrderValue()).toThrow('the sorter refused this pair');

        during.current = passThrough;
        expect(ids()).toEqual(['a', 'b', 'c', 'd', 'first', 'e', 'second', 'f', 'g', 'h']);
    });
});
