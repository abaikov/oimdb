import {
    OIMEventQueue,
    OIMEventQueueSchedulerImmediate,
    createOIMCollectionKit,
} from '@oimdb/core';

interface ITask {
    id: string;
    title: string;
    assigneeId: string;
    done: boolean;
}

function collectionModelExample(): void {
    const queue = new OIMEventQueue({ scheduler: new OIMEventQueueSchedulerImmediate() });
    const { collection, indexFactory, select } =
        createOIMCollectionKit<ITask, string>(queue, { selectPk: (t) => t.id });

    const byAssignee = indexFactory.derivedSetIndex<string>((task) => [task.assigneeId]);

    collection.upsertMany([
        { id: 't1', title: 'Design',    assigneeId: 'u1', done: false },
        { id: 't2', title: 'Implement', assigneeId: 'u1', done: false },
        { id: 't3', title: 'Review',    assigneeId: 'u2', done: true  },
    ]);
    queue.flush();

    const u1Tasks = select.entitiesBySetIndexKey(byAssignee, 'u1');
    console.log('u1 tasks:', u1Tasks.getValue()?.map((t) => t?.title));

    const t1 = select.byPk('t1');
    const unsubscribe = t1.watch((task) => {
        console.log('t1 updated:', task?.title);
    });

    collection.upsertOne({ id: 't1', title: 'Design (revised)', assigneeId: 'u1', done: true });
    queue.flush(); // logs: t1 updated: Design (revised)

    unsubscribe();
    byAssignee.destroy();
    collection.destroy();
    queue.destroy();
    console.log('Done.');
}

if (require.main === module) {
    collectionModelExample();
}

export { collectionModelExample };
