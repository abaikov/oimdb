import {
    OIMEventQueue,
    OIMReactiveCollection,
    OIMCollectionStoreTrieDriven,
    createOIMCollectionIndexFactory,
    TOIMKeyPath,
} from '../src';

type Membership = { userId: number; projectId: number; role: string };

function makeCollection() {
    const queue = new OIMEventQueue();
    // Composite PK: [userId, projectId]. The trie-driven store matches PK paths
    // by content and interns them.
    const memberships = new OIMReactiveCollection<Membership, TOIMKeyPath>(
        queue,
        {
            selectPk: m => [m.userId, m.projectId],
            store: new OIMCollectionStoreTrieDriven<Membership>(),
        }
    );
    return { queue, memberships };
}

describe('composite-PK collection', () => {
    test('stores and reads by a PK path built fresh each call', () => {
        const { queue, memberships } = makeCollection();
        memberships.upsertOne({ userId: 1, projectId: 10, role: 'admin' });

        // A brand-new [1, 10] array resolves to the same entity.
        expect(memberships.getOneByPk([1, 10])).toEqual({
            userId: 1,
            projectId: 10,
            role: 'admin',
        });
        // A different path does not collide.
        expect(memberships.getOneByPk([1, 11])).toBeUndefined();
        // `1` vs `"1"` stay distinct segments — no accidental match.
        expect(memberships.getOneByPk(['1', 10])).toBeUndefined();

        memberships.destroy();
        queue.destroy();
    });

    test('merge-updates the same entity across fresh PK paths', () => {
        const { queue, memberships } = makeCollection();
        memberships.upsertOne({ userId: 2, projectId: 20, role: 'member' });
        memberships.upsertOneByPk([2, 20], { role: 'owner' });

        expect(memberships.getOneByPk([2, 20])).toEqual({
            userId: 2,
            projectId: 20,
            role: 'owner',
        });
        expect(memberships.countAll()).toBe(1);

        memberships.destroy();
        queue.destroy();
    });

    test('notifies a subscriber keyed by an equal-content PK path', () => {
        const { queue, memberships } = makeCollection();
        let calls = 0;
        const unsub = memberships.subscribeOnKey([3, 30], () => {
            calls++;
        });

        memberships.upsertOne({ userId: 3, projectId: 30, role: 'admin' });
        queue.flush();
        expect(calls).toBe(1);

        // Unrelated PK must not fire this subscriber.
        memberships.upsertOne({ userId: 3, projectId: 31, role: 'admin' });
        queue.flush();
        expect(calls).toBe(1);

        unsub();
        memberships.upsertOneByPk([3, 30], { role: 'member' });
        queue.flush();
        expect(calls).toBe(1);

        memberships.destroy();
        queue.destroy();
    });

    test('removes by a fresh PK path', () => {
        const { queue, memberships } = makeCollection();
        memberships.upsertOne({ userId: 4, projectId: 40, role: 'admin' });
        expect(memberships.getOneByPk([4, 40])).toBeDefined();

        memberships.removeOneByPk([4, 40]);
        expect(memberships.getOneByPk([4, 40])).toBeUndefined();
        expect(memberships.countAll()).toBe(0);

        memberships.destroy();
        queue.destroy();
    });

    test('a set index over a composite-PK collection: setPks/addPks/removePks by composite PK', () => {
        const { queue, memberships } = makeCollection();
        memberships.upsertMany([
            { userId: 1, projectId: 10, role: 'admin' },
            { userId: 2, projectId: 10, role: 'admin' },
            { userId: 3, projectId: 10, role: 'admin' },
        ]);
        // Index key = role (primitive); indexed PKs are composite [userId, projectId].
        const byRole = createOIMCollectionIndexFactory(
            queue,
            memberships
        ).setBasedIndex<string>();

        byRole.setPks('admin', [[1, 10], [2, 10]]);
        expect(byRole.getPksByKey('admin')).toEqual(
            new Set([
                [1, 10],
                [2, 10],
            ])
        );

        // addPks dedups a composite PK built fresh (content, not reference).
        byRole.addPks('admin', [[2, 10], [3, 10]]);
        expect(byRole.getEntitiesByKey('admin')).toEqual([
            { userId: 1, projectId: 10, role: 'admin' },
            { userId: 2, projectId: 10, role: 'admin' },
            { userId: 3, projectId: 10, role: 'admin' },
        ]);

        // removePks by a fresh composite PK must find & remove it (the case that
        // needs the trie-backed membership).
        byRole.removePks('admin', [[2, 10]]);
        expect(byRole.getPksByKey('admin')).toEqual(
            new Set([
                [1, 10],
                [3, 10],
            ])
        );

        byRole.destroy();
        memberships.destroy();
        queue.destroy();
    });

    test('slot.pk is interned to one canonical reference per logical key', () => {
        const { queue, memberships } = makeCollection();
        const slotA = memberships.upsertOne({
            userId: 5,
            projectId: 50,
            role: 'admin',
        });
        const slotB = memberships.upsertOneByPk([5, 50], { role: 'owner' });

        // Same logical key → same slot and the same canonical pk reference.
        expect(slotB).toBe(slotA);
        expect(slotB.pk).toBe(slotA.pk);

        memberships.destroy();
        queue.destroy();
    });
});
