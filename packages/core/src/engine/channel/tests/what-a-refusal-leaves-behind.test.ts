import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import type { TOIMComputedSlot } from '../../computed/types/TOIMComputedSlot';
import { OIMSlotStoreServiceMapDriven } from '../../store/OIMSlotStoreServiceMapDriven';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../store/OIMSlotStoreServiceSingleSlotDriven';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMComputedColumnSlot } from '../../column/types/TOIMComputedColumnSlot';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type TRow = { id: string; n: number };

const effectService = OIMEffectService.INSTANCE;

const rowsOf = (db: OIMDB) => {
    const rowsService = createOIMEntityService<TRow>(db, { keyOf: (row) => row.id });
    return { rowsService, rows: rowsService.createStoreSlot(db) };
};

type TRowsService = ReturnType<typeof rowsOf>['rowsService'];
type TRowStore = ReturnType<typeof rowsOf>['rows'];

const updateEntityByKey = (rowsService: TRowsService, rows: TRowStore, key: string, patch: Partial<TRow>): void => {
    const slot = rowsService.findSlotByKey(rows, key);
    if (slot !== undefined) rowsService.slotContentService.updateEntity(slot, patch);
};

/** How many dependents an identity has — one list, for both kinds. */
const dependentCount = (slot: TOIMSlot): number => slot.effects?.length ?? 0;

describe('a throw out of onBeforeFlush', () => {
    /**
     * The handler is the caller's code, and it is the only user callback the
     * frame runs whose failure could stop the channel rather than one handler.
     * What proves containment is not that `flush()` returned — it is that the
     * frame AFTER it was asked for at all.
     */
    it('leaves a scheduler-driven channel still able to ask for the next frame', () => {
        const armed: (() => void)[] = [];
        const errors: unknown[] = [];
        let handlerThrows = false;
        const db = new OIMDB({
            channelScheduler: flush => { armed.push(flush); },
            errorPolicy: { onErrorCaught: error => { errors.push(error); } },
            onBeforeFlush: () => { if (handlerThrows) throw new Error('before-flush blew up'); },
        });
        const { rowsService, rows } = rowsOf(db);
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 0 });
        db.flush();
        let runCount = 0;
        effectService.createEffect(db, [rowsService.getSlotByKey(rows, 'r1')!], [], () => { runCount++; });

        // From here every frame's onBeforeFlush fails.
        handlerThrows = true;
        armed.length = 0;
        updateEntityByKey(rowsService, rows, 'r1', { n: 1 });
        // The write asked for a frame, and the scheduler is holding it.
        expect(armed.length).toBe(1);
        (armed.shift() as () => void)();

        // The frame the throwing handler was standing in ran to the end: the
        // effect was told, and the failure was reported rather than raised.
        expect(runCount).toBe(1);
        expect(errors.map(error => (error as Error).message)).toEqual(['before-flush blew up']);

        // THE ASSERTION THAT MATTERS. Uncontained, the throw above skipped the
        // line that clears `flushRequested`, and this write would arm nothing —
        // `armed` empty, `runCount` stuck at 1, and a channel that has gone silent
        // without a word. A second failing frame, not a recovered one: the
        // handler is still throwing.
        updateEntityByKey(rowsService, rows, 'r1', { n: 2 });
        expect(armed.length).toBe(1);
        (armed.shift() as () => void)();
        expect(runCount).toBe(2);
        expect(errors).toHaveLength(2);
    });

    /**
     * And a write the handler tries is refused like any other write during a
     * flush — the phase does not get an exception to the rule just because it
     * runs before the frame opens.
     */
    it('refuses the write it tries, and reports the refusal like any other throw', () => {
        const errors: unknown[] = [];
        const reference: { rowsService?: TRowsService; rows?: TRowStore } = {};
        const db = new OIMDB({
            errorPolicy: { onErrorCaught: error => { errors.push(error); } },
            onBeforeFlush: () => {
                updateEntityByKey(reference.rowsService as TRowsService, reference.rows as TRowStore, 'r1', { n: 9 });
            },
        });
        const { rowsService, rows } = rowsOf(db);
        reference.rowsService = rowsService;
        reference.rows = rows;
        const slot = rowsService.holdSlotByKey(rows, 'r1');
        let seen: number | undefined;
        effectService.createEffect(db, [slot], [], () => { seen = slot.entity?.n; });
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 0 });

        db.flush();

        expect(seen).toBe(0);
        expect(errors).toHaveLength(1);
        expect((errors[0] as Error).message).toMatch(/refused/i);
    });
});

