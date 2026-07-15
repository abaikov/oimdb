import {
    OIMEventQueue,
    OIMGlobalIndexManualArrayBased,
    OIMGlobalIndexManualSetBased,
    OIMReactiveCollection,
    OIMReactiveCollectionGlobalIndexManualArrayBased,
    OIMReactiveCollectionGlobalIndexManualSetBased,
    OIMReactiveGlobalIndexManualArrayBased,
    OIMReactiveGlobalIndexManualSetBased,
    TOIMAnyEntitySlot,
} from '../src';

type TEntity = { id: string; name: string };

const slot = (pk: string, name = pk): TOIMAnyEntitySlot<string> => ({
    pk,
    item: { id: pk, name },
});

describe('raw global (keyless) indexes', () => {
    test('OIMGlobalIndexManualSetBased writes and reads slots', () => {
        const index = new OIMGlobalIndexManualSetBased<string>();
        index.setSlots(new Set([slot('u1'), slot('u2')]));

        expect(index.getPks()).toEqual(new Set(['u1', 'u2']));
        expect(index.size).toBe(2);

        index.addSlots([slot('u3')]);
        expect(index.getPks()).toEqual(new Set(['u1', 'u2', 'u3']));

        index.clear();
        expect(index.isEmpty).toBe(true);
    });

    test('OIMGlobalIndexManualArrayBased preserves slot order', () => {
        const index = new OIMGlobalIndexManualArrayBased<string>();
        const slots = [slot('u1'), slot('u2')];
        index.setSlots(slots);

        expect(index.getPks()).toEqual(['u1', 'u2']);
        expect(index.getSlots()).toEqual(slots);
        expect(index.size).toBe(2);

        index.appendSlots([slot('u3')]);
        expect(index.getPks()).toEqual(['u1', 'u2', 'u3']);
    });

    test('reactive raw global indexes emit once per flush when slots change', () => {
        const queue = new OIMEventQueue();
        const setIndex = new OIMReactiveGlobalIndexManualSetBased<string>(queue);
        const arrayIndex = new OIMReactiveGlobalIndexManualArrayBased<string>(
            queue
        );
        const calls: string[] = [];

        setIndex.subscribe(() => calls.push('set'));
        arrayIndex.subscribe(() => calls.push('array'));

        setIndex.setSlots(new Set([slot('u1')]));
        setIndex.addSlots([slot('u2')]); // second write, same tick
        arrayIndex.setSlots([slot('u1')]);
        queue.flush();

        // Coalesced: one delivery per index despite two set-index writes.
        expect(calls).toEqual(['set', 'array']);
    });
});

describe('collection-bound global (keyless) PK indexes', () => {
    function createUsers() {
        const queue = new OIMEventQueue();
        const users = new OIMReactiveCollection<TEntity, string>(queue, {
            selectPk: user => user.id,
        });
        users.upsertMany([
            { id: 'u1', name: 'A' },
            { id: 'u2', name: 'B' },
            { id: 'u3', name: 'C' },
        ]);
        return { queue, users };
    }

    test('set-based resolves PK writes to canonical collection slots', () => {
        const { queue, users } = createUsers();
        const index = new OIMReactiveCollectionGlobalIndexManualSetBased<
            string,
            TEntity
        >(queue, { collection: users });

        index.setPks(['u1', 'u2']);
        index.addPks(['u3']);
        index.removePks(['u1']);

        expect(index.getPks()).toEqual(new Set(['u2', 'u3']));
        expect(index.getEntities<TEntity>()).toEqual([
            { id: 'u2', name: 'B' },
            { id: 'u3', name: 'C' },
        ]);
    });

    test('array-based resolves PK writes and preserves order', () => {
        const { queue, users } = createUsers();
        const index = new OIMReactiveCollectionGlobalIndexManualArrayBased<
            string,
            TEntity
        >(queue, { collection: users });

        index.setPks(['u2', 'u1']);
        index.addPks(['u3']);
        index.removePks(['u2']);

        expect(index.getPks()).toEqual(['u1', 'u3']);
        expect(index.getEntities<TEntity>()).toEqual([
            { id: 'u1', name: 'A' },
            { id: 'u3', name: 'C' },
        ]);
    });

    test('addPks dedups an already-present pk', () => {
        const { queue, users } = createUsers();
        const index = new OIMReactiveCollectionGlobalIndexManualArrayBased<
            string,
            TEntity
        >(queue, { collection: users });

        index.setPks(['u1']);
        index.addPks(['u1', 'u2']);
        expect(index.getPks()).toEqual(['u1', 'u2']);
    });

    test('PK writes for a missing slot are tolerated and fill in later', () => {
        const { queue, users } = createUsers();
        const index = new OIMReactiveCollectionGlobalIndexManualArrayBased<
            string,
            TEntity
        >(queue, { collection: users });

        expect(() => index.setPks(['missing'])).not.toThrow();
        expect(index.getPks()).toEqual(['missing']);
        expect(index.getEntities<TEntity>()).toEqual([undefined]);

        users.upsertOne({ id: 'missing', name: 'Z' });
        expect(index.getEntities<TEntity>()).toEqual([{ id: 'missing', name: 'Z' }]);
    });

    test('notifies a subscriber once on add and once on remove', () => {
        const { queue, users } = createUsers();
        const index = new OIMReactiveCollectionGlobalIndexManualArrayBased<
            string,
            TEntity
        >(queue, { collection: users });

        let count = 0;
        index.subscribe(() => count++);

        index.setPks(['u1']);
        queue.flush();
        expect(count).toBe(1);

        index.addPks(['u2']);
        queue.flush();
        expect(count).toBe(2);

        index.removePks(['u1']);
        queue.flush();
        expect(count).toBe(3);
    });
});
