import {
    OIMEventQueue,
    OIMIndexManualArrayBased,
    OIMIndexManualSetBased,
    OIMReactiveCollection,
    OIMReactiveCollectionIndexManualArrayBased,
    OIMReactiveCollectionIndexManualSetBased,
    OIMReactiveIndexManualArrayBased,
    OIMReactiveIndexManualSetBased,
    TOIMAnyEntitySlot,
} from '../src';

type TEntity = { id: string; name: string };

const slot = (pk: string, name = pk): TOIMAnyEntitySlot<string> => ({
    pk,
    item: { id: pk, name },
});

describe('raw slot indexes', () => {
    test('OIMIndexManualSetBased writes and reads slots', () => {
        const index = new OIMIndexManualSetBased<string, string>();
        const slots = new Set([slot('u1'), slot('u2')]);

        index.setSlots('team1', slots);

        expect(index.getPksByKey('team1')).toEqual(new Set(['u1', 'u2']));
        expect(Array.from(index.getSlotsByKey('team1'))).toEqual(
            Array.from(slots)
        );
        expect(index.getKeySize('team1')).toBe(2);

        index.clear('team1');
        expect(index.hasKey('team1')).toBe(false);
    });

    test('OIMIndexManualArrayBased preserves slot order', () => {
        const index = new OIMIndexManualArrayBased<string, string>();
        const slots = [slot('u1'), slot('u2')];

        index.setSlots('team1', slots);

        expect(index.getPksByKey('team1')).toEqual(['u1', 'u2']);
        expect(index.getSlotsByKey('team1')).toEqual(slots);
        expect(index.getKeySize('team1')).toBe(2);
    });

    test('reactive raw indexes emit when slots change', () => {
        const queue = new OIMEventQueue();
        const setIndex = new OIMReactiveIndexManualSetBased<string, string>(
            queue
        );
        const arrayIndex = new OIMReactiveIndexManualArrayBased<string, string>(
            queue
        );
        const calls: string[] = [];

        setIndex.subscribeOnKey('team1', () => calls.push('set'));
        arrayIndex.subscribeOnKey('team1', () => calls.push('array'));

        setIndex.setSlots('team1', new Set([slot('u1')]));
        arrayIndex.setSlots('team1', [slot('u1')]);
        queue.flush();

        expect(calls).toEqual(['set', 'array']);
    });
});

describe('collection-bound PK indexes', () => {
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

    test('SetBased resolves PK writes to canonical collection slots', () => {
        const { queue, users } = createUsers();
        const index = new OIMReactiveCollectionIndexManualSetBased<
            string,
            string,
            TEntity
        >(queue, { collection: users });

        index.setPks('team1', ['u1', 'u2']);
        index.addPks('team1', ['u3']);
        index.removePks('team1', ['u1']);

        expect(index.getPksByKey('team1')).toEqual(new Set(['u2', 'u3']));
        expect(index.getEntitiesByKey<TEntity>('team1')).toEqual([
            { id: 'u2', name: 'B' },
            { id: 'u3', name: 'C' },
        ]);
        expect(Array.from(index.getSlotsByKey('team1')).map(s => s.item)).toEqual(
            [
                { id: 'u2', name: 'B' },
                { id: 'u3', name: 'C' },
            ]
        );
    });

    test('ArrayBased resolves PK writes and preserves order', () => {
        const { queue, users } = createUsers();
        const index = new OIMReactiveCollectionIndexManualArrayBased<
            string,
            string,
            TEntity
        >(queue, { collection: users });

        index.setPks('team1', ['u2', 'u1']);
        index.addPks('team1', ['u3']);
        index.removePks('team1', ['u2']);

        expect(index.getPksByKey('team1')).toEqual(['u1', 'u3']);
        expect(index.getEntitiesByKey<TEntity>('team1')).toEqual([
            { id: 'u1', name: 'A' },
            { id: 'u3', name: 'C' },
        ]);
        expect(index.getSlotsByKey('team1').map(s => s.item)).toEqual([
            { id: 'u1', name: 'A' },
            { id: 'u3', name: 'C' },
        ]);
    });

    test('PK writes for a missing slot are tolerated and fill in later', () => {
        const { queue, users } = createUsers();
        const index = new OIMReactiveCollectionIndexManualArrayBased<
            string,
            string,
            TEntity
        >(queue, { collection: users });

        // Indexing a pk whose entity has not arrived yet must not throw; the
        // entity simply does not materialize until it exists.
        expect(() => index.setPks('team1', ['missing'])).not.toThrow();
        expect(index.getPksByKey('team1')).toEqual(['missing']);
        expect(index.getEntitiesByKey<TEntity>('team1')).toEqual([]);

        // The reserved slot is a stable reference: once the entity is written,
        // it fills in without re-indexing.
        users.upsertOne({ id: 'missing', name: 'Z' });
        expect(index.getEntitiesByKey<TEntity>('team1')).toEqual([
            { id: 'missing', name: 'Z' },
        ]);
    });
});
