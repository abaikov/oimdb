import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMChannelService } from '../OIMChannelService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import type { TOIMComputedSlot } from '../../computed/types/TOIMComputedSlot';
import { OIMSlotStoreServiceMapDriven } from '../../store/OIMSlotStoreServiceMapDriven';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../store/OIMSlotStoreServiceSingleSlotDriven';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMComputedColumnSlot } from '../../column/types/TOIMComputedColumnSlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';

type TRow = { id: string; title: string; n: number };
type TRowSlot = TOIMEntitySlot<TRow, TOIMStoreKey>;

const effectService = OIMEffectService.INSTANCE;

const createDoubledService = () => createOIMComputedService<void, number>({
    computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
    sameValueGuard: oimSameValueZeroGuard,
    columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedColumnSlot, string>(),
});

/** A collection over a db this test flushes by hand. */
function collectionOver(db: OIMDB) {
    const rowsService = createOIMEntityService<TRow>(db, { keyOf: (row) => row.id });
    return { rowsService, rows: rowsService.createStoreSlot(db) };
}

type TRowsService = ReturnType<typeof collectionOver>['rowsService'];
type TRowsStoreSlot = ReturnType<typeof collectionOver>['rows'];

function createFixture() {
    const db = new OIMDB();
    const { rowsService, rows } = collectionOver(db);
    return { db, rowsService, rows };
}

const slotOf = (rowsService: TRowsService, rows: TRowsStoreSlot, id: string): TRowSlot => rowsService.getSlotByKey(rows, id)!;

