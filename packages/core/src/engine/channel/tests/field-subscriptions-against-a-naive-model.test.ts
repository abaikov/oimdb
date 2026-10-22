
import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { TOIMColumnSlot, TOIMEntitySlot } from '../../../index';
import { OIMEffectService } from '../../../index';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';

type TField = 'a' | 'b' | 'c' | 'd';
const FIELDS: readonly TField[] = ['a', 'b', 'c', 'd'];
type TRow = { id: string } & Partial<Record<TField, number>>;
type TRowSlot = TOIMEntitySlot<TRow, TOIMStoreKey>;

const KEYS = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5'];

/** Deterministic, so a failing run is a failing run again. */
const makeRandom = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
};

const makeCollection = (db: OIMDB) => createOIMEntityService<TRow>(db, { keyOf: (row) => row.id });

type TRowsService = ReturnType<typeof makeCollection>;
type TRowsStoreSlot = ReturnType<TRowsService['createStoreSlot']>;

const updateEntityByKey = (rowsService: TRowsService, rows: TRowsStoreSlot, key: string, patch: Partial<TRow>): void => {
    const slot = rowsService.findSlotByKey(rows, key);
    if (slot !== undefined) rowsService.slotContentService.updateEntity(slot, patch);
};

const deleteEntityByKey = (rowsService: TRowsService, rows: TRowsStoreSlot, key: string): void => {
    const slot = rowsService.findSlotByKey(rows, key);
    if (slot !== undefined) rowsService.slotContentService.deleteEntity(slot);
};

const columnsOf = (
    rowsService: TRowsService, slot: TRowSlot, names: readonly TField[],
): TOIMColumnSlot[] => names.map((name) => rowsService.getColumn(slot, name));

// A slot arriving where there was none moved every column it carries; a value
// leaving moved every column it had.
const movedBetween = (before: TRow | undefined, after: TRow | undefined): string[] => {
    if (before === undefined && after === undefined) return [];
    if (before === undefined) return Object.keys(after as TRow);
    if (after === undefined) return Object.keys(before);
    const had = before as unknown as Record<string, unknown>;
    const has = after as unknown as Record<string, unknown>;
    const names: string[] = [];
    for (const name of Object.keys(has)) if (had[name] !== has[name]) names.push(name);
    for (const name of Object.keys(had)) if (!(name in has)) names.push(name);
    return names;
};

type THook = {
    label: string;
    key: string;
    names: TField[];
    runCount: number;
    dispose: () => void;
    seenAt: number;
    live: boolean;
    disposedInBatch: number;
};

