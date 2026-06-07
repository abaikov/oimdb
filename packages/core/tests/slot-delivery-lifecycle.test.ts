import { OIMEventQueue, OIMReactiveCollection } from '../src';

type User = { id: string; name: string };

function setup() {
    const queue = new OIMEventQueue();
    const users = new OIMReactiveCollection<User, string>(queue, {
        selectPk: u => u.id,
    });
    return { queue, users };
}

describe('slot-based keyed delivery — lifecycle', () => {
    test('notifies a per-pk subscriber on update', () => {
        const { queue, users } = setup();
        users.upsertOne({ id: 'u1', name: 'Alice' });

        let calls = 0;
        users.subscribeOnKey('u1', () => calls++);

        users.upsertOneByPk('u1', { name: 'Alice 2' });
        queue.flush();
        expect(calls).toBe(1);
        expect(users.getOneByPk('u1')).toEqual({ id: 'u1', name: 'Alice 2' });

        users.destroy();
        queue.destroy();
    });

    test('subscription SURVIVES remove → re-add (the key scenario)', () => {
        const { queue, users } = setup();
        users.upsertOne({ id: 'u1', name: 'Alice' });

        const seen: (string | undefined)[] = [];
        users.subscribeOnKey('u1', () => seen.push(users.getOneByPk('u1')?.name));

        // remove → subscriber notified, entity gone
        users.removeOneByPk('u1');
        queue.flush();
        expect(seen).toEqual([undefined]);
        expect(users.getOneByPk('u1')).toBeUndefined();
        // not enumerated as a live entity while empty
        expect(users.getAllPks()).toEqual([]);
        expect(users.countAll()).toBe(0);
        // ...but the subscription is still registered
        expect(users.getHandlerCount('u1')).toBe(1);

        // re-add → same subscription fires with the new entity
        users.upsertOne({ id: 'u1', name: 'Alice reborn' });
        queue.flush();
        expect(seen).toEqual([undefined, 'Alice reborn']);

        users.destroy();
        queue.destroy();
    });

    test('subscribe before the entity exists, then it arrives', () => {
        const { queue, users } = setup();
        let calls = 0;
        users.subscribeOnKey('ghost', () => calls++);
        // a reserved slot must not show up as an entity
        expect(users.getAllPks()).toEqual([]);
        expect(users.countAll()).toBe(0);

        users.upsertOne({ id: 'ghost', name: 'Boo' });
        queue.flush();
        expect(calls).toBe(1);
        expect(users.getOneByPk('ghost')).toEqual({ id: 'ghost', name: 'Boo' });

        users.destroy();
        queue.destroy();
    });

    test('subscription survives clear() and fires on re-add', () => {
        const { queue, users } = setup();
        users.upsertMany([
            { id: 'u1', name: 'A' },
            { id: 'u2', name: 'B' },
        ]);
        let u1 = 0;
        users.subscribeOnKey('u1', () => u1++);

        users.clear();
        queue.flush();
        expect(u1).toBe(1); // notified of the clear
        expect(users.getOneByPk('u1')).toBeUndefined();
        expect(users.getHandlerCount('u1')).toBe(1); // still subscribed

        users.upsertOne({ id: 'u1', name: 'A2' });
        queue.flush();
        expect(u1).toBe(2);

        users.destroy();
        queue.destroy();
    });

    test('multiple subscribers on the same pk all fire', () => {
        const { queue, users } = setup();
        users.upsertOne({ id: 'u1', name: 'Alice' });
        let a = 0;
        let b = 0;
        const unsubA = users.subscribeOnKey('u1', () => a++);
        users.subscribeOnKey('u1', () => b++);
        expect(users.getHandlerCount('u1')).toBe(2);

        users.upsertOneByPk('u1', { name: 'x' });
        queue.flush();
        expect(a).toBe(1);
        expect(b).toBe(1);

        // unsubscribing one stops only that one
        unsubA();
        expect(users.getHandlerCount('u1')).toBe(1);
        users.upsertOneByPk('u1', { name: 'y' });
        queue.flush();
        expect(a).toBe(1);
        expect(b).toBe(2);

        users.destroy();
        queue.destroy();
    });

    test('unsubscribe stops notifications and clears the handler count', () => {
        const { queue, users } = setup();
        users.upsertOne({ id: 'u1', name: 'Alice' });
        let calls = 0;
        const unsub = users.subscribeOnKey('u1', () => calls++);
        expect(users.hasSubscriptions()).toBe(true);

        unsub();
        expect(users.getHandlerCount('u1')).toBe(0);
        expect(users.hasSubscriptions()).toBe(false);

        users.upsertOneByPk('u1', { name: 'x' });
        queue.flush();
        expect(calls).toBe(0);

        users.destroy();
        queue.destroy();
    });

    test('an unrelated key does not fire', () => {
        const { queue, users } = setup();
        users.upsertMany([
            { id: 'u1', name: 'A' },
            { id: 'u2', name: 'B' },
        ]);
        let u1 = 0;
        users.subscribeOnKey('u1', () => u1++);

        users.upsertOneByPk('u2', { name: 'B2' });
        queue.flush();
        expect(u1).toBe(0);

        users.destroy();
        queue.destroy();
    });
});
