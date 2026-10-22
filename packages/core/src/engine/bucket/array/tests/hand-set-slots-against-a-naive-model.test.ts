import { OIMDB } from '../../../../factories/OIMDB';
import { createOIMEntityService } from '../../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../../factories/createOIMBucketService';
import { OIMSlotContentBucketServiceArrayDriven } from '../../../../facade/bucket/OIMSlotContentBucketServiceArrayDriven';
import { OIMEffectService } from '../../../computed/OIMEffectService';
import type { TOIMBucketSlot } from '../../types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../../../entity/types/TOIMEntityColumnName';
import type { TOIMBucketSlotsArrayStore } from '../types/TOIMBucketSlotsArrayStore';
import { assertConsistent, bucketsUnderTest, entitiesUnderTest } from '../../../../../tests/support/assertConsistent';

type TRow = { id: string; rank: number; label: string };
type TRowSlot = TOIMEntitySlot<TRow, string>;
type TSlots = TOIMBucketSlotsArrayStore<TRowSlot>;
type TDeck = TOIMBucketSlot<TSlots, string>;

const QUERIES = ['q0', 'q1'] as const;
const KEYS = 10;

const makeRandom = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
};

const createFixture =() => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rowsService = createOIMEntityService<TRow, TOIMEntityColumnName<TRow>, string>(db, { keyOf: (row) => row.id });
    const rows = rowsService.createStoreSlot(db);
    const membersService = new OIMSlotContentBucketServiceArrayDriven<TRowSlot>();
    const searchService = createOIMBucketService<
        TRowSlot, string, TSlots, OIMSlotContentBucketServiceArrayDriven<TRowSlot>
    >(db, { slotContentService: membersService });
    const search = searchService.createStoreSlot(db);
    const upsertEntity = (row: TRow): void => { rowsService.slotContentService.upsertEntity(rows, row); };
    const updateEntityByKey = (id: string, patch: Partial<TRow>): void => {
        const slot = rowsService.findSlotByKey(rows, id);
        if (slot !== undefined) rowsService.slotContentService.updateEntity(slot, patch);
    };
    const deleteEntityByKey = (id: string): void => {
        const slot = rowsService.findSlotByKey(rows, id);
        if (slot !== undefined) rowsService.slotContentService.deleteEntity(slot);
    };
    const searchBucketService = {
        getSlots: (storeSlot: typeof search) => searchService.getSlots(storeSlot),
        getSlotByKey: (storeSlot: typeof search, key: string) => searchService.getSlotByKey(storeSlot, key),
        getBucketMemberSlots: (bucketSlot: TDeck) => membersService.getBucketMemberSlots(bucketSlot),
        getBucketMemberSlotCount: (bucketSlot: TDeck) => membersService.getBucketMemberSlotCount(bucketSlot),
    };
    return {
        db, effectService, rowsService, rows, membersService, searchService, search,
        upsertEntity, updateEntityByKey, deleteEntityByKey, searchBucketService,
    };
};

