/// <reference types="jest" />

import {
    OIMCollectionByPkSelector,
    OIMComputeRuntime,
    OIMEntitiesByIndexKeyArrayBasedSelector,
    OIMEntitiesByIndexKeySetBasedSelector,
    OIMEventQueue,
    OIMReactiveCollection,
    OIMReactiveCollectionIndexManualArrayBased,
    OIMReactiveCollectionIndexManualSetBased,
} from '../src';

type TUser = { id: string; name: string; groupId?: string };

describe('selectors', () => {
    test('OIMCollectionByPkSelector.watch is coalesced on flush and cancellable before flush', () => {
        const queue = new OIMEventQueue();
        const runtime = new OIMComputeRuntime(queue);
        const users = new OIMReactiveCollection<TUser, string>(queue, {
            selectPk: u => u.id,
        });

        users.upsertOne({ id: 'u1', name: 'A' });
        queue.flush();

        const selector = new OIMCollectionByPkSelector(runtime, users, 'u1');

        const seen: Array<TUser | undefined> = [];
        const unwatch = selector.watch(v => seen.push(v));
        expect(seen).toEqual([{ id: 'u1', name: 'A' }]);

        // Update, then unsubscribe before flush => no delivery
        users.upsertOneByPk('u1', { name: 'B' });
        unwatch();
        queue.flush();
        expect(seen).toEqual([{ id: 'u1', name: 'A' }]);

        // Watch again, update, flush => delivery happens once
        selector.watch(v => seen.push(v));
        users.upsertOneByPk('u1', { name: 'C' });
        queue.flush();
        expect(seen[seen.length - 1]).toEqual({ id: 'u1', name: 'C' });
    });

    test('OIMEntitiesByIndexKeySetBasedSelector resubscribes collection keys when index changes', () => {
        const queue = new OIMEventQueue();
        const runtime = new OIMComputeRuntime(queue);
        const users = new OIMReactiveCollection<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        const byGroup = new OIMReactiveCollectionIndexManualSetBased<
            string,
            string,
            TUser
        >(queue, { collection: users });

        users.upsertMany([
            { id: 'u1', name: 'A', groupId: 'g1' },
            { id: 'u2', name: 'B', groupId: 'g1' },
            { id: 'u3', name: 'C', groupId: 'g2' },
        ]);

        byGroup.setPks('g1', ['u1', 'u2']);
        queue.flush();

        const selector = new OIMEntitiesByIndexKeySetBasedSelector(
            runtime,
            users,
            byGroup,
            'g1'
        );

        const seen: Array<readonly (TUser | undefined)[]> = [];
        selector.watch(v => seen.push(v));
        expect(seen[0].map(e => e?.id)).toEqual(['u1', 'u2']);

        // Change index membership => selector should resubscribe and update value
        byGroup.setPks('g1', ['u2']);
        queue.flush();
        expect(seen[seen.length - 1].map(e => e?.id)).toEqual(['u2']);

        // Update u2 => selector should react (still subscribed to u2)
        users.upsertOneByPk('u2', { name: 'B2' });
        queue.flush();
        expect(seen[seen.length - 1][0]?.name).toBe('B2');
    });

    test('OIMEntitiesByIndexKeyArrayBasedSelector reads through canonical slots', () => {
        const queue = new OIMEventQueue();
        const runtime = new OIMComputeRuntime(queue);
        const users = new OIMReactiveCollection<TUser, string>(queue, {
            selectPk: u => u.id,
        });
        const byGroup = new OIMReactiveCollectionIndexManualArrayBased<
            string,
            string,
            TUser
        >(queue, { collection: users });

        users.upsertMany([
            { id: 'u1', name: 'A', groupId: 'g1' },
            { id: 'u2', name: 'B', groupId: 'g1' },
        ]);
        byGroup.setPks('g1', ['u1', 'u2']);
        queue.flush();

        const selector = new OIMEntitiesByIndexKeyArrayBasedSelector(
            runtime,
            users,
            byGroup,
            'g1'
        );

        const seen: Array<readonly (TUser | undefined)[]> = [];
        selector.watch(v => seen.push(v));
        expect(seen[0].map(e => e?.name)).toEqual(['A', 'B']);

        users.upsertOneByPk('u2', { name: 'B2' });
        queue.flush();
        expect(seen[seen.length - 1].map(e => e?.name)).toEqual(['A', 'B2']);

        users.removeOneByPk('u1');
        queue.flush();
        expect(seen[seen.length - 1].map(e => e?.name)).toEqual([
            undefined,
            'B2',
        ]);
        expect(byGroup.getPksByKey('g1')).toEqual(['u1', 'u2']);
    });
});


