import {
    createOIMCollectionIndexFactory,
    createOIMCollectionKit,
    OIMEventQueue,
    OIMReactiveCollection,
} from '../src';

type Member = { id: string; name: string };

function setup() {
    const queue = new OIMEventQueue();
    const members = new OIMReactiveCollection<Member, string>(queue, {
        selectPk: m => m.id,
    });
    members.upsertMany([
        { id: 'm1', name: 'Alice' },
        { id: 'm2', name: 'Bob' },
        { id: 'm3', name: 'Carol' },
    ]);
    const indexFactory = createOIMCollectionIndexFactory(queue, members);
    return { queue, members, indexFactory };
}

describe('composite (trie-backed) collection index', () => {
    test('looks up by a full key path built fresh each call', () => {
        const { queue, members, indexFactory } = setup();
        const byUserProjectRole = indexFactory.compositeSetIndex();

        byUserProjectRole.setPks(['u1', 'p1', 'admin'], ['m1', 'm2']);

        // A brand-new array with equal content must resolve to the same bucket.
        expect(byUserProjectRole.getPksByKey(['u1', 'p1', 'admin'])).toEqual(
            new Set(['m1', 'm2'])
        );
        expect(
            byUserProjectRole.getEntitiesByKey(['u1', 'p1', 'admin'])
        ).toEqual([
            { id: 'm1', name: 'Alice' },
            { id: 'm2', name: 'Bob' },
        ]);
        // A different path does not collide.
        expect(byUserProjectRole.getPksByKey(['u1', 'p1', 'member'])).toEqual(
            new Set()
        );

        byUserProjectRole.destroy();
        members.destroy();
        queue.destroy();
    });

    test('add / remove pks mutate the right bucket', () => {
        const { queue, members, indexFactory } = setup();
        const index = indexFactory.compositeSetIndex();

        index.setPks(['t', 1], ['m1']);
        index.addPks(['t', 1], ['m2', 'm3']);
        expect(index.getPksByKey(['t', 1])).toEqual(
            new Set(['m1', 'm2', 'm3'])
        );

        index.removePks(['t', 1], ['m2']);
        expect(index.getPksByKey(['t', 1])).toEqual(new Set(['m1', 'm3']));

        index.destroy();
        members.destroy();
        queue.destroy();
    });

    test('paths of different lengths do not collide', () => {
        const { queue, members, indexFactory } = setup();
        const index = indexFactory.compositeSetIndex();

        index.setPks(['a', 'b'], ['m1']);
        index.setPks(['a', 'b', 'c'], ['m2']);

        expect(index.getPksByKey(['a', 'b'])).toEqual(new Set(['m1']));
        expect(index.getPksByKey(['a', 'b', 'c'])).toEqual(new Set(['m2']));

        index.destroy();
        members.destroy();
        queue.destroy();
    });

    test('notifies a subscriber keyed by an equal-content path', () => {
        const { queue, members, indexFactory } = setup();
        const index = indexFactory.compositeSetIndex();
        let calls = 0;

        const unsub = index.subscribeOnKey(['u1', 'p1'], () => {
            calls++;
        });

        // Write with a different array instance of the same path.
        index.setPks(['u1', 'p1'], ['m1']);
        queue.flush();
        expect(calls).toBe(1);

        // A write to an unrelated path must not fire this subscriber.
        index.setPks(['u2', 'p2'], ['m2']);
        queue.flush();
        expect(calls).toBe(1);

        unsub();
        index.setPks(['u1', 'p1'], ['m3']);
        queue.flush();
        expect(calls).toBe(1);

        index.destroy();
        members.destroy();
        queue.destroy();
    });

    test('reflects live entity updates through resolved slots', () => {
        const { queue, members, indexFactory } = setup();
        const index = indexFactory.compositeSetIndex();

        index.setPks(['g', 1], ['m1']);
        expect(index.getEntitiesByKey(['g', 1])).toEqual([
            { id: 'm1', name: 'Alice' },
        ]);

        members.upsertOne({ id: 'm1', name: 'Alice Renamed' });
        expect(index.getEntitiesByKey(['g', 1])).toEqual([
            { id: 'm1', name: 'Alice Renamed' },
        ]);

        index.destroy();
        members.destroy();
        queue.destroy();
    });

    test('clear removes a single key path and prunes membership', () => {
        const { queue, members, indexFactory } = setup();
        const index = indexFactory.compositeSetIndex();

        index.setPks(['x', 1], ['m1']);
        index.setPks(['x', 2], ['m2']);

        index.clear(['x', 1]);
        expect(index.getPksByKey(['x', 1])).toEqual(new Set());
        expect(index.getPksByKey(['x', 2])).toEqual(new Set(['m2']));

        index.clear();
        expect(index.getPksByKey(['x', 2])).toEqual(new Set());

        index.destroy();
        members.destroy();
        queue.destroy();
    });
});

