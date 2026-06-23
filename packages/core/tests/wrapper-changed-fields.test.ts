import { OIMCollectionChangedFields } from '../src/modules/wrapper/collection/OIMCollectionChangedFields';
import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMReactiveCollection } from '../src/core/OIMReactiveCollection';

type TEntity = { id: string; a?: number; b?: string };

describe('OIMCollectionChangedFields', () => {
    test('tracks changed fields per pk and emits pk/field updates', () => {
        const queue = new OIMEventQueue();
        const collection = new OIMReactiveCollection<TEntity, string>(queue);
        const wrapper = new OIMCollectionChangedFields<TEntity, string>(
            queue,
            collection,
            { selectPk: (e: TEntity | Partial<TEntity>) => (e as TEntity).id }
        );

        const pkEvents: string[] = [];
        const fieldEvents: string[] = [];
        let fieldsSnapshot: string[] = [];
        let pksForASnapshot: string[] = [];
        wrapper.changedPksEventEmitter.subscribeOnKey('u1', () =>
            pkEvents.push('u1')
        );
        wrapper.changedFieldsEventEmitter.subscribeOnKey('a', () => {
            fieldEvents.push('a');
            fieldsSnapshot = Array.from(
                wrapper.getChangedFieldsByPk('u1')
            ).sort();
            pksForASnapshot = Array.from(
                wrapper.getChangedPksByField('a')
            ).sort();
        });

        wrapper.upsertOneByPk('u1', { a: 1, b: 'x' });
        queue.flush();

        expect(fieldsSnapshot).toEqual(['a', 'b']);
        expect(pksForASnapshot).toEqual(['u1']);
        expect(pkEvents).toEqual(['u1']);
        expect(fieldEvents).toEqual(['a']);

        // Buffers are flush-scoped: they must be cleared after flush completes.
        expect(Array.from(wrapper.getChangedFieldsByPk('u1'))).toEqual([]);
        expect(Array.from(wrapper.getChangedPksByField('a'))).toEqual([]);
    });

    test('detects external collection writes and infers changed fields by diffing snapshots', () => {
        const queue = new OIMEventQueue();
        const collection = new OIMReactiveCollection<TEntity, string>(queue);
        const wrapper = new OIMCollectionChangedFields<TEntity, string>(
            queue,
            collection,
            { selectPk: (e: TEntity | Partial<TEntity>) => (e as TEntity).id }
        );

        const snapshots: string[][] = [];
        wrapper.changedPksEventEmitter.subscribeOnKey('u1', () => {
            const fieldsSnapshot = Array.from(
                wrapper.getChangedFieldsByPk('u1')
            ).sort();
            snapshots.push(fieldsSnapshot);
        });

        // Bypass wrapper
        collection.upsertOneByPk('u1', { a: 1, b: 'x' });
        queue.flush();

        collection.upsertOneByPk('u1', { a: 2 });
        queue.flush();

        expect(snapshots).toEqual([['a', 'b'], ['a']]);
    });

    test('detectExternalMutations: false skips external detection (and snapshots)', () => {
        const queue = new OIMEventQueue();
        const collection = new OIMReactiveCollection<TEntity, string>(queue);
        const wrapper = new OIMCollectionChangedFields<TEntity, string>(
            queue,
            collection,
            {
                selectPk: (e: TEntity | Partial<TEntity>) => (e as TEntity).id,
                detectExternalMutations: false,
            }
        );

        const seen: string[][] = [];
        wrapper.changedPksEventEmitter.subscribeOnKey('u1', () => {
            seen.push(Array.from(wrapper.getChangedFieldsByPk('u1')).sort());
        });

        // Writes through the wrapper still track fields normally.
        wrapper.upsertOneByPk('u1', { a: 1, b: 'x' });
        queue.flush();
        expect(seen).toEqual([['a', 'b']]);

        // A write that bypasses the wrapper is NOT detected (no subscription).
        seen.length = 0;
        collection.upsertOneByPk('u1', { a: 99 });
        queue.flush();
        expect(seen).toEqual([]);
    });

    test('returns canonical slots from wrapped upserts', () => {
        const queue = new OIMEventQueue();
        const collection = new OIMReactiveCollection<TEntity, string>(queue);
        const wrapper = new OIMCollectionChangedFields<TEntity, string>(
            queue,
            collection,
            { selectPk: (e: TEntity | Partial<TEntity>) => (e as TEntity).id }
        );

        const slot = wrapper.upsertOne({ id: 'u1', a: 1 });
        const updatedSlot = wrapper.upsertOneByPk('u1', { b: 'x' });
        const manySlots = wrapper.upsertMany([{ id: 'u2', a: 2 }]);

        expect(updatedSlot).toBe(slot);
        expect(slot).toBe(collection.getSlotByPk('u1'));
        expect(slot.item).toEqual({ id: 'u1', a: 1, b: 'x' });
        expect(manySlots).toEqual([collection.getSlotByPk('u2')]);
    });
});