const run = (seed: number, steps: number): void => {
    const random = makeRandom(seed);
    const {
        db, effectService, rowsService, rows, membersService, searchService, search,
        upsertEntity, updateEntityByKey, deleteEntityByKey, searchBucketService,
    } = createFixture();

    const model = new Map<string, TRow>();
    /** The whole oracle for a bucket's slots: what the script set, and nothing else. */
    const slots = new Map<string, string[]>();
    for (const query of QUERIES) slots.set(query, []);
    const listOf = (name: string): string[] => slots.get(name) as string[];

    const buckets = new Map<string, TDeck>();
    const woken = new Map<string, number>();
    for (const query of QUERIES) {
        buckets.set(query, searchService.holdSlotByKey(search, query));
        woken.set(query, 0);
        effectService.createEffect(db, [buckets.get(query) as TDeck], [], () => {
            woken.set(query, (woken.get(query) ?? 0) + 1);
        });
    }
    const names = Array.from(slots.keys());

    /**
     * The bucket now holds exactly these keys, written through the collection
     * that owns it — a bucket carries no writes of its own.
     */
    const writeOf = (name: string, ids: readonly string[]): void => {
        slots.set(name, ids.slice());
        membersService.writeBucketMemberSlots(
            buckets.get(name) as TDeck,
            ids.map((id) => rowsService.getSlotByKey(rows, id)!));
    };

    const engineView = (name: string): string[] =>
        Array.from(membersService.getBucketMemberSlots(buckets.get(name) as TDeck))
            .map((slot) => slot.key as string);

    let shown = new Map(names.map((name) => [name, [] as string[]]));

    for (let step = 0; step < steps; step++) {
        for (const name of names) woken.set(name, 0);

        const id = `k${Math.floor(random() * KEYS)}`;
        const has = model.get(id);
        const choice = random();
        /** The upper bound on who may be woken by this step. */
        const mayWake = new Set<string>();

        if (has === undefined || choice < 0.25) {
            const row: TRow = { id, rank: Math.floor(random() * 20), label: `l${Math.floor(random() * 5)}` };
            upsertEntity({ ...row });
            model.set(id, row);
        } else if (choice < 0.4) {
            const label = `l${Math.floor(random() * 5)}`;
            updateEntityByKey(id, { label });
            model.set(id, { ...has, label });
        } else if (choice < 0.6) {
            const rank = Math.floor(random() * 20);
            updateEntityByKey(id, { rank });
            model.set(id, { ...has, rank });
        } else if (choice < 0.9) {
            const name = QUERIES[Math.floor(random() * QUERIES.length)];
            const wanted: string[] = [];
            const drawn = random() < 0.25
                ? listOf(name).slice()
                : Array.from(model.keys()).filter(() => random() < 0.4);
            for (const key of drawn) if (!wanted.includes(key)) wanted.push(key);

            const held = listOf(name);
            const changed = held.join(',') !== wanted.join(',');
            if (changed) mayWake.add(name);
            writeOf(name, changed ? wanted : held);
        } else {
            // A slot whose value left stays in every bucket that held it —
            // `remove` empties the value and nothing else — so the caller takes
            // it out, on this same step, which is what composing a response
            // looks like.
            deleteEntityByKey(id);
            model.delete(id);
            for (const name of names) {
                if (!listOf(name).includes(id)) continue;
                mayWake.add(name);
                writeOf(name, listOf(name).filter((key) => key !== id));
            }
        }

        db.flush();

        const where = `seed ${seed}, step ${step}`;
        assertConsistent(entitiesUnderTest(rowsService, rows), [bucketsUnderTest(searchBucketService, search)], where);

        const next = new Map<string, string[]>();
        for (const name of names) {
            const fromEngine = engineView(name);
            next.set(name, fromEngine);

            expect({ where, bucket: name, view: fromEngine }).toEqual({ where, bucket: name, view: listOf(name).slice() });

            const changed = (shown.get(name) ?? []).join(',') !== fromEngine.join(',');
            const told = (woken.get(name) ?? 0) > 0;

            if (told && !mayWake.has(name)) {
                throw new Error(
                    `${where}: "${name}" was woken ${woken.get(name)} time(s) by a write that could not have ` +
                    'changed what it holds or how it is ordered. A bucket\'s slots here are the caller\'s, and ' +
                    'this step did not set them.',
                );
            }
            if (changed && !told) {
                throw new Error(
                    `${where}: "${name}" went from [${(shown.get(name) ?? []).join(', ')}] to ` +
                    `[${fromEngine.join(', ')}] and its effect was never woken.`,
                );
            }
        }
        shown = next;
    }
};

describe('hand-set slots, against a model that is what the script set', () => {
    for (const seed of [1, 6, 17, 31, 99, 2024]) {
        it(`holds what was set, in the order it was set, and wakes only for that (seed ${seed})`, () => {
            run(seed, 200);
        });
    }
});

