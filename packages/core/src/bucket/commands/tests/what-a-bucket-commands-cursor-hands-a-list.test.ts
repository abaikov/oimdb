import { OIMDB } from '../../../db/OIMDB';
import { createOIMEntityContentService } from '../../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionStoreAggregate } from '../../../slot/createOIMSlotCollectionStoreAggregate';
import { createOIMSlotCollectionIndexService } from '../../../index/createOIMSlotCollectionIndexService';
import { OIMPositionalArrayBucketContentService } from '../../OIMPositionalArrayBucketContentService';
import { OIMSetBucketContentService } from '../../OIMSetBucketContentService';
import { OIMBucketCommands } from '../../OIMBucketCommands';
import { OIMBucketCommandsCursor } from '../OIMBucketCommandsCursor';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';
import type { TOIMOrderedListCommand } from '../types/TOIMOrderedListCommand';

type TTodo = { id: string; done: boolean };

const summaryOf = (commands: readonly TOIMOrderedListCommand[]): string[] => commands.map(command => (
    command.type === 'reset' ? `reset ${command.slots.length}`
        : command.type === 'insert' ? `insert ${command.index}`
            : command.type === 'remove' ? `remove ${command.index}` : `move ${command.from}>${command.to}`
));

function createFixture(isRecorded: boolean) {
    const db = new OIMDB();
    const todos = createOIMSlotCollectionStoreAggregate(db, { slotContentService: createOIMEntityContentService<TTodo>() });
    todos.writeSlotContentByKey('t1', { id: 't1', done: false });
    db.flush();
    const byDoneService = isRecorded
        ? createOIMSlotCollectionIndexService({
            entityService: todos.slotService, keyOf: (todo: TTodo): string => (todo.done ? 'done' : 'open'),
            slotContentService: new OIMPositionalArrayBucketContentService<TOIMEntitySlot<TTodo>>({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }) }),
        })
        : createOIMSlotCollectionIndexService({
            entityService: todos.slotService, keyOf: (todo: TTodo): string => (todo.done ? 'done' : 'open'),
            slotContentService: new OIMSetBucketContentService<TOIMEntitySlot<TTodo>>(),
        });
    const byDone = byDoneService.createIndexStoreSlot(todos.storeSlot);
    const open = byDoneService.holdSlotByKey(byDone, 'open');
    return { db, todos, open };
}

describe('what a bucket commands cursor hands a list', () => {
    it('hands the whole list on the first take, then only what the frame recorded', () => {
        const { db, todos, open } = createFixture(true);
        const cursor = new OIMBucketCommandsCursor({ bucketSlot: open });
        const takes: string[][] = [];
        const dispose = open.watch(() => { takes.push(summaryOf(cursor.takeBucketCommands())); });

        todos.writeSlotContentByKey('t2', { id: 't2', done: false });
        db.flush();
        todos.slotContentService.updateEntity(todos.getSlotByKey('t1'), { done: true });
        db.flush();
        dispose();

        expect(takes).toEqual([['reset 1'], ['insert 1'], ['remove 0']]);
    });

    it('hands only the tail of a script it already read part of', () => {
        const { todos, open } = createFixture(true);
        todos.writeSlotContentByKey('t2', { id: 't2', done: false });
        const cursor = new OIMBucketCommandsCursor({ bucketSlot: open });
        cursor.takeBucketCommands();
        todos.writeSlotContentByKey('t3', { id: 't3', done: false });

        expect(summaryOf(cursor.takeBucketCommands())).toEqual(['insert 2']);
    });

    it('hands the whole list on every wake of a bucket that records no commands', () => {
        const { db, todos, open } = createFixture(false);
        const cursor = new OIMBucketCommandsCursor({ bucketSlot: open });
        const takes: string[][] = [];
        const dispose = open.watch(() => { takes.push(summaryOf(cursor.takeBucketCommands())); });

        todos.writeSlotContentByKey('t2', { id: 't2', done: false });
        db.flush();
        dispose();

        expect(takes).toEqual([['reset 1'], ['reset 2']]);
    });
});
