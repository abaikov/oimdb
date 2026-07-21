import {
    OIMEventQueue,
    OIMReactiveCollection,
    createOIMCollectionIndexFactory,
    OIMTrieSet,
    OIMPkCodecKeyPath,
} from '../src';

type User = { id: string; team: string };

function setup() {
    const queue = new OIMEventQueue();
    const users = new OIMReactiveCollection<User, string>(queue, {
        selectPk: u => u.id,
    });
    users.upsertMany([
        { id: 'u1', team: 't1' },
        { id: 'u2', team: 't1' },
    ]);
    const index = createOIMCollectionIndexFactory(queue, users).setBasedIndex<
        string
    >();
    return { queue, users, index };
}

describe('bucket-as-carrier subscription semantics', () => {
    test('a subscription placed BEFORE data fires when data arrives', () => {
        const { queue, users, index } = setup();
        let calls = 0;
        // Subscribe to a key with no bucket yet — reserves an empty carrier bucket.
        index.subscribeOnKey('t1', () => calls++);

        index.setPks('t1', ['u1', 'u2']);
        queue.flush();
        expect(calls).toBe(1);

        index.destroy();
        users.destroy();
        queue.destroy();
    });

    test('a subscription survives its key going empty and re-filling', () => {
        const { queue, users, index } = setup();
        index.setPks('t1', ['u1', 'u2']);
        let calls = 0;
        index.subscribeOnKey('t1', () => calls++);

        // Empty the key entirely — the bucket must be retained (subscribed).
        index.removePks('t1', ['u1', 'u2']);
        queue.flush();
        expect(calls).toBe(1);
        expect(index.getPksByKey('t1')).toEqual(new Set());

        // Re-add: same subscription still fires.
        index.setPks('t1', ['u1']);
        queue.flush();
        expect(calls).toBe(2);
        expect(index.getPksByKey('t1')).toEqual(new Set(['u1']));

        index.destroy();
        users.destroy();
        queue.destroy();
    });

    test('unsubscribing the last handler prunes an empty key', () => {
        const { queue, users, index } = setup();
        const unsub = index.subscribeOnKey('t1', () => {});
        expect(index.hasSubscriptions()).toBe(true);
        // Key never got data → empty reserved bucket, dropped on last unsub.
        unsub();
        expect(index.hasSubscriptions()).toBe(false);
        expect(index.getKeys()).toEqual([]);

        index.destroy();
        users.destroy();
        queue.destroy();
    });

    test('remove-by-pk works after slots were written via the lower-level path', () => {
        const { queue, users, index } = setup();
        // setSlots is the lower-level (slot) API — no membership built yet.
        const slots = users.getSlotsByPks(['u1', 'u2']);
        index.setSlots('t1', slots);
        expect(index.getPksByKey('t1')).toEqual(new Set(['u1', 'u2']));

        // removePks must lazily seed membership from the bucket and still remove.
        index.removePks('t1', ['u1']);
        expect(index.getPksByKey('t1')).toEqual(new Set(['u2']));

        index.destroy();
        users.destroy();
        queue.destroy();
    });
});

describe('array-based bucket-as-carrier subscription semantics', () => {
    function setupArray() {
        const queue = new OIMEventQueue();
        const users = new OIMReactiveCollection<User, string>(queue, {
            selectPk: u => u.id,
        });
        users.upsertMany([
            { id: 'u1', team: 't1' },
            { id: 'u2', team: 't1' },
        ]);
        const index = createOIMCollectionIndexFactory(
            queue,
            users
        ).arrayBasedIndex<string>();
        return { queue, users, index };
    }

    test('subscription before data fires, and survives the key emptying', () => {
        const { queue, users, index } = setupArray();
        let calls = 0;
        index.subscribeOnKey('t1', () => calls++);

        index.setPks('t1', ['u2', 'u1']); // ordered
        queue.flush();
        expect(calls).toBe(1);
        expect(index.getPksByKey('t1')).toEqual(['u2', 'u1']);

        index.removePks('t1', ['u1', 'u2']);
        queue.flush();
        expect(calls).toBe(2);

        index.setPks('t1', ['u1']);
        queue.flush();
        expect(calls).toBe(3);
        expect(index.getPksByKey('t1')).toEqual(['u1']);

        index.destroy();
        users.destroy();
        queue.destroy();
    });
});

describe('OIMTrieSet', () => {
    test('membership by content, distinct segment types, prune on delete', () => {
        const set = new OIMTrieSet();
        set.add([1, 2]);
        set.add(['1', 2]);
        expect(set.has([1, 2])).toBe(true); // fresh array, same content
        expect(set.has(['1', 2])).toBe(true);
        expect(set.has([1, 3])).toBe(false);
        expect(set.size).toBe(2);

        expect(set.delete([1, 2])).toBe(true);
        expect(set.has([1, 2])).toBe(false);
        expect(set.size).toBe(1);
        expect(Array.from(set.values())).toEqual([['1', 2]]);

        set.clear();
        expect(set.size).toBe(0);
    });
});

describe('OIMPkCodecKeyPath', () => {
    test('round-trips a key path, preserving segment types', () => {
        const codec = new OIMPkCodecKeyPath();
        const encoded = codec.encode(['u1', 42, 'admin']);
        expect(typeof encoded).toBe('string');
        expect(codec.decode(encoded)).toEqual(['u1', 42, 'admin']);
    });

    test('no separator collision (unlike string concatenation)', () => {
        const codec = new OIMPkCodecKeyPath();
        // These would collide as "a|b|c"; JSON encoding keeps them distinct.
        expect(codec.encode(['a|b', 'c'])).not.toBe(codec.encode(['a', 'b|c']));
    });
});
