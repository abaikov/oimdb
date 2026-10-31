import { OIMDB } from '../../db/OIMDB';
import { OIMSetBucketContentService } from '../../bucket/OIMSetBucketContentService';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIMSlotMapStoreService } from '../../store/OIMSlotMapStoreService';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMComputedColumnSlot } from '../../column/types/TOIMComputedColumnSlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleComputedService } from '../../computed/createOIMSingleComputedService';
import { readValueWithoutTracking } from '../../../tests/support/readValueWithoutTracking';

type TRow = { id: string; n: number };
type TRowSlot = TOIMEntitySlot<TRow, TOIMStoreKey>;

const effectService = OIMEffectService.INSTANCE;

const createFixture =() => {
    const db = new OIMDB();
    const rowsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TRow>() });
    const rows = rowsService.createStoreSlot(db);
    const byGroupService = createOIMSlotCollectionService({ slotContentService: new OIMSetBucketContentService<TRowSlot>() });
    const byGroup = byGroupService.createStoreSlot(db);
    return { db, rowsService, rows, byGroupService, byGroup };
};

const createDoubledService = () => createOIMSingleComputedService<number>({ sameValueGuard: oimSameValueZeroGuard, columnSlotStoreService: new OIMSlotMapStoreService<TOIMComputedColumnSlot, string>() });

describe('an effect hears nothing of a change that preceded it', () => {
    it('says nothing to an effect that arrived after the write, in the batch that made it', () => {
        const { db, rowsService, rows } = createFixture();

        rowsService.writeSlotContentByKey(rows, 'r1', { id: 'r1', n: 1 });

        let runCount = 0;
        effectService.createEffect(db, () => { runCount++; }, [rowsService.getSlotByKey(rows, 'r1')]);
        db.flush();

        expect(runCount).toBe(0);

        rowsService.writeSlotContentByKey(rows, 'r1', { id: 'r1', n: 2 });
        db.flush();
        expect(runCount).toBe(1);
    });

    it('says nothing to an effect on a row slot the open batch had already written', () => {
        const { db, rowsService, rows } = createFixture();
        rowsService.writeSlotContentByKey(rows, 'r1', { id: 'r1', n: 1 });
        const slot = rowsService.getSlotByKey(rows, 'r1')!;
        db.flush();

        rowsService.slotContentService.updateEntity(slot,{ n: 2 });

        let runCount = 0;
        effectService.createEffect(db, () => { runCount++; }, [slot]);
        db.flush();
        expect(runCount).toBe(0);

        rowsService.slotContentService.updateEntity(slot,{ n: 3 });
        db.flush();
        expect(runCount).toBe(1);
    });

    it('says nothing to an effect on a column the open batch had already written', () => {
        const { db, rowsService, rows } = createFixture();
        rowsService.writeSlotContentByKey(rows, 'r1', { id: 'r1', n: 1 });
        const slot = rowsService.getSlotByKey(rows, 'r1')!;
        const column = rowsService.columnSlotService.holdColumn(slot, 'n');

        let early = 0;
        const watching = effectService.createEffect(db, () => { early++; }, [column]);
        db.flush();
        early = 0;

        rowsService.slotContentService.updateEntity(slot,{ n: 2 });

        let late = 0;
        const arrivedLate = effectService.createEffect(db, () => { late++; }, [column]);
        db.flush();

        expect(early).toBe(1);
        expect(late).toBe(0);
        effectService.disposeEffect(arrivedLate);
        effectService.disposeEffect(watching);
    });

    it('says nothing to an effect on a bucket the open batch had already written', () => {
        const { db, rowsService, rows, byGroupService, byGroup } = createFixture();
        const first = rowsService.writeSlotContentByKey(rows, 'r1', { id: 'r1', n: 1 });
        const second = rowsService.writeSlotContentByKey(rows, 'r2', { id: 'r2', n: 2 });
        const group = byGroupService.holdSlotByKey(byGroup, 'g1');
        byGroupService.slotContentService.writeSlotContent(group, [first]);
        db.flush();

        byGroupService.slotContentService.writeSlotContent(group, [first, second]);

        let runCount = 0;
        effectService.createEffect(db, () => { runCount++; }, [group]);
        db.flush();
        expect(runCount).toBe(0);

        byGroupService.slotContentService.writeSlotContent(group, [second]);
        db.flush();
        expect(runCount).toBe(1);
    });

    it('says nothing to an effect on a computed whose source the open batch had already written', () => {
        const { db, rowsService, rows } = createFixture();
        rowsService.writeSlotContentByKey(rows, 'r1', { id: 'r1', n: 1 });
        const slot = rowsService.getSlotByKey(rows, 'r1')!;
        const doubledService = createDoubledService();
        const doubled = doubledService.createComputedStoreSlot(
            db,
            () => (slot.entity?.n ?? 0) * 2,
            () => ({ sourceSlots: [slot] }),
        );
        db.flush();

        rowsService.slotContentService.updateEntity(slot,{ n: 5 });

        let runCount = 0;
        effectService.createEffect(db, () => { runCount++; }, [], [doubledService.computedSingleSlotService.getSingleSlot(doubled)]);
        db.flush();
        expect(runCount).toBe(0);

        rowsService.slotContentService.updateEntity(slot,{ n: 9 });
        db.flush();
        expect(runCount).toBe(1);
    });
});

