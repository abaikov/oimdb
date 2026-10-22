import { OIMDB } from '../../../../factories/OIMDB';
import { createOIMEntityService } from '../../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../../factories/createOIMBucketService';
import { createOIMIndexService } from '../../../../factories/createOIMIndexService';
import { createOIMComputedServiceSorted } from '../../../../factories/createOIMComputedServiceSorted';
import { OIMSlotContentBucketServiceArrayDriven } from '../../../../facade/bucket/OIMSlotContentBucketServiceArrayDriven';
import { OIMBucketArrayMembershipUnique } from '../OIMBucketArrayMembershipUnique';
import { OIMEffectService } from '../../../computed/OIMEffectService';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../../../entity/types/TOIMEntityColumnName';
import type { TOIMBucketSlotsArrayUniqueStore } from '../types/TOIMBucketSlotsArrayUniqueStore';

type TCard = { id: string; deckId: string; rank: number };
type TRanked = { id: string; rank: number; label?: string };
type TCardSlot = TOIMEntitySlot<TCard, string>;
type TUniqueSlots = TOIMBucketSlotsArrayUniqueStore<TCardSlot>;

describe('a deduplicating bucket', () => {
    it('adding the same slot twice leaves one slot', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard, TOIMEntityColumnName<TCard>, string>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const membersService = new OIMSlotContentBucketServiceArrayDriven<TCardSlot, TUniqueSlots>({
            bucketArrayMembership: new OIMBucketArrayMembershipUnique<TCardSlot>(),
        });
        const searchService = createOIMBucketService<
            TCardSlot, string, TUniqueSlots, OIMSlotContentBucketServiceArrayDriven<TCardSlot, TUniqueSlots>
        >(db, { slotContentService: membersService });
        const search = searchService.createStoreSlot(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1', rank: 0 });
        db.flush();

        const c1 = cardsService.getSlotByKey(cards, 'c1')!;
        const bucket = searchService.holdSlotByKey(search, 'k');
        membersService.addBucketMemberSlot(bucket, c1);
        membersService.addBucketMemberSlot(bucket, c1);

        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(1);
    });
});

function ordered(entities: readonly TRanked[]) {
    const counter = { comparisons: 0 };
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<TRanked>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byAllService = createOIMIndexService(db, {
        entityService: cardsService,
        keyOf: (_card: TRanked): string => 'all',
    });
    const byAll = byAllService.createIndexStoreSlot(cards);
    const ordersService = createOIMComputedServiceSorted({
        indexService: byAllService,
        sortColumns: [{ column: 'rank', direction: 'asc' }],
        comparator: (left: TRanked, right: TRanked) => {
            counter.comparisons++;
            return left.rank - right.rank;
        },
    });
    const orders = ordersService.createSortedStoreSlot(byAll);
    const order = ordersService.computedCollectionService.holdSlotByKey(orders, 'all');
    const ids = (): string[] => ordersService.computedCollectionService.slotContentService.getValueForSlot(order)
        .map(slot => (slot.entity as TRanked).id);
    const upsertEntities = (batch: readonly TRanked[]): void => {
        cardsService.slotContentService.upsertEntities(cards, batch);
    };
    const upsertEntity = (entity: TRanked): void => {
        cardsService.slotContentService.upsertEntity(cards, entity);
    };
    const updateEntityByKey = (id: string, patch: Partial<TRanked>): void => {
        const slot = cardsService.findSlotByKey(cards, id);
        if (slot !== undefined) cardsService.slotContentService.updateEntity(slot, patch);
    };
    const deleteEntityByKey = (id: string): void => {
        const slot = cardsService.findSlotByKey(cards, id);
        if (slot !== undefined) cardsService.slotContentService.deleteEntity(slot);
    };
    upsertEntities(entities);
    db.flush();
    ids();
    return { db, effectService, upsertEntities, upsertEntity, updateEntityByKey, deleteEntityByKey, order, ids, counter };
}

