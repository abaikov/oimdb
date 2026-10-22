import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMReactiveCollection } from '../src/core/OIMReactiveCollection';
import { OIMCollectionIndexFactory } from '../src/core/OIMCollectionIndexFactory';
import { OIMSlotWriterFieldMasked } from '../src/core/OIMSlotWriterFieldMasked';
import { createMergeEntityUpdater } from '../src/core/createMergeEntityUpdater';

type TUser = { id: string; teamId: string; name: string; active: boolean };

const rows: TUser[] = [
    { id: 'u1', teamId: 't0', name: 'a', active: true },
    { id: 'u2', teamId: 't0', name: 'b', active: true },
    { id: 'u3', teamId: 't1', name: 'c', active: false },
];

/** A collection whose writer tracks fields — the precondition for `deps`. */
const fieldAware = () => {
    const queue = new OIMEventQueue();
    const collection = new OIMReactiveCollection<TUser, string>(queue, {
        selectPk: u => u.id,
        slotWriter: new OIMSlotWriterFieldMasked<TUser, string>(
            queue,
            createMergeEntityUpdater<TUser>()
        ),
    });
    return { queue, collection, factory: new OIMCollectionIndexFactory(queue, collection) };
};

const plain = () => {
    const queue = new OIMEventQueue();
    const collection = new OIMReactiveCollection<TUser, string>(queue, {
        selectPk: u => u.id,
    });
    return { queue, collection, factory: new OIMCollectionIndexFactory(queue, collection) };
};

describe('derived index deps', () => {
    it('skips the key selector when no declared field was written', () => {
        const { queue, collection, factory } = fieldAware();
        let selectorCalls = 0;
        factory.derivedSetIndex<string>(
            u => {
                selectorCalls++;
                return u.teamId;
            },
            { deps: ['teamId'] }
        );
        collection.upsertMany(rows);
        queue.flush();
        selectorCalls = 0;

        for (let i = 0; i < 10; i++) {
            collection.upsertOneByPk('u1', { name: `n${i}` });
            queue.flush();
        }
        // `name` is not a dep, so the index never had to look.
        expect(selectorCalls).toBe(0);
    });

    it('still runs when a declared field is written', () => {
        const { queue, collection, factory } = fieldAware();
        let selectorCalls = 0;
        const index = factory.derivedSetIndex<string>(
            u => {
                selectorCalls++;
                return u.teamId;
            },
            { deps: ['teamId'] }
        );
        collection.upsertMany(rows);
        queue.flush();
        selectorCalls = 0;

        collection.upsertOneByPk('u1', { teamId: 't1' });
        queue.flush();

        expect(selectorCalls).toBeGreaterThan(0);
        expect([...index.getPksByKey('t0')]).toEqual(['u2']);
        expect([...index.getPksByKey('t1')].sort()).toEqual(['u1', 'u3']);
    });

    it('keeps membership correct across many unrelated writes', () => {
        const { queue, collection, factory } = fieldAware();
        const index = factory.derivedSetIndex<string>(u => u.teamId, {
            deps: ['teamId'],
        });
        collection.upsertMany(rows);
        queue.flush();

        // A long run of writes the index is allowed to ignore must not leave it
        // stale for the one write that matters.
        for (let i = 0; i < 50; i++) {
            collection.upsertOneByPk('u1', { name: `n${i}`, active: i % 2 === 0 });
            queue.flush();
        }
        collection.upsertOneByPk('u1', { teamId: 't1' });
        queue.flush();

        expect([...index.getPksByKey('t0')]).toEqual(['u2']);
        expect([...index.getPksByKey('t1')].sort()).toEqual(['u1', 'u3']);
    });

    it('honours deps that cover an ordering field too', () => {
        const { queue, collection, factory } = fieldAware();
        let orderCalls = 0;
        const index = factory.derivedArrayIndex<string>(u => u.teamId, {
            deps: ['teamId', 'name'],
            orderBy: u => {
                orderCalls++;
                return u.name;
            },
        });
        collection.upsertMany(rows);
        queue.flush();
        orderCalls = 0;

        collection.upsertOneByPk('u1', { active: false });
        queue.flush();
        expect(orderCalls).toBe(0); // `active` is not a dep

        collection.upsertOneByPk('u1', { name: 'z' });
        queue.flush();
        expect(index.getPksByKey('t0')).toEqual(['u2', 'u1']); // re-sorted
    });

    it('behaves exactly as before when deps are not declared', () => {
        const { queue, collection, factory } = fieldAware();
        let selectorCalls = 0;
        factory.derivedSetIndex<string>(u => {
            selectorCalls++;
            return u.teamId;
        });
        collection.upsertMany(rows);
        queue.flush();
        selectorCalls = 0;

        collection.upsertOneByPk('u1', { name: 'x' });
        queue.flush();
        // No declaration means no licence to skip.
        expect(selectorCalls).toBeGreaterThan(0);
    });

    it('refuses deps on a collection that cannot track fields', () => {
        const { factory } = plain();
        expect(() =>
            factory.derivedSetIndex<string>(u => u.teamId, { deps: ['teamId'] })
        ).toThrow(/does not track fields/i);
    });
});
