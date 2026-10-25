import { OIMDB } from '../../../factories/OIMDB';
import { OIMSlotAfterWriteReleasePolicy } from '../OIMSlotAfterWriteReleasePolicy';
import { OIMSlotAfterIdleReleasePolicy } from '../OIMSlotAfterIdleReleasePolicy';
import { oimMintAfterWriteSlotReleaseWheel } from '../utils/oimMintAfterWriteSlotReleaseWheel';
import { oimMintAfterIdleSlotReleaseWheel } from '../utils/oimMintAfterIdleSlotReleaseWheel';
import { OIMSlotEarliestReleasePolicy } from '../OIMSlotEarliestReleasePolicy';
import type { IOIMSlotReleasePolicy } from '../interfaces/IOIMSlotReleasePolicy';
import type { TOIMTimer } from '../../schedule/types/TOIMTimer';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

type TRow = { id: string; n: number };

const KEEP_MS = 60_000;

const createWorld = (withIdle = true) => {
    let nowMs = 1_000_000;
    let nowReads = 0;
    const getNowMs = (): number => { nowReads++; return nowMs; };
    const releaseTimer: TOIMTimer = () => () => undefined;
    const afterWritePolicy = new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: KEEP_MS });
    const slotReleasePolicy: IOIMSlotReleasePolicy = withIdle
        ? new OIMSlotEarliestReleasePolicy([
            afterWritePolicy,
            new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: KEEP_MS }),
        ])
        : afterWritePolicy;
    const db = new OIMDB({ getNowMs, releaseTimer, slotReleasePolicy });
    const rowsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TRow, string>(db) });
    const rows = rowsService.createStoreSlot(db);
    const afterWriteSlotReleaseWheel = oimMintAfterWriteSlotReleaseWheel(db.collectorSlot);
    const afterIdleSlotReleaseWheel = oimMintAfterIdleSlotReleaseWheel(db.collectorSlot);
    const slotReleaseWheels = [afterWriteSlotReleaseWheel, afterIdleSlotReleaseWheel];
    return {
        db, rowsService, rows, slotReleaseWheels,
        nowReads: () => nowReads,
        resetNowReads: () => { nowReads = 0; },
        advance: (ms: number) => { nowMs += ms; },
        sweep: () => {
            afterWriteSlotReleaseWheel.flush();
            afterIdleSlotReleaseWheel.flush();
        },
    };
};

const countSetWrites = () => {
    const add = jest.spyOn(Set.prototype, 'add');
    const remove = jest.spyOn(Set.prototype, 'delete');
    return {
        writes: () => add.mock.calls.length + remove.mock.calls.length,
        restore: () => { add.mockRestore(); remove.mockRestore(); },
    };
};

describe('what a slot already on the release clock pays again', () => {
    it('a write to a filed row that is already queued moves nothing on the queue', () => {
        const { db, rowsService, rows } = createWorld();
        rowsService.writeSlotContentByKey(rows, 'r', { id: 'r', n: 0 });
        db.flush();
        const setWrites = countSetWrites();

        for (let i = 1; i <= 10; i++) rowsService.writeSlotContentByKey(rows, 'r', { id: 'r', n: i });
        const writes = setWrites.writes();
        setWrites.restore();

        expect(writes).toBe(0);
    });

    it('a write still pushes the deadline: the row is not released when the first deadline passes', () => {
        const { db, rowsService, rows, advance, sweep } = createWorld(false);
        const slot = rowsService.writeSlotContentByKey(rows, 'r', { id: 'r', n: 0 });
        db.flush();
        advance(KEEP_MS / 2);
        rowsService.writeSlotContentByKey(rows, 'r', { id: 'r', n: 1 });
        db.flush();

        advance(KEEP_MS / 2 + 1000);
        sweep();
        expect(oimIsSlotReleased(slot)).toBe(false);

        advance(KEEP_MS);
        sweep();
        expect(oimIsSlotReleased(slot)).toBe(true);
    });

    it('a read that finds nothing puts no empty slot on the release clock and reads no clock', () => {
        const { db, rowsService, rows, slotReleaseWheels, nowReads, resetNowReads } = createWorld();
        db.flush();
        resetNowReads();

        const missed = rowsService.getSlotByKey(rows, 'missing');

        expect(nowReads()).toBe(0);
        expect(slotReleaseWheels.some(
            slotReleaseWheel => slotReleaseWheel.isSlotReleaseScheduled(missed),
        )).toBe(false);
        db.flush();
        expect(oimIsSlotReleased(missed)).toBe(true);
    });
});
