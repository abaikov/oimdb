import {
    OIMDB,
    OIMEffectService,
    createOIMBucketService,
    createOIMEntityService,
} from '../../../index';
import type {
    TOIMBucketSlot,
    TOIMEntityColumnName,
    TOIMEntitySlot,
    TOIMBucketSlotsArrayStore,
} from '../../../index';
import { assertConsistent, bucketsUnderTest, entitiesUnderTest } from '../../../../tests/support/assertConsistent';

type TCard = { id: string };
type TCardSlot = TOIMEntitySlot<TCard, string>;
type TSlots = TOIMBucketSlotsArrayStore<TCardSlot>;
type TList = TOIMBucketSlot<TSlots, string>;

const VALUED = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'] as const;
const RESERVED = ['g0', 'g1', 'g2', 'g3', 'g4'] as const;
const SIDES = ['left', 'right'] as const;
type TSide = (typeof SIDES)[number];

const makeRandom = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
};

const clamp = (value: number, low: number, high: number): number =>
    value < low ? low : value > high ? high : value;

type TFrame = {
    readonly did: string;
    readonly left: string;
    readonly right: string;
    readonly population: number;
    readonly wokeLeft: number;
    readonly wokeRight: number;
};

const run = (seed: number, steps: number): TFrame[] => {
    const random = makeRandom(seed);
    const pick = <T>(from: readonly T[]): T => from[Math.floor(random() * from.length)];
    const anyPosition = (size: number): number => Math.floor(random() * (size + 4)) - 2;

    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<TCard, TOIMEntityColumnName<TCard>, string>(db, { keyOf: (card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const listService = createOIMBucketService<TCardSlot, string>(db);
    const listContentService = listService.slotContentService;
    const list = listService.createStoreSlot(db);
    const listsUnderTest = {
        getSlots: (storeSlot: typeof list) => listService.getSlots(storeSlot),
        getSlotByKey: (storeSlot: typeof list, key: string) => listService.getSlotByKey(storeSlot, key),
        getBucketMemberSlots: (bucketSlot: TList) => listContentService.getBucketMemberSlots(bucketSlot),
        getBucketMemberSlotCount: (bucketSlot: TList) => listContentService.getBucketMemberSlotCount(bucketSlot),
    };
    for (const id of VALUED) cardsService.slotContentService.upsertEntity(cards, { id });
    db.flush();

    const woken: Record<TSide, number> = { left: 0, right: 0 };
    const watch = (side: TSide): TList => {
        const heldSlot = listService.holdSlotByKey(list, side);
        effectService.createEffect(db, [heldSlot], [], () => { woken[side]++; });
        heldSlot.owner.unholdSlot(heldSlot);
        return heldSlot;
    };
    const buckets: Record<TSide, TList> = { left: watch('left'), right: watch('right') };

    const names = new Map<TOIMEntitySlot, string>();

    const model: Record<TSide, string[]> = { left: [], right: [] };
    const reserved = new Set<string>();
    const askedThisStep = new Set<string>();

    const isReserved = (id: string): boolean => (RESERVED as readonly string[]).includes(id);
    const askAtFlush = (id: string): void => { if (isReserved(id)) askedThisStep.add(id); };
    const reservations: (() => void)[] = [];
    const slotFor = (id: string): TCardSlot => {
        const heldSlot = cardsService.holdSlotByKey(cards, id);
        reservations.push(() => { heldSlot.owner.unholdSlot(heldSlot); });
        names.set(heldSlot, id);
        if (isReserved(id)) reserved.add(id);
        return heldSlot;
    };
    const handBackReservations = (): void => {
        for (const release of reservations) release();
        reservations.length = 0;
    };
    const releaseReservationsOutsideModel =(): void => {
        for (const id of askedThisStep) {
            if (model.left.includes(id) || model.right.includes(id)) continue;
            reserved.delete(id);
        }
        askedThisStep.clear();
    };

    const modelInsertAt = (side: TSide, at: number, id: string): void => {
        const held = model[side];
        held.splice(clamp(at, 0, held.length), 0, id);
    };

    const modelRemoveAt = (side: TSide, at: number): void => {
        const held = model[side];
        if (at < 0 || at >= held.length) return;
        askAtFlush(held.splice(at, 1)[0]);
    };

    const modelRemoveRange = (side: TSide, at: number, count: number): void => {
        const held = model[side];
        if (at < 0 || count <= 0 || at >= held.length) return;
        for (const id of held.splice(at, count)) askAtFlush(id);
    };

    const modelMove = (side: TSide, from: number, to: number): void => {
        const held = model[side];
        if (from < 0 || from >= held.length || to < 0 || to >= held.length || from === to) return;
        held.splice(to, 0, held.splice(from, 1)[0]);
    };

    const modelMoveRange = (side: TSide, from: number, count: number, to: number): void => {
        const held = model[side];
        if (from < 0 || count <= 0 || from >= held.length) return;
        const runOfSlots = held.splice(from, count);
        const landing = clamp(to, 0, held.length);
        for (let i = 0; i < runOfSlots.length; i++) held.splice(landing + i, 0, runOfSlots[i]);
    };

    const modelClear = (side: TSide): void => {
        for (const id of model[side]) askAtFlush(id);
        model[side].length = 0;
    };

    const modelSetSlots = (side: TSide, ids: readonly string[]): void => {
        const held = model[side];
        if (held.length === ids.length && held.every((id, i) => id === ids[i])) return;
        for (const id of held) askAtFlush(id);
        held.length = 0;
        for (const id of ids) held.push(id);
    };

    const engineView = (side: TSide): string[] =>
        Array.from(listContentService.getBucketMemberSlots(buckets[side])).map(slot => names.get(slot) ?? '?');

    const append = (side: TSide, slot: TCardSlot): void => {
        listContentService.insertBucketMemberSlotAt(buckets[side], listContentService.getBucketMemberSlotCount(buckets[side]), slot);
    };

    let shown: Record<TSide, string[]> = { left: [], right: [] };
    const trace: TFrame[] = [];

    let rebuilt: TSide | undefined;

    for (let step = 0; step < steps; step++) {
        for (const side of SIDES) woken[side] = 0;
        rebuilt = undefined;

        const side = pick(SIDES);
        const held = model[side];
        const size = held.length;
        const choice = random();
        let did: string;

        if (choice < 0.16) {
            const id = held.length > 0 && random() < 0.4 ? pick(held) : pick(random() < 0.35 ? RESERVED : VALUED);
            did = `append ${id} to ${side}`;
            append(side, slotFor(id));
            modelInsertAt(side, size, id);
        } else if (choice < 0.52) {
            const slot = size > 0 && random() < 0.55 ? pick(held) : undefined;
            const id = slot ?? pick(random() < 0.35 ? RESERVED : VALUED);
            const own = held.indexOf(id);
            const at = slot !== undefined && random() < 0.75
                ? pick([own, own - 1, own + 1, size, size - 1, 0])
                : anyPosition(size);
            did = `insert ${id} at ${at} of ${side}`;
            listContentService.insertBucketMemberSlotAt(buckets[side], at, slotFor(id));
            modelInsertAt(side, at, id);
        } else if (choice < 0.62) {
            const at = anyPosition(size);
            did = `removeAt ${at} of ${side}`;
            listContentService.removeBucketMemberSlotAt(buckets[side], at);
            modelRemoveAt(side, at);
        } else if (choice < 0.72) {
            const at = anyPosition(size);
            const count = Math.floor(random() * (size + 3)) - 1;
            did = `removeRange ${at}..+${count} of ${side}`;
            listContentService.removeBucketMemberSlotRange(buckets[side], at, count);
            modelRemoveRange(side, at, count);
        } else if (choice < 0.82) {
            const last = size - 1;
            const from = random() < 0.6 ? pick([last, 0, Math.max(0, last - 1)]) : anyPosition(size);
            const to = random() < 0.6 ? pick([last, 0, from]) : anyPosition(size);
            did = `move ${from} -> ${to} of ${side}`;
            listContentService.moveBucketMemberSlotToPosition(buckets[side], from, to);
            modelMove(side, from, to);
        } else if (choice < 0.9) {
            const from = anyPosition(size);
            const count = Math.floor(random() * 3);
            const to = random() < 0.5 ? size - 1 : anyPosition(size);
            did = `moveRange ${from}..+${count} -> ${to} of ${side}`;
            listContentService.moveBucketMemberSlotRangeToPosition(buckets[side], from, count, to);
            modelMoveRange(side, from, count, to);
        } else if (choice < 0.95) {
            const refill: string[] = [];
            const wanted = Math.floor(random() * 4);
            const pool = [...VALUED, ...RESERVED];
            for (let i = 0; i < wanted; i++) {
                const id = pick(pool);
                if (!refill.includes(id)) refill.push(id);
            }
            did = `clear ${side} then append [${refill.join(',')}]`;
            rebuilt = side;
            listContentService.clearBucketMemberSlots(buckets[side]);
            modelClear(side);
            for (const id of refill) {
                append(side, slotFor(id));
                modelInsertAt(side, model[side].length, id);
            }
        } else if (choice < 0.98) {
            did = `clear ${side}`;
            listContentService.clearBucketMemberSlots(buckets[side]);
            modelClear(side);
        } else {
            const wanted = Math.floor(random() * 5);
            const next: string[] = [];
            const pool = [...VALUED, ...RESERVED];
            for (let i = 0; i < wanted; i++) {
                const id = random() < 0.3 && size > 0 ? pick(held) : pick(pool);
                if (!next.includes(id)) next.push(id);
            }
            did = `write ${side} = [${next.join(',')}]`;
            listContentService.writeBucketMemberSlots(buckets[side], next.map(slotFor));
            modelSetSlots(side, next);
        }

        handBackReservations();
        db.flush();
        releaseReservationsOutsideModel();

        const where = `seed ${seed}, step ${step} (${did})`;

        assertConsistent(entitiesUnderTest(cardsService, cards), [bucketsUnderTest(listsUnderTest, list)], where);

        const next: Record<TSide, string[]> = { left: [], right: [] };
        for (const bucketSide of SIDES) {
            expect({ where, bucketSide, filed: listService.getSlotByKey(list, bucketSide) })
                .toEqual({ where, bucketSide, filed: buckets[bucketSide] });

            const fromEngine = engineView(bucketSide);
            next[bucketSide] = fromEngine;
            expect({ where, bucketSide, slots: fromEngine })
                .toEqual({ where, bucketSide, slots: model[bucketSide] });
            expect({ where, bucketSide, count: listContentService.getBucketMemberSlotCount(buckets[bucketSide]) })
                .toEqual({ where, bucketSide, count: model[bucketSide].length });

            const moved = shown[bucketSide].join('|') !== fromEngine.join('|');
            const told = woken[bucketSide];
            const everyWriteWasANoOp = !moved && bucketSide !== rebuilt;
            if (moved && told === 0) {
                throw new Error(
                    `${where}: "${bucketSide}" went from [${shown[bucketSide].join(', ')}] to ` +
                    `[${fromEngine.join(', ')}] and its effect was never woken.`,
                );
            }
            if (everyWriteWasANoOp && told > 0) {
                throw new Error(
                    `${where}: "${bucketSide}" was woken ${told} time(s) and every write this step made ` +
                    `to it changed nothing — it holds exactly what it held, [${fromEngine.join(', ')}]. ` +
                    'A write that cannot have changed what a reader sees must not wake anybody; there ' +
                    'is no sorter here, so nothing could have moved between the write and the flush.',
                );
            }
            if (told > 1) {
                throw new Error(
                    `${where}: "${bucketSide}" was woken ${told} times in one frame. A frame coalesces, ` +
                    'so an effect hears about a bucket once however many writes landed on it.',
                );
            }
        }
        shown = next;

        expect({ where, population: cardsService.getSlotCount(cards) })
            .toEqual({ where, population: VALUED.length + reserved.size });

        trace.push({
            did,
            left: next.left.join(','),
            right: next.right.join(','),
            population: cardsService.getSlotCount(cards),
            wokeLeft: woken.left,
            wokeRight: woken.right,
        });
    }

    return trace;
};

const SEEDS = [1, 2, 3, 5, 7, 11, 42, 1337, 90210];

describe('hand-placed slots against an implementation too simple to be wrong', () => {
    for (const seed of SEEDS) {
        it(`holds what the model holds, and wakes exactly when a list moves (seed ${seed})`, () => {
            run(seed, 300);
        });
    }
});

describe('a refused move wakes nobody', () => {
    const place = () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const cardsService = createOIMEntityService<TCard, TOIMEntityColumnName<TCard>, string>(db, { keyOf: (card) => card.id });
        const cards = cardsService.createStoreSlot(db);
        const listService = createOIMBucketService<TCardSlot, string>(db);
        const listContentService = listService.slotContentService;
        for (const id of ['a', 'b', 'c']) cardsService.slotContentService.upsertEntity(cards, { id });
        db.flush();
        const list = listService.createStoreSlot(db);
        const bucket = listService.holdSlotByKey(list, 'l');
        for (const id of ['a', 'b', 'c']) {
            listContentService.insertBucketMemberSlotAt(bucket, listContentService.getBucketMemberSlotCount(bucket), cardsService.getSlotByKey(cards, id)!);
        }
        db.flush();
        let runCount = 0;
        effectService.createEffect(db, [bucket], [], () => { runCount++; });
        const ids = () => Array.from(listContentService.getBucketMemberSlots(bucket)).map(slot => (slot.entity as TCard).id).join('');
        return { db, listContentService, bucket, ids, runCount: () => runCount };
    };

    it('moveSlotToPosition from a position to itself changes nothing and wakes nobody', () => {
        const { db, listContentService, bucket, ids, runCount } = place();
        listContentService.moveBucketMemberSlotToPosition(bucket, 1, 1);
        db.flush();
        expect(ids()).toBe('abc');
        expect(runCount()).toBe(0);
    });

    it('moveSlotToPosition refused for an out-of-range end wakes nobody', () => {
        const { db, listContentService, bucket, ids, runCount } = place();
        listContentService.moveBucketMemberSlotToPosition(bucket, 0, 99);
        db.flush();
        expect(ids()).toBe('abc');
        expect(runCount()).toBe(0);
    });

    it('moveSlotRangeToPosition refused for a count of zero wakes nobody', () => {
        const { db, listContentService, bucket, ids, runCount } = place();
        listContentService.moveBucketMemberSlotRangeToPosition(bucket, 0, 0, 2);
        db.flush();
        expect(ids()).toBe('abc');
        expect(runCount()).toBe(0);
    });

    it('moveSlotRangeToPosition onto the position the run already sits at wakes nobody', () => {
        const { db, listContentService, bucket, ids, runCount } = place();
        listContentService.moveBucketMemberSlotRangeToPosition(bucket, 0, 2, 0);
        db.flush();
        expect(ids()).toBe('abc');
        expect(runCount()).toBe(0);
    });
});
