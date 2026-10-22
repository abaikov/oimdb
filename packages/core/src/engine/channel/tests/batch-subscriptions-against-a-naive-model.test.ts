import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { TOIMEffect, TOIMEntitySlot } from '../../../index';
import { OIMEffectService } from '../../../index';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';

type TRow = { id: string; n: number; label: string };
type TRowSlot = TOIMEntitySlot<TRow, TOIMStoreKey>;

const KEYS = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7'];

const makeRandom = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
};

/** What the body records, held apart so the effect can be built before the entry. */
type TRuns = {
    runCount: number;
    /** Whether the frame was still open at each call — the phase, observed. */
    seenInsideFrame: boolean[];
};

type TBatchEffect = {
    label: string;
    keys: string[];
    runs: TRuns;
    effect: TOIMEffect;
    live: boolean;
    disposedInBatch: number;
    seenAt: number;
};

const makeCollection = (db: OIMDB) => createOIMEntityService<TRow>(db, { keyOf: (row) => row.id });

type TRowsService = ReturnType<typeof makeCollection>;

const updateEntityByKey = (
    rowsService: TRowsService, rows: ReturnType<TRowsService['createStoreSlot']>, key: string, patch: Partial<TRow>,
): void => {
    const slot = rowsService.findSlotByKey(rows, key);
    if (slot !== undefined) rowsService.slotContentService.updateEntity(slot, patch);
};

const deleteEntityByKey = (
    rowsService: TRowsService, rows: ReturnType<TRowsService['createStoreSlot']>, key: string,
): void => {
    const slot = rowsService.findSlotByKey(rows, key);
    if (slot !== undefined) rowsService.slotContentService.deleteEntity(slot);
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
        const row: TRow = { id: key, n: 0, label: 'l0' };
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

    const batches: TBatchEffect[] = [];
    let labelCounter = 0;
    let writtenAt = 0;
    const movedAt = new Map<string, number>();

    const writeTo = (key: string): void => {
        const before = model.get(key);
        const choice = random();
        let after: TRow | undefined;
        if (before === undefined || choice < 0.25) {
            after = { id: key, n: Math.floor(random() * 4), label: `l${Math.floor(random() * 3)}` };
            rowsService.slotContentService.upsertEntity(rows, { ...after });
        } else if (choice < 0.4) {
            // Written back exactly as it stands: nothing moved, so no run is owed.
            rowsService.slotContentService.upsertEntity(rows, { ...before });
            after = before;
        } else if (choice < 0.7) {
            const n = Math.floor(random() * 4);
            updateEntityByKey(rowsService, rows, key, { n });
            after = { ...before, n };
        } else if (choice < 0.9) {
            const label = `l${Math.floor(random() * 3)}`;
            updateEntityByKey(rowsService, rows, key, { label });
            after = { ...before, label };
        } else {
            deleteEntityByKey(rowsService, rows, key);
            after = undefined;
        }
        const moved =
            before === undefined || after === undefined
                ? before !== after
                : before.n !== after.n || before.label !== after.label || before.id !== after.id;
        model.set(key, after);
        writtenAt++;
        if (moved) movedAt.set(key, writtenAt);
    };

    const attach = (): void => {
        const size = 2 + Math.floor(random() * 3);
        const keys: string[] = [];
        while (keys.length < size) {
            const key = pick(KEYS);
            if (!keys.includes(key)) keys.push(key);
        }
        const runs: TRuns = { runCount: 0, seenInsideFrame: [] };
        const effect = effectService.createEffect(
            db,
            keys.map((key) => slots.get(key)!),
            [],
            () => {
                runs.runCount++;
                runs.seenInsideFrame.push(db.defaultChannelSlot.frame.isRunning);
            },
        );
        batches.push({
            label: `b${labelCounter++}(${keys.join(',')})`,
            keys, runs, effect, live: true, disposedInBatch: -1, seenAt: writtenAt,
        });
    };

    const dispose = (batch: number): void => {
        const live = batches.filter((one) => one.live);
        if (live.length === 0) return;
        const one = pick(live);
        effectService.disposeEffect(one.effect);
        one.live = false;
        one.disposedInBatch = batch;
    };

    /** Write to every slot of one live effect, so "several of them move" is reached, not hoped for. */
    const writeWholeBatch = (): void => {
        const live = batches.filter((one) => one.live);
        if (live.length === 0) { writeTo(pick(KEYS)); return; }
        const one = pick(live);
        for (const key of one.keys) {
            const before = model.get(key);
            const after: TRow = { id: key, n: (before?.n ?? 0) + 1, label: `l${Math.floor(random() * 3)}` };
            rowsService.slotContentService.upsertEntity(rows, { ...after });
            model.set(key, after);
            writtenAt++;
            movedAt.set(key, writtenAt);
        }
    };

    for (let batch = 0; batch < steps; batch++) {
        for (const one of batches) {
            one.runs.runCount = 0;
            one.runs.seenInsideFrame = [];
        }

        const actions = 1 + Math.floor(random() * 5);
        for (let i = 0; i < actions; i++) {
            const choice = random();
            if (choice < 0.45) writeTo(pick(KEYS));
            else if (choice < 0.62) writeWholeBatch();
            else if (choice < 0.85) attach();
            else dispose(batch);
        }

        db.flush();

        const where =`seed ${seed}, batch ${batch}`;
        for (const one of batches) {
            if (!one.live) {
                if (one.disposedInBatch === batch && one.runs.runCount > 0) {
                    throw new Error(
                        `${where}: ${one.label} was detached before the flush and ran ` +
                        `${one.runs.runCount} time(s) anyway. One detach has to leave every slot it joined.`,
                    );
                }
                continue;
            }
            const owed = one.keys.some((key) => (movedAt.get(key) ?? -1) > one.seenAt);
            const expected = owed ? 1 : 0;
            if (one.runs.runCount !== expected) {
                const written = one.keys.map((key) => `${key}@${movedAt.get(key) ?? -1}`).join(', ');
                throw new Error(
                    `${where}: ${one.label} ran ${one.runs.runCount} time(s), expected ${expected}. Its ` +
                    `slots were last moved by write [${written}], it last ran after write ` +
                    `${one.seenAt}, and ${writtenAt} writes have landed. One effect over many slots ` +
                    'runs once a frame, for the writes that landed strictly after it and no others.',
                );
            }
            if (!owed) continue;
            if (one.runs.seenInsideFrame[0] !== true) {
                throw new Error(
                    `${where}: ${one.label} ran with the frame already closed. An effect is a leaf of ` +
                    'the frame and runs inside it.',
                );
            }
            one.seenAt = writtenAt;
        }
    }
};

