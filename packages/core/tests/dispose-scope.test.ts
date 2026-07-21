import {
    OIMDisposeScope,
    createOIMDisposeScope,
    OIMEventQueue,
    OIMReactiveCollection,
    createOIMCollectionIndexFactory,
    createOIMCollectionKit,
} from '../src';

describe('OIMDisposeScope', () => {
    test('disposes objects and functions in reverse (LIFO) order', () => {
        const scope = new OIMDisposeScope();
        const order: string[] = [];
        scope.add({ destroy: () => order.push('a') });
        scope.add(() => order.push('b')); // bare unsubscribe fn
        scope.add({ destroy: () => order.push('c') });

        scope.destroy();
        expect(order).toEqual(['c', 'b', 'a']);
    });

    test('add returns the value for inline capture', () => {
        const scope = new OIMDisposeScope();
        const queue = scope.add(new OIMEventQueue());
        const users = scope.add(
            new OIMReactiveCollection<{ id: string }, string>(queue, {
                selectPk: u => u.id,
            })
        );
        expect(users).toBeInstanceOf(OIMReactiveCollection);
        expect(scope.size).toBe(2);
        scope.destroy();
        expect(scope.isDisposed).toBe(true);
        expect(scope.size).toBe(0);
    });

    test('is idempotent', () => {
        const scope = new OIMDisposeScope();
        let calls = 0;
        scope.add(() => calls++);
        scope.destroy();
        scope.destroy();
        expect(calls).toBe(1);
    });

    test('adding after disposal disposes immediately', () => {
        const scope = new OIMDisposeScope();
        scope.destroy();
        let disposed = false;
        scope.add(() => {
            disposed = true;
        });
        expect(disposed).toBe(true);
        expect(scope.size).toBe(0);
    });

    test('disposes every item even if one throws, then rethrows the first error', () => {
        const scope = new OIMDisposeScope();
        const order: string[] = [];
        scope.add(() => order.push('a'));
        scope.add(() => {
            throw new Error('boom');
        });
        scope.add(() => order.push('c'));

        expect(() => scope.destroy()).toThrow('boom');
        // 'c' (registered last) runs first, 'a' still runs after the throw.
        expect(order).toEqual(['c', 'a']);
    });

    test('child() nests a scope disposed with the parent', () => {
        const scope = createOIMDisposeScope();
        const order: string[] = [];
        scope.add(() => order.push('parent-first'));
        const child = scope.child();
        child.add(() => order.push('child'));

        scope.destroy();
        // child scope was registered after 'parent-first', so LIFO disposes the
        // child (and its contents) before 'parent-first'.
        expect(order).toEqual(['child', 'parent-first']);
        expect(child.isDisposed).toBe(true);
    });

    test('kit.scope owns the collection; kit.destroy tears it down, not the queue', () => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<{ id: string }, string>(queue, {
            selectPk: e => e.id,
        });
        const byX = kit.scope.add(kit.indexFactory.setBasedIndex<string>());
        kit.collection.upsertOne({ id: 'a' });
        byX.setPks('k', ['a']);

        kit.destroy();
        // Index + collection disposed; queue is NOT owned by the kit.
        expect(kit.scope.isDisposed).toBe(true);
        expect(byX.hasSubscriptions()).toBe(false);
        // Queue still usable (caller owns it).
        expect(() => queue.flush()).not.toThrow();
        queue.destroy();
    });

    test('tears down a real collection + index + subscription', () => {
        const scope = new OIMDisposeScope();
        const queue = scope.add(new OIMEventQueue());
        const users = scope.add(
            new OIMReactiveCollection<{ id: string; team: string }, string>(
                queue,
                { selectPk: u => u.id }
            )
        );
        const factory = createOIMCollectionIndexFactory(queue, users);
        const byTeam = scope.add(factory.setBasedIndex<string>());

        users.upsertMany([
            { id: 'u1', team: 't1' },
            { id: 'u2', team: 't1' },
        ]);
        byTeam.setPks('t1', ['u1', 'u2']);
        let calls = 0;
        scope.add(byTeam.subscribeOnKey('t1', () => calls++));
        byTeam.setPks('t1', ['u1']);
        queue.flush();
        expect(calls).toBe(1);

        // One call tears everything down without manual ordering.
        expect(() => scope.destroy()).not.toThrow();
        expect(byTeam.hasSubscriptions()).toBe(false);
    });
});