describe('composite (trie-backed) array-based collection index', () => {
    test('keeps insertion order and looks up by a fresh key path', () => {
        const { queue, members, indexFactory } = setup();
        const ordered = indexFactory.compositeArrayIndex();

        ordered.setPks(['c1', 't1'], ['m3', 'm1']);
        ordered.addPks(['c1', 't1'], ['m2']);

        // Ordered: getPksByKey returns an array preserving write order.
        expect(ordered.getPksByKey(['c1', 't1'])).toEqual(['m3', 'm1', 'm2']);
        expect(ordered.getEntitiesByKey(['c1', 't1'])).toEqual([
            { id: 'm3', name: 'Carol' },
            { id: 'm1', name: 'Alice' },
            { id: 'm2', name: 'Bob' },
        ]);

        ordered.removePks(['c1', 't1'], ['m1']);
        expect(ordered.getPksByKey(['c1', 't1'])).toEqual(['m3', 'm2']);

        ordered.destroy();
        members.destroy();
        queue.destroy();
    });

    test('notifies a subscriber keyed by an equal-content path', () => {
        const { queue, members, indexFactory } = setup();
        const ordered = indexFactory.compositeArrayIndex();
        let calls = 0;

        const unsub = ordered.subscribeOnKey(['c1', 't1'], () => {
            calls++;
        });
        ordered.setPks(['c1', 't1'], ['m1']);
        queue.flush();
        expect(calls).toBe(1);

        unsub();
        ordered.destroy();
        members.destroy();
        queue.destroy();
    });
});

describe('composite index selectors', () => {
    test('entitiesByCompositeSetIndexKey tracks index + entity changes', () => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<Member, string>(queue, {
            selectPk: m => m.id,
        });
        kit.collection.upsertMany([
            { id: 'm1', name: 'Alice' },
            { id: 'm2', name: 'Bob' },
        ]);
        const index = kit.indexFactory.compositeSetIndex();
        index.setPks(['p1', 'admin'], ['m1', 'm2']);

        const selector = kit.select.entitiesByCompositeSetIndexKey(
            index,
            ['p1', 'admin']
        );
        const seen: Array<readonly (Member | undefined)[]> = [];
        selector.watch(v => seen.push(v));
        expect(seen[seen.length - 1]).toEqual([
            { id: 'm1', name: 'Alice' },
            { id: 'm2', name: 'Bob' },
        ]);

        kit.collection.upsertOneByPk('m1', { name: 'Alicia' });
        queue.flush();
        expect(seen[seen.length - 1]).toEqual([
            { id: 'm1', name: 'Alicia' },
            { id: 'm2', name: 'Bob' },
        ]);

        kit.collection.destroy();
        queue.destroy();
    });

    test('entitiesByCompositeArrayIndexKey preserves order', () => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<Member, string>(queue, {
            selectPk: m => m.id,
        });
        kit.collection.upsertMany([
            { id: 'm1', name: 'Alice' },
            { id: 'm2', name: 'Bob' },
        ]);
        const index = kit.indexFactory.compositeArrayIndex();
        index.setPks(['c1', 't1'], ['m2', 'm1']);

        const selector = kit.select.entitiesByCompositeArrayIndexKey(
            index,
            ['c1', 't1']
        );
        expect(selector.getValue()).toEqual([
            { id: 'm2', name: 'Bob' },
            { id: 'm1', name: 'Alice' },
        ]);

        kit.collection.destroy();
        queue.destroy();
    });
});
