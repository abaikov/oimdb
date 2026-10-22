import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMSlotStoreServiceMapDriven } from '../../store/OIMSlotStoreServiceMapDriven';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../store/OIMSlotStoreServiceSingleSlotDriven';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMComputedColumnSlot } from '../../column/types/TOIMComputedColumnSlot';
import type { TOIMComputedSlot } from '../../computed/types/TOIMComputedSlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';

type TRow = { id: string; n: number };
type TRowSlot = TOIMEntitySlot<TRow, TOIMStoreKey>;

const effectService = OIMEffectService.INSTANCE;

const createFixture =() => {
    const db = new OIMDB();
    const rowsService = createOIMEntityService<TRow>(db, { keyOf: (row) => row.id });
    const rows = rowsService.createStoreSlot(db);
    const byGroupService = createOIMBucketService<
        TRowSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TRowSlot>, OIMSlotContentBucketServiceSetDriven<TRowSlot>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TRowSlot>() });
    const byGroup = byGroupService.createStoreSlot(db);
    return { db, rowsService, rows, byGroupService, byGroup };
};

const createDoubledService = () => createOIMComputedService<void, number>({
    computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
    sameValueGuard: oimSameValueZeroGuard,
    columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedColumnSlot, string>(),
});

describe('an effect hears nothing of a change that preceded it', () => {
    it('says nothing to an effect that arrived after the write, in the batch that made it', () => {
        const { db, rowsService, rows } = createFixture();

        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });

        let runCount = 0;
        effectService.createEffect(db, [rowsService.getSlotByKey(rows, 'r1')], [], () => { runCount++; });
        db.flush();

        expect(runCount).toBe(0);

        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 2 });
        db.flush();
        expect(runCount).toBe(1);
    });

    it('says nothing to an effect on a row slot the open batch had already written', () => {
        const { db, rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        const slot = rowsService.getSlotByKey(rows, 'r1')!;
        db.flush();

        rowsService.slotContentService.updateEntity(slot,{ n: 2 });

        let runCount = 0;
        effectService.createEffect(db, [slot], [], () => { runCount++; });
        db.flush();
        expect(runCount).toBe(0);

        rowsService.slotContentService.updateEntity(slot,{ n: 3 });
        db.flush();
        expect(runCount).toBe(1);
    });

    it('says nothing to an effect on a column the open batch had already written', () => {
        const { db, rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        const slot = rowsService.getSlotByKey(rows, 'r1')!;
        const column = rowsService.holdColumn(slot, 'n');

        let early = 0;
        const watching = effectService.createEffect(db, [column], [], () => { early++; });
        db.flush();
        early = 0;

        rowsService.slotContentService.updateEntity(slot,{ n: 2 });

        let late = 0;
        const arrivedLate = effectService.createEffect(db, [column], [], () => { late++; });
        db.flush();

        expect(early).toBe(1);
        expect(late).toBe(0);
        effectService.disposeEffect(arrivedLate);
        effectService.disposeEffect(watching);
    });

    it('says nothing to an effect on a bucket the open batch had already written', () => {
        const { db, rowsService, rows, byGroupService, byGroup } = createFixture();
        const first = rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        const second = rowsService.slotContentService.upsertEntity(rows, { id: 'r2', n: 2 });
        const group = byGroupService.holdSlotByKey(byGroup, 'g1');
        byGroupService.slotContentService.writeBucketMemberSlots(group, [first]);
        db.flush();

        byGroupService.slotContentService.writeBucketMemberSlots(group, [first, second]);

        let runCount = 0;
        effectService.createEffect(db, [group], [], () => { runCount++; });
        db.flush();
        expect(runCount).toBe(0);

        byGroupService.slotContentService.writeBucketMemberSlots(group, [second]);
        db.flush();
        expect(runCount).toBe(1);
    });

    it('says nothing to an effect on a computed whose source the open batch had already written', () => {
        const { db, rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
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
        effectService.createEffect(db, [], [doubledService.computedCollectionService.getSlotByKey(doubled, undefined)], () => { runCount++; });
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
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        const slot = rowsService.getSlotByKey(rows, 'r1')!;
        db.flush();

        rowsService.slotContentService.updateEntity(slot,{ n: 2 });

        const seen: (number | undefined)[] = [];
        const effect = effectService.createEffectImmediate(db, [slot], [], () => { seen.push(slot.entity?.n); });
        db.flush();

        expect(seen).toEqual([2]);
        effectService.disposeEffect(effect);
    });

    it('reads a column the open batch had already written', () => {
        const { db, rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        const slot = rowsService.getSlotByKey(rows, 'r1')!;
        const column = rowsService.holdColumn(slot, 'n');
        db.flush();

        rowsService.slotContentService.updateEntity(slot,{ n: 2 });

        const seen: (number | undefined)[] = [];
        const effect = effectService.createEffectImmediate(db, [column], [], () => { seen.push(slot.entity?.n); });
        db.flush();

        expect(seen).toEqual([2]);
        effectService.disposeEffect(effect);
    });

    it('reads a bucket the open batch had already written', () => {
        const { db, rowsService, rows, byGroupService, byGroup } = createFixture();
        const first = rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        const second = rowsService.slotContentService.upsertEntity(rows, { id: 'r2', n: 2 });
        const group = byGroupService.holdSlotByKey(byGroup, 'g1');
        byGroupService.slotContentService.writeBucketMemberSlots(group, [first]);
        db.flush();

        byGroupService.slotContentService.writeBucketMemberSlots(group, [first, second]);

        const seen: number[] = [];
        const effect = effectService.createEffectImmediate(
            db, [group], [], () => { seen.push(byGroupService.slotContentService.getBucketMemberSlotCount(group)); },
        );
        db.flush();

        expect(seen).toEqual([2]);
        effectService.disposeEffect(effect);
    });

    it('reads a computed whose source the open batch had already written', () => {
        const { db, rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
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
        const doubledSlot = doubledService.computedCollectionService.getSlotByKey(doubled, undefined);
        const effect = effectService.createEffectImmediate(db, [], [doubledSlot], () => {
            seen.push(doubledService.computedCollectionService.slotContentService.getValueForSlot(doubledSlot));
        });
        db.flush();

        expect(seen).toEqual([10]);
        effectService.disposeEffect(effect);
    });
});

describe('the frame stamp answers one question: has this slot walked its dependents yet', () => {
    it('tells one that was already there, once, for two writes of one batch', () => {
        const { db, rowsService, rows } = createFixture();

        let runCount = 0;
        effectService.createEffect(db, [rowsService.holdSlotByKey(rows, 'r1')], [], () => { runCount++; });

        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 2 });
        db.flush();

        expect(runCount).toBe(1);
    });
});