describe('an index order of a deck', () => {
    it('is correct after cards join the deck and more join it later', () => {
        const { upsertEntities, ids } = ordered([]);
        upsertEntities([{ id: 'c1', rank: 5 }, { id: 'c2', rank: 1 }]);
        expect(ids().join(',')).toBe('c2,c1');

        upsertEntities([{ id: 'c3', rank: 3 }, { id: 'c4', rank: 0 }]);
        expect(ids().join(',')).toBe('c4,c2,c3,c1');
    });

    it('is correct when one card leaves and a new one joins', () => {
        const { upsertEntity, deleteEntityByKey, ids } = ordered([{ id: 'c1', rank: 5 }, { id: 'c2', rank: 1 }, { id: 'c3', rank: 3 }]);
        expect(ids().join(',')).toBe('c2,c3,c1');

        deleteEntityByKey('c3');
        upsertEntity({ id: 'c4', rank: 0 });
        expect(ids().join(',')).toBe('c4,c2,c1');
    });

    it('re-sorts on the read after a write, once, and not again on the next read', () => {
        const { updateEntityByKey, ids, counter } = ordered([{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }]);
        updateEntityByKey('a', { rank: 9 });
        counter.comparisons = 0;

        expect(ids()).toEqual(['b', 'c', 'a']);
        const settled = counter.comparisons;
        expect(settled).toBeGreaterThan(0);
        ids();
        expect(counter.comparisons).toBe(settled);
    });
});