describe('a bucket collection whose slots are not the engine\'s', () => {
    const fill = () => {
        const {
            db, effectService, rowsService, rows, membersService, searchService, search, updateEntityByKey,
        } = createFixture();
        rowsService.slotContentService.upsertEntities(rows, [
            { id: 'k1', rank: 3, label: 'a' },
            { id: 'k2', rank: 2, label: 'b' },
            { id: 'k3', rank: 1, label: 'c' },
            { id: 'k4', rank: 9, label: 'd' },
        ]);
        db.flush();
        const bucket = searchService.holdSlotByKey(search, 'q0');
        membersService.writeBucketMemberSlots(bucket, ['k1', 'k2', 'k3'].map((key) => rowsService.getSlotByKey(rows, key)!));
        db.flush();
        const ids = (): string[] => Array.from(membersService.getBucketMemberSlots(bucket)).map((slot) => slot.key as string);
        return { db, effectService, rowsService, rows, membersService, searchService, search, bucket, ids, updateEntityByKey };
    };

    it('a write to a slot it holds moves nothing and wakes nobody', () => {
        const { db, effectService, bucket, ids, updateEntityByKey } = fill();
        let runCount = 0;
        effectService.createEffect(db, [bucket], [], () => { runCount++; });
        updateEntityByKey('k2', { label: 'changed' });
        updateEntityByKey('k3', { rank: 100 });
        db.flush();

        expect(ids()).toEqual(['k1', 'k2', 'k3']);
        expect(runCount).toBe(0);
    });

    it('a write to a slot this bucket does not hold wakes nobody', () => {
        const { db, effectService, bucket, ids, updateEntityByKey } = fill();
        let runCount = 0;
        effectService.createEffect(db, [bucket], [], () => { runCount++; });
        updateEntityByKey('k4', { rank: 0 });
        db.flush();

        expect(ids()).toEqual(['k1', 'k2', 'k3']);
        expect(runCount).toBe(0);
    });

    it('keeps the caller\'s order through writes to the slots it holds', () => {
        const { db, effectService, rowsService, rows, membersService, searchService, search, updateEntityByKey } = fill();
        const plain = searchService.holdSlotByKey(search, 'q1');
        membersService.writeBucketMemberSlots(plain, ['k2', 'k1'].map((key) => rowsService.getSlotByKey(rows, key)!));
        db.flush();
        expect(Array.from(membersService.getBucketMemberSlots(plain)).map((slot) => slot.key)).toEqual(['k2', 'k1']);

        let runCount = 0;
        effectService.createEffect(db, [plain], [], () => { runCount++; });
        updateEntityByKey('k1', { rank: 0 });
        updateEntityByKey('k2', { label: 'x' });
        db.flush();

        expect(Array.from(membersService.getBucketMemberSlots(plain)).map((slot) => slot.key)).toEqual(['k2', 'k1']);
        expect(runCount).toBe(0);
    });

    /**
     * FILLING ONE BUCKET LEAVES THE OTHER ALONE.
     *
     * "Filling one bucket takes the slot out of the other, and tells it so" held
     * while a slot carried one CELL per bucket collection: joining a second
     * bucket of the same collection displaced it, so the bucket it left had to be
     * woken. There is no cell — a slot records only `holdCount` — and `write`
     * speaks for the bucket it was given and nothing else. A slot in two
     * responses is in two buckets, which is what two queries returning the same
     * row means, and the count is two.
     */
    it('filling one bucket leaves the other alone, and a slot may be in both', () => {
        const { db, effectService, rowsService, rows, membersService, searchService, search, bucket, ids } = fill();
        const other = searchService.holdSlotByKey(search, 'q1');
        let wokeHere = 0;
        let wokeThere = 0;
        effectService.createEffect(db, [bucket], [], () => { wokeHere++; });
        effectService.createEffect(db, [other], [], () => { wokeThere++; });

        membersService.writeBucketMemberSlots(other, [rowsService.getSlotByKey(rows, 'k2')!]);
        db.flush();

        expect(ids()).toEqual(['k1', 'k2', 'k3']);
        expect(Array.from(membersService.getBucketMemberSlots(other)).map((slot) => slot.key)).toEqual(['k2']);
        expect(wokeThere).toBe(1);
        expect(wokeHere).toBe(0);
        // A place in two buckets, counted twice: the reference that keeps this
        // identity alive is now held twice, and letting go of one is not letting go.
        expect(rowsService.getSlotByKey(rows, 'k2')!.holdCount).toBe(2);
    });

    it('re-sending the slots it already has, in the order it already shows, wakes nobody', () => {
        const { db, effectService, rowsService, rows, membersService, bucket, ids } = fill();
        let runCount = 0;
        effectService.createEffect(db, [bucket], [], () => { runCount++; });
        membersService.writeBucketMemberSlots(bucket, ids().map((key) => rowsService.getSlotByKey(rows, key)!));
        db.flush();

        expect(runCount).toBe(0);
        expect(ids()).toEqual(['k1', 'k2', 'k3']);
    });
});