const run = (seed: number, steps: number): void => {
    const random = makeRandom(seed);
    const pick = <T>(from: readonly T[]): T => from[Math.floor(random() * from.length)];

    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rowsService = makeCollection(db);
    const rows = rowsService.createStoreSlot(db);

    const model = new Map<string, TRow | undefined>();
    const slots = new Map<string, TRowSlot>();
    for (const key of KEYS) {
        const row: TRow = { id: key, a: 0, b: 0, c: 0, d: 0 };
        rowsService.slotContentService.upsertEntity(rows, { ...row });
        model.set(key, row);
    }
    db.flush();
    for (const key of KEYS) {
        const slot = rowsService.getSlotByKey(rows, key)!;
        // Never detached: it holds the identity across a removal.
        effectService.createEffect(db, [slot], [], () => undefined);
        slots.set(key, slot);
    }

    const hooks: THook[] = [];
    let labelCounter = 0;

    let writtenAt = 0;
    const movedAt = new Map<string, number>();
    const at = (key: string, name: string): string => `${key}\0${name}`;

    const applyWrite = (key: string, before: TRow | undefined, after: TRow | undefined): void => {
        model.set(key, after);
        writtenAt++;
        for (const name of movedBetween(before, after)) movedAt.set(at(key, name), writtenAt);
    };

    const write = (): void => {
        const key = pick(KEYS);
        const before = model.get(key);
        const choice = random();
        let after: TRow | undefined;
        if (before === undefined || choice < 0.3) {
            after = { id: key };
            for (const name of FIELDS) after[name] = Math.floor(random() * 3);
            rowsService.slotContentService.upsertEntity(rows, { ...after });
        } else if (choice < 0.42) {
            // A whole value with one column simply absent — the write a patch
            // cannot express, and the one that has to count as a move.
            const dropped = pick(FIELDS);
            after = { id: key };
            for (const name of FIELDS) if (name !== dropped) after[name] = Math.floor(random() * 3);
            rowsService.slotContentService.upsertEntity(rows, { ...after });
        } else if (choice < 0.55) {
            // The value written back exactly as it stands. Nothing moved, so
            // nobody may be told anything.
            rowsService.slotContentService.upsertEntity(rows, { ...before });
            after = before;
        } else if (choice < 0.85) {
            const patch: Partial<TRow> = {};
            const count = 1 + Math.floor(random() * 2);
            for (let i = 0; i < count; i++) patch[pick(FIELDS)] = Math.floor(random() * 3);
            updateEntityByKey(rowsService, rows, key, patch);
            after = { ...before, ...patch };
        } else {
            deleteEntityByKey(rowsService, rows, key);
            after = undefined;
        }
        applyWrite(key, before, after);
    };

    const mount = (forcedKey?: string, forcedNames?: TField[]): void => {
        const key = forcedKey ?? pick(KEYS);
        const slot = slots.get(key) as TRowSlot;
        let names: TField[];
        if (forcedNames !== undefined) names = forcedNames;
        else {
            names = [pick(FIELDS)];
            const second = pick(FIELDS);
            if (random() < 0.4 && second !== names[0]) names.push(second);
        }
        const hook: THook = {
            label: `h${labelCounter++}(${key}:${names.join('+')})`,
            key, names, runCount: 0,
            dispose: () => undefined,
            seenAt: writtenAt,
            live: true, disposedInBatch: -1,
        };
        const tell = (): void => { hook.runCount++; };
        const effect = names.length === 1
            ? effectService.createEffect(db, [rowsService.getColumn(slot, names[0])], [], tell)
            : effectService.createEffect(db, columnsOf(rowsService, slot, names), [], tell);
        hook.dispose = () => { effectService.disposeEffect(effect); };
        hooks.push(hook);
    };

    const unmount = (batch: number): void => {
        const live = hooks.filter((hook) => hook.live);
        if (live.length === 0) return;
        const hook = pick(live);
        hook.dispose();
        hook.live = false;
        hook.disposedInBatch = batch;
    };

    // A slot already on screen is written, then two effects are built behind
    // that write: it landed before either of them existed.
    const writeThenMountTwoBehindIt = (): void => {
        const key = KEYS[0];
        const before = model.get(key) as TRow;
        const a = (before.a ?? 0) + 1;
        const b = (before.b ?? 0) + 1;
        updateEntityByKey(rowsService, rows, key, { a, b });
        applyWrite(key, before, { ...before, a, b });
        mount(key, ['a']);
        mount(key, ['b']);
    };

    for (let batch = 0; batch < steps; batch++) {
        for (const hook of hooks) hook.runCount = 0;

        if (batch === 0) writeThenMountTwoBehindIt();
        else {
            const actions = 2 + Math.floor(random() * 5);
            for (let i = 0; i < actions; i++) {
                const choice = random();
                if (choice < 0.6) write();
                else if (choice < 0.85) mount();
                else unmount(batch);
            }
        }

        db.flush();

        const where = `seed ${seed}, batch ${batch}`;
        for (const hook of hooks) {
            if (!hook.live) {
                if (hook.disposedInBatch === batch && hook.runCount > 0) {
                    throw new Error(
                        `${where}: ${hook.label} was detached before the flush and ran anyway ` +
                        `(${hook.runCount} time(s)). Detaching has to mean detaching.`,
                    );
                }
                continue;
            }

            const owed = hook.names.some(
                (name) => (movedAt.get(at(hook.key, name)) ?? -1) > hook.seenAt,
            );
            const expected = owed ? 1 : 0;
            if (hook.runCount !== expected) {
                const written = hook.names
                    .map((name) => `${name}@${movedAt.get(at(hook.key, name)) ?? -1}`)
                    .join(', ');
                throw new Error(
                    `${where}: ${hook.label} ran ${hook.runCount} time(s), expected ${expected}. Its ` +
                    `columns were last moved by write [${written}], it last ran after write ` +
                    `${hook.seenAt}, and ${writtenAt} writes have landed. An effect hears the ` +
                    'writes that land strictly after it and no others, once a frame however many ' +
                    'of them there were.',
                );
            }
            if (owed) hook.seenAt = writtenAt;
        }
    }
};

describe('per-column effects against an implementation too simple to be wrong', () => {
    const SEEDS = [1, 2, 3, 7, 11, 42, 1337, 90210];

    for (const seed of SEEDS) {
        it(`runs exactly the effects whose columns moved after they were built (seed ${seed})`, () => {
            run(seed, 150);
        });
    }
});