describe('an entity whose rank moved', () => {
    it('moves to the front, to the back, and past several others', () => {
        const { db, updateEntityByKey, ids } = ordered([
            { id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }, { id: 'd', rank: 4 },
        ]);
        expect(ids()).toEqual(['a', 'b', 'c', 'd']);

        updateEntityByKey('d', { rank: 0 });
        db.flush();
        expect(ids()).toEqual(['d', 'a', 'b', 'c']);

        updateEntityByKey('d', { rank: 9 });
        db.flush();
        expect(ids()).toEqual(['a', 'b', 'c', 'd']);

        updateEntityByKey('a', { rank: 3.5 });
        db.flush();
        expect(ids()).toEqual(['b', 'c', 'a', 'd']);
    });

    it('several moving in one frame, in both directions', () => {
        const { db, updateEntityByKey, ids } = ordered([
            { id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }, { id: 'd', rank: 4 },
        ]);
        updateEntityByKey('a', { rank: 10 });
        updateEntityByKey('c', { rank: 0 });
        db.flush();
        expect(ids()).toEqual(['c', 'b', 'd', 'a']);
    });

    it('an entity that arrives and moves in the same frame is placed once', () => {
        const { db, upsertEntity, updateEntityByKey, ids } = ordered([{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }]);
        upsertEntity({ id: 'e', rank: 5 });
        updateEntityByKey('e', { rank: 0 });
        db.flush();
        expect(ids()).toEqual(['e', 'a', 'b', 'c']);
    });

    it('an entity that moved and left in the same frame leaves nothing behind', () => {
        const { db, updateEntityByKey, deleteEntityByKey, ids } = ordered([{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }]);
        updateEntityByKey('b', { rank: 0 });
        deleteEntityByKey('b');
        db.flush();
        expect(ids()).toEqual(['a', 'c']);

        updateEntityByKey('a', { rank: 4 });
        db.flush();
        expect(ids()).toEqual(['c', 'a']);
    });

    it('an entity written on a column the sorter does not read stays exactly where it was', () => {
        const { db, updateEntityByKey, ids } = ordered([
            { id: 'a', rank: 1, label: 'x' },
            { id: 'b', rank: 1, label: 'x' },
            { id: 'c', rank: 1, label: 'x' },
        ]);
        expect(ids()).toEqual(['a', 'b', 'c']);

        updateEntityByKey('a', { label: 'y' });
        db.flush();
        expect(ids()).toEqual(['a', 'b', 'c']);

        updateEntityByKey('b', { label: 'y' });
        updateEntityByKey('c', { label: 'y' });
        db.flush();
        expect(ids()).toEqual(['a', 'b', 'c']);
    });

    it('an entity moving INTO a run of equals lands where a stable sort puts it', () => {
        const first = ordered([{ id: 'a', rank: 1 }, { id: 'b', rank: 5 }, { id: 'c', rank: 5 }]);
        expect(first.ids()).toEqual(['a', 'b', 'c']);
        first.updateEntityByKey('a', { rank: 5 });
        first.db.flush();
        expect(first.ids()).toEqual(['a', 'b', 'c']);

        const second = ordered([{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 9 }]);
        second.updateEntityByKey('a', { rank: 9 });
        second.db.flush();
        expect(second.ids()).toEqual(['b', 'a', 'c']);

        const third = ordered([{ id: 'a', rank: 1 }, { id: 'b', rank: 1 }, { id: 'c', rank: 9 }]);
        third.updateEntityByKey('c', { rank: 1 });
        third.db.flush();
        expect(third.ids()).toEqual(['a', 'b', 'c']);
    });

    it('eight of twelve moving in one frame settle to the sorted order', () => {
        const entities: TRanked[] = [];
        for (let i = 0; i < 12; i++) entities.push({ id: `r${i}`, rank: i });
        const { db, updateEntityByKey, ids } = ordered(entities);
        expect(ids()[0]).toBe('r0');

        for (let i = 0; i < 8; i++) updateEntityByKey(`r${i}`, { rank: 100 - i });
        db.flush();
        expect(ids()).toEqual([
            'r8', 'r9', 'r10', 'r11', 'r7', 'r6', 'r5', 'r4', 'r3', 'r2', 'r1', 'r0',
        ]);
    });

    it('two rank writes that keep the order wake the order\'s subscriber and run nobody', () => {
        const entities: TRanked[] = [];
        for (let i = 0; i < 7; i++) entities.push({ id: `r${i}`, rank: i * 10, label: 'a' });
        const { db, effectService, updateEntityByKey, order, ids } = ordered(entities);

        let runCount = 0;
        expect(ids()).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
        effectService.createEffect(db, [], [order], () => { runCount++; });
        db.flush();
        updateEntityByKey('r2', { rank: 1 });
        db.flush();
        expect(runCount).toBe(1);
        updateEntityByKey('r2', { rank: 20 });
        db.flush();
        runCount = 0;

        updateEntityByKey('r0', { rank: 1, label: 'b' });
        updateEntityByKey('r1', { rank: 11, label: 'b' });
        db.flush();

        expect(ids()).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
        db.flush();
        expect(runCount).toBe(0);
    });

    it.each([20260808, 991, 4242])('random churn settles to exactly what a stable sort gives (seed %i)', seed => {
        const { upsertEntity, updateEntityByKey, deleteEntityByKey, ids } = ordered([]);

        let state = seed;
        const random = (bound: number): number => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return bound <= 0 ? 0 : (state >>> 8) % bound;
        };

        let list: string[] = [];
        const rank = new Map<string, number>();
        let minted = 0;

        for (let round = 0; round < 120; round++) {
            for (let i = random(5); i > 0; i--) {
                const id = `r${minted++}`;
                const value = random(7);
                rank.set(id, value);
                upsertEntity({ id, rank: value });
                list.push(id);
            }
            for (let i = random(9); i > 0 && list.length > 0; i--) {
                const id = list[random(list.length)];
                const value = random(7);
                rank.set(id, value);
                updateEntityByKey(id, { rank: value });
            }
            for (let i = random(4); i > 0 && list.length > 0; i--) {
                const at = random(list.length);
                deleteEntityByKey(list[at]);
                rank.delete(list[at]);
                list.splice(at, 1);
            }

            const expected = list.slice().sort((x, y) => (rank.get(x) ?? 0) - (rank.get(y) ?? 0));
            expect(ids()).toEqual(expected);
            list = expected;
        }
        expect(minted).toBeGreaterThan(100);
        expect(list.length).toBeGreaterThan(4);
    });
});