// `TOIMChannelScheduler` is the caller's function and nothing in the engine contains
// it; a write that owes a frame is where the engine reaches it.
describe('a throw out of the scheduler', () => {
    const createFixture =() => {
        const armed: (() => void)[] = [];
        const failing = { now: false };
        const db = new OIMDB({
            channelScheduler: flush => {
                if (failing.now) throw new Error('scheduler blew up');
                armed.push(flush);
            },
        });
        const { rowsService, rows } = rowsOf(db);
        rowsService.slotContentService.upsertEntities(rows, [{ id: 'r1', n: 0 }, { id: 'r2', n: 0 }]);
        // Nothing is listening, so the fill asked for no frame at all: every arm
        // in these tests is one a write of the test's own made.
        db.flush();
        return { db, rowsService, rows, armed, failing };
    };

    // The same assertion the `onBeforeFlush` case above makes, for the same flag,
    // reached through the other callback.
    it('leaves a channel that still asks for the next frame', () => {
        const { db, rowsService, rows, armed, failing } = createFixture();
        let wokeFirst = 0;
        effectService.createEffect(db, [rowsService.getSlotByKey(rows, 'r1')!], [], () => { wokeFirst++; });
        let wokeSecond = 0;
        effectService.createEffect(db, [rowsService.getSlotByKey(rows, 'r2')!], [], () => { wokeSecond++; });

        failing.now = true;
        expect(() => updateEntityByKey(rowsService, rows, 'r1', { n: 1 })).toThrow('scheduler blew up');
        expect(armed).toHaveLength(0);

        // The caller caught it and put a working scheduler back — the one thing
        // they can do about their own failing callback.
        failing.now = false;
        updateEntityByKey(rowsService, rows, 'r2', { n: 1 });

        expect(armed).toHaveLength(1);
        (armed.shift() as () => void)();
        expect(wokeSecond).toBe(1);
        expect(wokeFirst).toBe(1);
    });
});

// An effect wires its edges in one `try`, and what fails inside it is a source the
// engine let go of: `subscribe` and `hold` refuse a released identity.
describe('an effect a released source refuses part-way', () => {
    const createFixture =() => {
        const db = new OIMDB();
        const { rowsService, rows } = rowsOf(db);
        rowsService.slotContentService.upsertEntities(rows, [{ id: 'r1', n: 0 }, { id: 'r2', n: 0 }]);
        db.flush();
        return { db, rowsService, rows };
    };

    it('leaves no edge on the slot it had already taken', () => {
        const { db, rowsService, rows } = createFixture();
        const slot = rowsService.getSlotByKey(rows, 'r1')!;
        const gone = rowsService.holdSlotByKey(rows, 'ghost');
        gone.owner.unholdSlot(gone);
        expect(oimIsSlotReleased(gone)).toBe(true);

        let runCount = 0;
        expect(() => effectService.createEffect(db, [slot, gone], [], () => { runCount++; }))
            .toThrow(/This identity was released/);

        expect(dependentCount(slot)).toBe(0);

        // A dependent is a reference, so the count is not the whole proof: the
        // effect nothing can detach is run in every frame from the next one on.
        updateEntityByKey(rowsService, rows, 'r1', { n: 2 });
        db.flush();
        expect(runCount).toBe(0);
    });

    // An effect reading a computed is filed twice: on every ROOT that computed
    // transitively reads, and on the computed's own `effects`.
    it('leaves no edge on a derivation it had already taken', () => {
        const { db, rowsService, rows } = createFixture();
        const slot = rowsService.getSlotByKey(rows, 'r1')!;
        const doubledService = createOIMComputedService<void, number>({
            computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
            sameValueGuard: oimSameValueZeroGuard,
            columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedColumnSlot, string>(),
        });
        const doubled = doubledService.createComputedStoreSlot(
            db,
            () => (slot.entity?.n ?? 0) * 2,
            () => ({ sourceSlots: [slot] }),
        );
        const doubledSlot = doubledService.computedCollectionService.holdSlotByKey(doubled, undefined);
        const derivationsService = createOIMComputedService<TOIMStoreKey, number>({
            computedSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedSlot<number, TOIMStoreKey>>(),
            columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedColumnSlot, string>(),
            createSources: () => ({}),
            derive: () => 0,
            sameValueGuard: oimSameValueZeroGuard,
        });
        const derivations = derivationsService.createComputedStoreSlot(db);
        const gone = derivationsService.computedCollectionService.holdSlotByKey(derivations, 'gone');
        gone.owner.unholdSlot(gone);
        expect(oimIsSlotReleased(gone)).toBe(true);

        let ran = 0;
        expect(() => effectService.createEffect(db, [], [doubledSlot, gone], () => { ran++; }))
            .toThrow(/This identity was released/);

        // THE ASSERTIONS THAT FLIP: neither list holds the node, and both were 1 —
        // the root it is woken from, and the `effects` the derivation reads.
        expect(dependentCount(doubledSlot)).toBe(0);
        expect(dependentCount(slot)).toBe(0);

        updateEntityByKey(rowsService, rows, 'r1', { n: 2 });
        db.flush();
        expect(ran).toBe(0);
    });
});
