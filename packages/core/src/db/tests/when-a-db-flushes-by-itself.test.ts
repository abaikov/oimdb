import { OIMDB } from '../OIMDB';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionStoreAggregate } from '../../slot/createOIMSlotCollectionStoreAggregate';
import type { TOIMDBOptions } from '../types/TOIMDBOptions';

type TTodo = { id: string; title: string };

const createFixture = (options?: TOIMDBOptions) => {
    const db = new OIMDB(options);
    const todos = createOIMSlotCollectionStoreAggregate(db, { slotContentService: createOIMEntityContentService<TTodo>() });
    todos.writeSlotContentByKey('t1', { id: 't1', title: 'Write' });
    db.flush();
    const seen: (string | undefined)[] = [];
    const dispose = db.createEffect(() => { seen.push(todos.getSlotByKey('t1').entity?.title); });
    return { db, todos, seen, dispose };
};

const nextMicrotask = (): Promise<void> => new Promise(resolve => { queueMicrotask(resolve); });

describe('when a db flushes by itself', () => {
    it.each([
        ['no scheduler', undefined],
        ['a null scheduler', { channelScheduler: null }],
    ])('waits for a flush by hand under %s', async (_name, options) => {
        const { db, todos, seen, dispose } = createFixture(options);
        todos.writeSlotContentByKey('t1', { id: 't1', title: 'Read' });
        await nextMicrotask();
        expect(seen).toEqual(['Write']);

        db.flush();
        dispose();

        expect(seen).toEqual(['Write', 'Read']);
    });

    it('delivers when the scheduler it was given calls the flush', async () => {
        const { todos, seen, dispose } = createFixture({ channelScheduler: queueMicrotask });
        todos.writeSlotContentByKey('t1', { id: 't1', title: 'Read' });
        expect(seen).toEqual(['Write']);

        await nextMicrotask();
        dispose();

        expect(seen).toEqual(['Write', 'Read']);
    });

    it('delivers at once on a flush by hand, and the scheduled flush after it finds nothing', async () => {
        const { db, todos, seen, dispose } = createFixture({ channelScheduler: queueMicrotask });
        todos.writeSlotContentByKey('t1', { id: 't1', title: 'Read' });
        db.flush();
        await nextMicrotask();
        dispose();

        expect(seen).toEqual(['Write', 'Read']);
    });
});
