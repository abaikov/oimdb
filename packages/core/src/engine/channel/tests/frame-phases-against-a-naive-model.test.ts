import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMChannelService } from '../OIMChannelService';
import type { TOIMEntitySlot, TOIMDisposer } from '../../../index';
import { OIMEffectService } from '../../../index';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';

type TRow = { id: string; n: number; label: string };
type TRowSlot = TOIMEntitySlot<TRow, TOIMStoreKey>;

const KEYS = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5'];

type TPhase = 'beforeFlush' | 'drain' | 'afterEachFrame';

/** The order the frame promises, as a number so "did it hold" is one comparison. */
const RANK: Record<TPhase, number> = { beforeFlush: 0, drain: 1, afterEachFrame: 2 };

/** And whether the frame is open in it — the fact that decides who may write. */
const FRAME_OPEN_IN: Record<TPhase, boolean> = {
    beforeFlush: false, drain: true, afterEachFrame: false,
};

const channelService = OIMChannelService.INSTANCE;

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

type TEvent = { phase: TPhase; who: string; frameOpen: boolean };

type TWatcher = {
    label: string;
    phase: TPhase;
    /** The slot it reads, or undefined for an after-each-frame handler, which watches the frame. */
    key: string | undefined;
    calls: number;
    off: TOIMDisposer;
    live: boolean;
    disposedInBatch: number;
    seenAt: number;
};

const run = (seed: number, steps: number): void => {
    const random = makeRandom(seed);
    const pick = <T>(from: readonly T[]): T => from[Math.floor(random() * from.length)];

    let log: TEvent[] = [];
    const db = new OIMDB({
        onBeforeFlush: () => {
            log.push({ phase: 'beforeFlush', who: 'onBeforeFlush', frameOpen: db.defaultChannelSlot.frame.isRunning });
        },
    });
    const effectService = OIMEffectService.INSTANCE;
    let framesEnded = 0;
    channelService.subscribeAfterEachFlush(db.defaultChannelSlot, () => { framesEnded++; });
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

    const watchers: TWatcher[] = [];
    let labelCounter = 0;
    let writtenAt = 0;
    const movedAt = new Map<string, number>();

    const write = (): void => {
        const key = pick(KEYS);
        const before = model.get(key);
        const choice = random();
        let after: TRow | undefined;
        if (before === undefined || choice < 0.3) {
            after = { id: key, n: Math.floor(random() * 4), label: `l${Math.floor(random() * 3)}` };
            rowsService.slotContentService.upsertEntity(rows, { ...after });
        } else if (choice < 0.45) {
            rowsService.slotContentService.upsertEntity(rows, { ...before });
            after = before;
        } else if (choice < 0.75) {
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
                : before.n !== after.n || before.label !== after.label;
        model.set(key, after);
        writtenAt++;
        if (moved) movedAt.set(key, writtenAt);
    };

    const mount = (): void => {
        const phase: TPhase = random() < 0.6 ? 'drain' : 'afterEachFrame';
        const key = phase === 'afterEachFrame' ? undefined : pick(KEYS);
        const watcher: TWatcher = {
            label: `w${labelCounter++}(${phase}${key === undefined ? '' : `:${key}`})`,
            phase, key, calls: 0,
            off: () => undefined,
            live: true, disposedInBatch: -1, seenAt: writtenAt,
        };
        const tell = (): void => {
            watcher.calls++;
            log.push({ phase, who: watcher.label, frameOpen: db.defaultChannelSlot.frame.isRunning });
        };
        if (phase === 'afterEachFrame') watcher.off = channelService.subscribeAfterEachFrame(db.defaultChannelSlot, tell);
        else {
            const effect = effectService.createEffect(db, [slots.get(key as string)!], [], tell);
            watcher.off = () => { effectService.disposeEffect(effect); };
        }
        watchers.push(watcher);
    };

    const unmount = (batch: number): void => {
        const live = watchers.filter((watcher) => watcher.live);
        if (live.length === 0) return;
        const watcher = pick(live);
        watcher.off();
        watcher.live = false;
        watcher.disposedInBatch = batch;
    };

    for (let batch = 0; batch < steps; batch++) {
        for (const watcher of watchers) watcher.calls = 0;
        log = [];

        const actions = Math.floor(random() * 6);
        for (let i = 0; i < actions; i++) {
            const choice = random();
            if (choice < 0.5) write();
            else if (choice < 0.82) mount();
            else unmount(batch);
        }

        const framesEndedBefore = framesEnded;
        db.flush();
        const where = `seed ${seed}, batch ${batch}`;

        if (framesEnded !== framesEndedBefore + 1) {
            throw new Error(
                `${where}: one flush ended ${framesEnded - framesEndedBefore} frames. A flush is one frame.`,
            );
        }

        for (let i = 1; i < log.length; i++) {
            if (RANK[log[i].phase] < RANK[log[i - 1].phase]) {
                throw new Error(
                    `${where}: ${log[i].who} ran in the ${log[i].phase} phase after ${log[i - 1].who} had ` +
                    `already run in the ${log[i - 1].phase} phase. The frame's order is ` +
                    'onBeforeFlush, the drain, afterEachFrame.',
                );
            }
        }
        for (const event of log) {
            if (event.frameOpen !== FRAME_OPEN_IN[event.phase]) {
                throw new Error(
                    `${where}: ${event.who} ran in the ${event.phase} phase with the frame ` +
                    `${event.frameOpen ? 'open' : 'closed'}. It is the only thing that decides whether ` +
                    'that handler may write, and it is the opposite of what this phase promises.',
                );
            }
        }
        const beforeFlushRuns = log.filter((event) => event.phase === 'beforeFlush').length;
        if (beforeFlushRuns !== 1) {
            throw new Error(`${where}: onBeforeFlush ran ${beforeFlushRuns} time(s) for one flush.`);
        }

        for (const watcher of watchers) {
            if (!watcher.live) {
                if (watcher.disposedInBatch === batch && watcher.calls > 0) {
                    throw new Error(
                        `${where}: ${watcher.label} was detached before the flush and ran ` +
                        `${watcher.calls} time(s) anyway.`,
                    );
                }
                continue;
            }
            const slotMovedAt = watcher.key === undefined
                ? -1
                : movedAt.get(watcher.key) ?? -1;
            // Told after every frame, once, whatever moved in it — including a
            // frame in which nothing did.
            const owed = watcher.phase === 'afterEachFrame' || slotMovedAt > watcher.seenAt;
            const expected = owed ? 1 : 0;
            if (watcher.calls !== expected) {
                const because = watcher.phase === 'afterEachFrame'
                    ? 'An after-each-frame handler runs once per frame, moved or not.'
                    : `Its slot was last moved by write ${slotMovedAt}, it last ran after write ` +
                      `${watcher.seenAt}, and ${writtenAt} writes have landed. An effect hears the ` +
                      'writes that land strictly after it and no others.';
                throw new Error(
                    `${where}: ${watcher.label} ran ${watcher.calls} time(s), expected ${expected}. ${because}`,
                );
            }
            if (owed) watcher.seenAt = writtenAt;
        }
    }
};

describe('the frame\'s phases against an implementation too simple to be wrong', () => {
    for (const seed of [1, 2, 3, 7, 11, 42, 1337, 90210]) {
        it(`runs each phase in order and exactly as often as it owes (seed ${seed})`, () => {
            run(seed, 150);
        });
    }
});

type TFixture = { db: OIMDB; effectService: OIMEffectService; slot: TRowSlot; touch: () => void };

const fixture = (): TFixture => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rowsService = makeCollection(db);
    const rows = rowsService.createStoreSlot(db);
    rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 0, label: 'l' });
    db.flush();
    const slot = rowsService.getSlotByKey(rows, 'r1')!;
    effectService.createEffect(db, [slot], [], () => undefined);
    let n = 0;
    return { db, effectService, slot, touch: () => { n++; updateEntityByKey(rowsService, rows, 'r1', { n }); } };
};