describe('the two column effects built together', () => {
    const createFixture =(): {
        db: OIMDB;
        effectService: OIMEffectService;
        rowsService: TRowsService;
        rows: TRowsStoreSlot;
        slot: TRowSlot;
    } => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const rowsService = makeCollection(db);
        const rows = rowsService.createStoreSlot(db);
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', a: 0, b: 0, c: 0, d: 0 });
        db.flush();
        const slot = rowsService.getSlotByKey(rows, 'r1')!;
        // Something already reads the whole slot: the ordinary state of a slot
        // that is on screen, and what holds the identity across a removal.
        effectService.createEffect(db, [slot], [], () => undefined);
        return { db, effectService, rowsService, rows, slot };
    };

    it('built BEFORE the write, both run — this is the working order', () => {
        const { db, effectService, rowsService, rows, slot } = createFixture();
        let aWoke = 0;
        let bWoke = 0;
        effectService.createEffect(db, [rowsService.getColumn(slot, 'a')], [], () => { aWoke++; });
        effectService.createEffect(db, [rowsService.getColumn(slot, 'b')], [], () => { bWoke++; });
        updateEntityByKey(rowsService, rows, 'r1', { a: 1, b: 1 });
        db.flush();
        expect([aWoke, bWoke]).toEqual([1, 1]);
    });

    it('built AFTER the write in the same batch, NEITHER of them runs', () => {
        const { db, effectService, rowsService, rows, slot } = createFixture();
        let aWoke = 0;
        let bWoke = 0;
        // The timing of two column subscriptions in one component arriving in
        // response to the render the write caused.
        updateEntityByKey(rowsService, rows, 'r1', { a: 1, b: 1 });
        effectService.createEffect(db, [rowsService.getColumn(slot, 'a')], [], () => { aWoke++; });
        effectService.createEffect(db, [rowsService.getColumn(slot, 'b')], [], () => { bWoke++; });
        db.flush();

        expect([aWoke, bWoke]).toEqual([0, 0]);

        updateEntityByKey(rowsService, rows, 'r1', { b: 2 });
        db.flush();
        expect([aWoke, bWoke]).toEqual([0, 1]);
    });

    it('two effects on a column nobody watched, built behind the write that changed it, stay silent', () => {
        const { db, effectService, rowsService, rows, slot } = createFixture();
        let firstWoke = 0;
        let secondWoke = 0;
        // Nothing watches `d`, so this write reaches no column identity at all:
        // `markColumnsChanged` is handed the name and finds nothing filed under it.
        updateEntityByKey(rowsService, rows, 'r1', { d: 1 });
        effectService.createEffect(db, [rowsService.getColumn(slot, 'd')], [], () => { firstWoke++; });
        effectService.createEffect(db, [rowsService.getColumn(slot, 'd')], [], () => { secondWoke++; });
        db.flush();
        expect([firstWoke, secondWoke]).toEqual([0, 0]);

        // And what they hold is ONE identity: the next write to `d` marks it
        // once and runs each of them once.
        updateEntityByKey(rowsService, rows, 'r1', { d: 2 });
        db.flush();
        expect([firstWoke, secondWoke]).toEqual([1, 1]);
    });

    it('an effect over two columns built behind the write stays silent, then runs once when both move', () => {
        const { db, effectService, rowsService, rows, slot } = createFixture();
        let aWoke = 0;
        let cdWoke = 0;
        updateEntityByKey(rowsService, rows, 'r1', { a: 1, c: 1 });
        effectService.createEffect(db, [rowsService.getColumn(slot, 'a')], [], () => { aWoke++; });
        effectService.createEffect(db, columnsOf(rowsService, slot, ['c', 'd']), [], () => { cdWoke++; });
        db.flush();
        expect([aWoke, cdWoke]).toEqual([0, 0]);

        updateEntityByKey(rowsService, rows, 'r1', { c: 2, d: 2 });
        db.flush();
        // An effect over several columns is coalesced exactly as the
        // single-column one is — one run, however many of its columns moved.
        expect([aWoke, cdWoke]).toEqual([0, 1]);
    });

    it('the effect already there hears its column; the one built behind the write hears nothing', () => {
        const { db, effectService, rowsService, rows, slot } = createFixture();
        let aWoke = 0;
        let bWoke = 0;
        effectService.createEffect(db, [rowsService.getColumn(slot, 'a')], [], () => { aWoke++; });
        db.flush();
        updateEntityByKey(rowsService, rows, 'r1', { a: 1, b: 1 });
        effectService.createEffect(db, [rowsService.getColumn(slot, 'b')], [], () => { bWoke++; });
        db.flush();
        expect([aWoke, bWoke]).toEqual([1, 0]);
    });

    it('an effect on a column that already exists is not woken by a write to another column', () => {
        const { db, effectService, rowsService, rows, slot } = createFixture();
        let aWoke = 0;
        effectService.createEffect(db, [rowsService.getColumn(slot, 'a')], [], () => { aWoke++; });
        db.flush();
        updateEntityByKey(rowsService, rows, 'r1', { b: 1 });
        db.flush();
        expect(aWoke).toBe(0);
    });
});
