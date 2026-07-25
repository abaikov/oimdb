import {
    OIMEventQueue,
    createOIMCollectionKit,
    on,
    getOIMComputeRuntime,
} from '../src';

type User = { id: string; name: string; role: 'admin' | 'member' };
type Order = { id: string; userId: string; total: number };

describe('DX compute facade: kit.computed / kit.effect / on', () => {
    let queue: OIMEventQueue;
    beforeEach(() => {
        queue = new OIMEventQueue();
    });
    afterEach(() => queue.destroy());

    test('kit.computed over a collection recomputes on change', () => {
        const users = createOIMCollectionKit<User, string>(queue, {
            selectPk: u => u.id,
        });
        users.collection.upsertOne({ id: 'u1', name: 'A', role: 'member' });
        queue.flush();

        const isAdmin = users.computed(
            [on.collection(users.collection, 'u1')],
            () => users.collection.getOneByPk('u1')?.role === 'admin'
        );

        expect(isAdmin.get()).toBe(false);
        users.collection.upsertOne({ id: 'u1', name: 'A', role: 'admin' });
        queue.flush();
        expect(isAdmin.get()).toBe(true);
    });

    test('kit.effect runs when its dependency changes', () => {
        const users = createOIMCollectionKit<User, string>(queue, {
            selectPk: u => u.id,
        });
        let runs = 0;
        users.effect([on.collection(users.collection, 'u1')], () => {
            runs++;
        });
        users.collection.upsertOne({ id: 'u1', name: 'A', role: 'member' });
        queue.flush();
        expect(runs).toBeGreaterThan(0);
    });

    test('computed can depend on another computed (on.computed)', () => {
        const users = createOIMCollectionKit<User, string>(queue, {
            selectPk: u => u.id,
        });
        users.collection.upsertOne({ id: 'u1', name: 'Ann', role: 'member' });
        queue.flush();

        const name = users.computed(
            [on.collection(users.collection, 'u1')],
            () => users.collection.getOneByPk('u1')?.name ?? ''
        );
        const shout = users.computed(
            [on.computed(name)],
            () => name.get().toUpperCase()
        );

        expect(shout.get()).toBe('ANN');
        users.collection.upsertOne({ id: 'u1', name: 'Bob', role: 'member' });
        queue.flush();
        expect(shout.get()).toBe('BOB');
    });

    test('cross-collection computed (two kits, one queue) shares a runtime', () => {
        const users = createOIMCollectionKit<User, string>(queue, {
            selectPk: u => u.id,
        });
        const orders = createOIMCollectionKit<Order, string>(queue, {
            selectPk: o => o.id,
        });
        // Both kits share ONE runtime for the queue.
        expect(getOIMComputeRuntime(queue)).toBe(users.select.runtime);
        expect(users.select.runtime).toBe(orders.select.runtime);

        users.collection.upsertOne({ id: 'u1', name: 'A', role: 'admin' });
        orders.collection.upsertOne({ id: 'o1', userId: 'u1', total: 10 });
        queue.flush();

        const label = users.computed(
            [
                on.collection(users.collection, 'u1'),
                on.collection(orders.collection, 'o1'),
            ],
            () =>
                `${users.collection.getOneByPk('u1')?.name}:${
                    orders.collection.getOneByPk('o1')?.total
                }`
        );

        expect(label.get()).toBe('A:10');
        orders.collection.upsertOne({ id: 'o1', userId: 'u1', total: 99 });
        queue.flush();
        expect(label.get()).toBe('A:99');
    });

    test('destroy() tears down kit-created computeds via the scope', () => {
        const users = createOIMCollectionKit<User, string>(queue, {
            selectPk: u => u.id,
        });
        users.collection.upsertOne({ id: 'u1', name: 'A', role: 'member' });
        queue.flush();

        let runs = 0;
        users.effect([on.collection(users.collection, 'u1')], () => {
            runs++;
        });
        users.collection.upsertOne({ id: 'u1', name: 'B', role: 'member' });
        queue.flush();
        const before = runs;

        users.destroy();
        users.collection.upsertOne({ id: 'u1', name: 'C', role: 'member' });
        queue.flush();
        expect(runs).toBe(before); // effect torn down, no more runs
    });
});