// The fresh binding sits out the frame it was made in and hears about the
// frames that follow; the stale one goes silent the instant it is let go.
describe('the same act, one answer: subscribing and unsubscribing from inside a phase', () => {
    it('the drain: an effect built during the phase does NOT run in that frame', () => {
        const { db, effectService, slot, touch } = fixture();
        let lateRan = 0;
        let first = 0;
        effectService.createEffect(db, [slot], [], () => {
            first++;
            if (first === 1) effectService.createEffect(db, [slot], [], () => { lateRan++; });
        });
        touch();
        db.flush();
        expect(lateRan).toBe(0);
    });

    it('the drain: an effect detached during the phase does NOT run', () => {
        const { db, effectService, slot, touch } = fixture();
        let victimRan = 0;
        let off: TOIMDisposer = () => undefined;
        effectService.createEffect(db, [slot], [], () => { off(); });
        const victim = effectService.createEffect(db, [slot], [], () => { victimRan++; });
        off = () => { effectService.disposeEffect(victim); };
        touch();
        db.flush();
        // `dispose` writes -1 over the frame stamp the write left, and the drain
        // reads it again before it calls.
        expect(victimRan).toBe(0);
    });

    it('afterEachFrame: a handler added during the phase is NOT called in that frame', () => {
        const { db, touch } = fixture();
        let lateRan = 0;
        let first = 0;
        channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => {
            first++;
            if (first === 1) channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => { lateRan++; });
        });
        touch();
        db.flush();
        // The walk settles WHO it owes before it calls the first of them, so an
        // entry added during the walk is not visited by that walk.
        expect(lateRan).toBe(0);
        touch();
        db.flush();
        expect(lateRan).toBe(1);
    });

    it('afterEachFrame: a handler removed during the phase is NOT called — here the two agree', () => {
        const { db, touch } = fixture();
        let victimRan = 0;
        let off: TOIMDisposer = () => undefined;
        channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => { off(); });
        off = channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => { victimRan++; });
        touch();
        db.flush();
        expect(victimRan).toBe(0);
    });

    it('the two phases, side by side, on the identical user action', () => {
        // One test over both phases rather than the same fact spread across two:
        // swap a stale binding for a fresh one, from inside the phase.
        const fromTheDrain = ((): number => {
            const { db, effectService, slot, touch } = fixture();
            let freshRan = 0;
            let offStale: TOIMDisposer = () => undefined;
            effectService.createEffect(db, [slot], [], () => {
                offStale();
                effectService.createEffect(db, [slot], [], () => { freshRan++; });
            });
            const stale = effectService.createEffect(db, [slot], [], () => undefined);
            offStale = () => { effectService.disposeEffect(stale); };
            touch();
            db.flush();
            return freshRan;
        })();

        const fromAfterEachFrame = ((): number => {
            const { db, touch } = fixture();
            let freshRan = 0;
            let offStale: TOIMDisposer = () => undefined;
            let first = 0;
            channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => {
                first++;
                if (first > 1) return;
                offStale();
                channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => { freshRan++; });
            });
            offStale = channelService.subscribeAfterEachFrame(db.defaultChannelSlot, () => undefined);
            touch();
            db.flush();
            return freshRan;
        })();

        // One act, one frame, one channel, and the same answer from both phases.
        expect([fromTheDrain, fromAfterEachFrame]).toEqual([0, 0]);
    });
});