const updateEntityByKey = (rowsService: TRowsService, rows: TRowsStoreSlot, key: string, patch: Partial<TRow>): void => {
    const slot = rowsService.findSlotByKey(rows, key);
    if (slot !== undefined) rowsService.slotContentService.updateEntity(slot, patch);
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

describe('what a frame promises through a real collection', () => {
    it('refuses a write during a frame with a clear error', () => {
        const { db, rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows, 'r1');
        const caught: { error?: unknown } = {};
        effectService.createEffect(db, [slot], [], () => {
            try { updateEntityByKey(rowsService, rows, 'r1', { n: 99 }); } catch (e) { caught.error = e; }
        });
        updateEntityByKey(rowsService, rows, 'r1', { n: 1 });
        db.flush();
        expect(caught.error).toBeInstanceOf(Error);
        // The refusal travels with the write stack now — `assertWritable` on the
        // reporting layer — so a collection built on a bare strategy has no
        // frame it could be inside and nothing to refuse.
        expect(messageOf(caught.error)).toMatch(/refused|frame/i);
    });

    it('one throwing reader of a derivation does not stop the rest of the graph', () => {
        const { db, rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        const slot = slotOf(rowsService, rows, 'r1');
        const titleLengthService = createDoubledService();
        const titleLength = titleLengthService.createComputedStoreSlot(
            db,
            () => (slot.entity?.title ?? '').length,
            () => ({ sourceSlots: [slot] }),
        );
        let goodRuns = 0;
        effectService.createEffect(db, [], [titleLengthService.computedCollectionService.getSlotByKey(titleLength, undefined)], () => { throw new Error('bad reader'); });
        effectService.createEffect(db, [], [titleLengthService.computedCollectionService.getSlotByKey(titleLength, undefined)], () => { goodRuns++; });
        updateEntityByKey(rowsService, rows, 'r1', { title: 'z' });
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            expect(() => { db.flush(); }).not.toThrow();
            expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'bad reader' }));
        } finally {
            consoleError.mockRestore();
        }
        expect(goodRuns).toBe(1);
    });

    it('a derivation settled inside the frame does not arm a second, empty frame', () => {
        // A scheduler that really runs what it is handed, the way a microtask
        // one does: everything armed during a turn is drained before the turn
        // ends, so a frame that arms another is a second frame the caller sees.
        const armed: (() => void)[] = [];
        let beforeFlushRuns = 0;
        const db = new OIMDB({
            channelScheduler: (flush) => { armed.push(flush); },
            onBeforeFlush: () => { beforeFlushRuns++; },
        });
        const { rowsService, rows } = collectionOver(db);
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        armed.length = 0;

        const slot = slotOf(rowsService, rows, 'r1');
        effectService.createEffect(db, [slot], [], () => { /* an ordinary whole-slot reader */ });
        const titleLengthService = createDoubledService();
        const titleLength = titleLengthService.createComputedStoreSlot(
            db,
            () => (slot.entity?.title ?? '').length,
            () => ({ sourceSlots: [slot] }),
        );
        // The derivation has a reader, so the settle the frame's pass takes runs
        // inside the frame -- which is where the second frame came from.
        effectService.createEffect(db, [], [titleLengthService.computedCollectionService.getSlotByKey(titleLength, undefined)], () => { /* reads the derived value */ });
        let framesEnded = 0;
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => { framesEnded++; });
        beforeFlushRuns = 0;

        updateEntityByKey(rowsService, rows, 'r1', { title: 'much longer title' });
        expect(armed.length).toBe(1);
        while (armed.length > 0) (armed.shift() as () => void)();

        // One write, one frame. A second frame delivering nothing is still a
        // frame: onBeforeFlush and every handler, again.
        expect(framesEnded).toBe(1);
        expect(beforeFlushRuns).toBe(1);
    });

    it('asks the scheduler once for a batch, not once per write', () => {
        const armed: (() => void)[] = [];
        const db = new OIMDB({ channelScheduler: (flush) => { armed.push(flush); } });
        const { rowsService, rows } = collectionOver(db);
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 0 });
        db.flush();
        armed.length = 0;
        const slot = slotOf(rowsService, rows, 'r1');
        let calls = 0;
        effectService.createEffect(db, [slot], [], () => { calls++; });

        // Multiple writes in the same batch: the scheduler is asked once, and
        // the coalescing guard on the slot stops the second and third before
        // they reach it.
        updateEntityByKey(rowsService, rows, 'r1', { n: 1 });
        updateEntityByKey(rowsService, rows, 'r1', { n: 2 });
        updateEntityByKey(rowsService, rows, 'r1', { n: 3 });
        expect(armed).toHaveLength(1);
        expect(calls).toBe(0); // not flushed yet -- flushing by hand still works

        armed[0]();
        expect(calls).toBe(1);

        // The next batch asks again: the flag is cleared when the frame it asked
        // for opens.
        updateEntityByKey(rowsService, rows, 'r1', { n: 4 });
        expect(armed).toHaveLength(2);
        db.flush();
        expect(calls).toBe(2);
    });

    it('a write whose only reader is behind a derivation still asks for a frame', () => {
        // An effect that reads a derivation registers against the derivation's
        // transitive ROOTS, so the write below finds it in the slot's own list.
        const armed: (() => void)[] = [];
        const db = new OIMDB({ channelScheduler: (flush) => { armed.push(flush); } });
        const { rowsService, rows } = collectionOver(db);
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', title: 'a', n: 1 });
        db.flush();
        armed.length = 0;

        const slot = slotOf(rowsService, rows, 'r1');
        const doubledService = createDoubledService();
        const doubled = doubledService.createComputedStoreSlot(
            db,
            () => (slot.entity?.n ?? 0) * 2,
            () => ({ sourceSlots: [slot] }),
        );
        let seen = 0;
        effectService.createEffect(db, [], [doubledService.computedCollectionService.getSlotByKey(doubled, undefined)], () => { seen++; });

        // Nobody is subscribed to the slot itself -- only the derivation is read.
        updateEntityByKey(rowsService, rows, 'r1', { n: 5 });
        expect(armed).toHaveLength(1);

        armed[0]();
        // The effect settled the derivation on its way to deciding whether to
        // run, so the value is this frame's.
        expect(doubledService.computedCollectionService.slotContentService.getValueForSlot(
            doubledService.computedCollectionService.getSlotByKey(doubled, undefined),
        )).toBe(10);
        expect(seen).toBe(1);
    });

    it('one frame is asked for per batch, not one per written identity', () => {
        const armed: (() => void)[] = [];
        const db = new OIMDB({ channelScheduler: (flush) => { armed.push(flush); } });
        const { rowsService, rows } = collectionOver(db);
        rowsService.slotContentService.upsertEntities(rows, [{ id: 'r1', title: 'a', n: 0 }, { id: 'r2', title: 'b', n: 0 }]);
        db.flush();
        armed.length = 0;
        effectService.createEffect(db, [slotOf(rowsService, rows, 'r1')], [], () => { /* only there to be a reader */ });
        effectService.createEffect(db, [slotOf(rowsService, rows, 'r2')], [], () => { /* ditto */ });

        updateEntityByKey(rowsService, rows, 'r1', { n: 1 });
        updateEntityByKey(rowsService, rows, 'r2', { n: 1 });
        expect(armed).toHaveLength(1);

        armed[0]();
        // And the frame that opened is the one that was asked for: the next
        // write asks again.
        updateEntityByKey(rowsService, rows, 'r1', { n: 2 });
        expect(armed).toHaveLength(2);
    });
});