describe('an effect over many slots against an implementation too simple to be wrong', () => {
    for (const seed of [1, 2, 3, 7, 11, 42, 1337, 90210]) {
        it(`runs once when a slot moved after it was built and never otherwise (seed ${seed})`, () => {
            run(seed, 150);
        });
    }
});

describe('what an effect over many slots owes, said plainly', () => {
    const createFixture =(): {
        db: OIMDB;
        effectService: OIMEffectService;
        slots: TRowSlot[];
        write: (at: number, n: number) => void;
    } => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const rowsService = makeCollection(db);
        const rows = rowsService.createStoreSlot(db);
        const keys = ['a', 'b', 'c'];
        for (const id of keys) rowsService.slotContentService.upsertEntity(rows, { id, n: 0, label: 'l' });
        db.flush();
        const slots = keys.map((id) => rowsService.getSlotByKey(rows, id)!);
        return { db, effectService, slots, write: (at, n) => { updateEntityByKey(rowsService, rows, keys[at], { n }); } };
    };

    it('one run for a frame in which every slot moved', () => {
        const { db, effectService, slots, write } = createFixture();
        let runCount = 0;
        effectService.createEffect(db, slots, [], () => { runCount++; });
        write(0, 1); write(1, 1); write(2, 1);
        db.flush();
        expect(runCount).toBe(1);
    });

    it('no run at all for a frame in which none moved, even one that flushes', () => {
        const { db, effectService, slots } = createFixture();
        let runCount = 0;
        effectService.createEffect(db, slots, [], () => { runCount++; });
        db.flush();
        db.flush();
        expect(runCount).toBe(0);
    });

    it('a write that moves nothing is not a move', () => {
        const { db, effectService, slots, write } = createFixture();
        let runCount = 0;
        effectService.createEffect(db, slots, [], () => { runCount++; });
        write(0, 0); // already 0
        db.flush();
        expect(runCount).toBe(0);
    });

    it('a new frame is a new run', () => {
        const { db, effectService, slots, write } = createFixture();
        let runCount = 0;
        effectService.createEffect(db, slots, [], () => { runCount++; });
        write(0, 1);
        db.flush();
        write(1, 1);
        db.flush();
        expect(runCount).toBe(2);
    });

    it('an effect built mid-batch, behind a write to one of its slots, is NOT told about it', () => {
        const { db, effectService, slots, write } = createFixture();
        let runCount = 0;
        write(0, 1);
        effectService.createEffect(db, slots, [], () => { runCount++; });
        db.flush();
        expect(runCount).toBe(0);

        // Silence is about the frame it was born in and nothing further: the
        // next write to the same slot is one it was there for.
        write(0, 2);
        db.flush();
        expect(runCount).toBe(1);
    });
});
