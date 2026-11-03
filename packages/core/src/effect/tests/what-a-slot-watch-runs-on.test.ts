import { OIMDB } from '../../db/OIMDB';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionStoreAggregate } from '../../slot/createOIMSlotCollectionStoreAggregate';
import { createOIMSlotCollectionIndexService } from '../../index/createOIMSlotCollectionIndexService';
import { createOIMColumnGroup } from '../../column/utils/createOIMColumnGroup';
import { createOIMSingleComputedService } from '../../computed/createOIMSingleComputedService';
import { createOIMSingleSourceTrackingComputedService } from '../../computed/createOIMSingleSourceTrackingComputedService';
import { OIMPositionalArrayBucketContentService } from '../../bucket/OIMPositionalArrayBucketContentService';
import { OIMBucketCommands } from '../../bucket/OIMBucketCommands';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';

type TTodo = { id: string; title: string; done: boolean };

const titleAndDone = createOIMColumnGroup<keyof TTodo>(['title', 'done']);

const createFixture = () => {
    const db = new OIMDB();
    const todos = createOIMSlotCollectionStoreAggregate(db, {
        slotContentService: createOIMEntityContentService<TTodo>(), columnGroups: [titleAndDone],
    });
    todos.writeSlotContentByKey('t1', { id: 't1', title: 'Write', done: false });
    db.flush();
    return { db, todos, todo: todos.getSlotByKey('t1') };
};

describe('what a slot watch runs on', () => {
    it('runs at once and on every write of the entity, with the entity or undefined', () => {
        const { db, todos, todo } = createFixture();
        const seen: (string | undefined)[] = [];
        const dispose = todo.watch(entity => { seen.push(entity?.title); });

        todos.slotContentService.updateEntity(todo, { done: true });
        db.flush();
        todo.clearSlotContent();
        db.flush();
        dispose();

        expect(seen).toEqual(['Write', 'Write', undefined]);
    });

    it('runs on a write of the named column only', () => {
        const { db, todos, todo } = createFixture();
        const seen: (string | undefined)[] = [];
        const dispose = todo.watch(entity => { seen.push(entity?.title); }, ['title']);

        todos.slotContentService.updateEntity(todo, { done: true });
        db.flush();
        todos.slotContentService.updateEntity(todo, { title: 'Read' });
        db.flush();
        dispose();

        expect(seen).toEqual(['Write', 'Read']);
    });

    it('runs on a write of any column of a declared group', () => {
        const { db, todos, todo } = createFixture();
        let runs = 0;
        const dispose = todo.watch(() => { runs++; }, ['title', 'done']);

        todos.slotContentService.updateEntity(todo, { done: true });
        db.flush();
        dispose();

        expect(runs).toBe(2);
    });

    it('does not hand the slots its first run reads to a tracked body it was created in', () => {
        const { db, todos, todo } = createFixture();
        todos.writeSlotContentByKey('t2', { id: 't2', title: 'Other', done: false });
        db.flush();
        const other = todos.getSlotByKey('t2');
        let outerRuns = 0;
        let disposeInner: (() => void) | undefined;
        const disposeOuter = db.createEffect(() => {
            outerRuns++;
            if (disposeInner === undefined) disposeInner = db.createEffect(() => { void other.entity; }, [todo]);
        });

        todos.slotContentService.updateEntity(other, { title: 'Changed' });
        db.flush();
        disposeInner?.();
        disposeOuter();

        expect(outerRuns).toBe(1);
    });

    it('stops when disposed', () => {
        const { db, todos, todo } = createFixture();
        let runs = 0;
        const dispose = todo.watch(() => { runs++; });
        dispose();

        todos.slotContentService.updateEntity(todo, { title: 'Read' });
        db.flush();

        expect(runs).toBe(1);
    });

    it('watches a computed value and a column of it', () => {
        const { db, todos, todo } = createFixture();
        const summaryService = createOIMSingleComputedService<{ title: string; done: boolean }>({});
        const summary = summaryService.createStoreSlot(
            db, () => ({ title: todo.entity?.title ?? '', done: todo.entity?.done ?? false }), () => ({ sourceSlots: [todo] }),
        );
        db.flush();
        const summarySlot = summaryService.holdSingleSlot(summary);
        const values: unknown[] = [];
        const titles: unknown[] = [];
        const disposeValue = summarySlot.watch(value => { values.push(value.done); });
        const disposeTitle = summarySlot.watch(value => { titles.push(value.title); }, ['title']);

        todos.slotContentService.updateEntity(todo, { done: true });
        db.flush();
        disposeValue();
        disposeTitle();

        expect(values).toEqual([false, true]);
        expect(titles).toEqual(['Write']);
    });

    it('watches a source-tracking computed through its new sources', () => {
        const { db, todos } = createFixture();
        todos.writeSlotContentByKey('t2', { id: 't2', title: 'Ship', done: false });
        todos.writeSlotContentByKey('pick', { id: 'pick', title: '', done: false });
        db.flush();
        const pickedService = createOIMSingleSourceTrackingComputedService<string>({
            derive: () => (todos.getSlotByKey(todos.getSlotByKey('pick').entity?.done === true ? 't2' : 't1').entity?.title ?? ''),
        });
        const picked = pickedService.createStoreSlot(db);
        db.flush();
        const pickedSlot = pickedService.holdSingleSlot(picked);
        const seen: string[] = [];
        const dispose = pickedSlot.watch(value => { seen.push(value); });

        todos.slotContentService.updateEntity(todos.getSlotByKey('pick'), { done: true });
        db.flush();
        todos.slotContentService.updateEntity(todos.getSlotByKey('t2'), { title: 'Shipped' });
        db.flush();
        dispose();

        expect(seen).toEqual(['Write', 'Ship', 'Shipped']);
    });

    it('watches a bucket and hands it to the body, with the commands of the frame', () => {
        const { db, todos } = createFixture();
        const byDoneService = createOIMSlotCollectionIndexService({
            entityService: todos.slotService,
            keyOf: (entity: TTodo): 'done' | 'open' => (entity.done ? 'done' : 'open'),
            slotContentService: new OIMPositionalArrayBucketContentService<TOIMEntitySlot<TTodo>>({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }) }),
        });
        const byDone = byDoneService.createIndexStoreSlot(todos.storeSlot);
        const open = byDoneService.holdSlotByKey(byDone, 'open');
        const counts: number[] = [];
        const dispose = open.watch(bucketSlot => { counts.push(bucketSlot.getBucketMemberSlotCount()); });

        todos.writeSlotContentByKey('t3', { id: 't3', title: 'Test', done: false });
        db.flush();
        dispose();

        expect(counts).toEqual([1, 2]);
    });
});