describe('effectImmediate is the door onto a value the batch has already written', () => {
    it('reads a row slot the open batch had already written', () => {
        const { db, rowsService, rows } = createFixture();
        rowsService.writeSlotContentByKey(rows, 'r1', { id: 'r1', n: 1 });
        const slot = rowsService.getSlotByKey(rows, 'r1')!;
        db.flush();

        rowsService.slotContentService.updateEntity(slot,{ n: 2 });

        const seen: (number | undefined)[] = [];
        const effect = effectService.createAndRunEffect(db, () => { seen.push(slot.entity?.n); }, [slot]);
        db.flush();

        expect(seen).toEqual([2]);
        effectService.disposeEffect(effect);
    });

    it('reads a column the open batch had already written', () => {
        const { db, rowsService, rows } = createFixture();
        rowsService.writeSlotContentByKey(rows, 'r1', { id: 'r1', n: 1 });
        const slot = rowsService.getSlotByKey(rows, 'r1')!;
        const column = rowsService.columnSlotService.holdColumn(slot, 'n');
        db.flush();

        rowsService.slotContentService.updateEntity(slot,{ n: 2 });

        const seen: (number | undefined)[] = [];
        const effect = effectService.createAndRunEffect(db, () => { seen.push(slot.entity?.n); }, [column]);
        db.flush();

        expect(seen).toEqual([2]);
        effectService.disposeEffect(effect);
    });

    it('reads a bucket the open batch had already written', () => {
        const { db, rowsService, rows, byGroupService, byGroup } = createFixture();
        const first = rowsService.writeSlotContentByKey(rows, 'r1', { id: 'r1', n: 1 });
        const second = rowsService.writeSlotContentByKey(rows, 'r2', { id: 'r2', n: 2 });
        const group = byGroupService.holdSlotByKey(byGroup, 'g1');
        byGroupService.slotContentService.writeSlotContent(group, [first]);
        db.flush();

        byGroupService.slotContentService.writeSlotContent(group, [first, second]);

        const seen: number[] = [];
        const effect = effectService.createAndRunEffect(
            db, () => { seen.push(byGroupService.slotContentService.getBucketMemberSlotCount(group)); }, [group],
        );
        db.flush();

        expect(seen).toEqual([2]);
        effectService.disposeEffect(effect);
    });

    it('reads a computed whose source the open batch had already written', () => {
        const { db, rowsService, rows } = createFixture();
        rowsService.writeSlotContentByKey(rows, 'r1', { id: 'r1', n: 1 });
        const slot = rowsService.getSlotByKey(rows, 'r1')!;
        const doubledService = createDoubledService();
        const doubled = doubledService.createComputedStoreSlot(
            db,
            () => (slot.entity?.n ?? 0) * 2,
            () => ({ sourceSlots: [slot] }),
        );
        db.flush();

        rowsService.slotContentService.updateEntity(slot,{ n: 5 });

        const seen: number[] = [];
        const doubledSlot = doubledService.computedSingleSlotService.getSingleSlot(doubled);
        const effect = effectService.createAndRunEffect(db, () => {
            seen.push(readValueWithoutTracking(doubledSlot));
        }, [], [doubledSlot]);
        db.flush();

        expect(seen).toEqual([10]);
        effectService.disposeEffect(effect);
    });
});

describe('the frame stamp answers one question: has this slot walked its dependents yet', () => {
    it('tells one that was already there, once, for two writes of one batch', () => {
        const { db, rowsService, rows } = createFixture();

        let runCount = 0;
        effectService.createEffect(db, () => { runCount++; }, [rowsService.holdSlotByKey(rows, 'r1')]);

        rowsService.writeSlotContentByKey(rows, 'r1', { id: 'r1', n: 1 });
        rowsService.writeSlotContentByKey(rows, 'r1', { id: 'r1', n: 2 });
        db.flush();

        expect(runCount).toBe(1);
    });
});
