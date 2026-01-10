import { OIMCollectionChangedFieldsWrapper } from '../src/modules/wrapper/collection/OIMCollectionChangedFieldsWrapper';
import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMReactiveCollection } from '../src/core/OIMReactiveCollection';

type TEntity = { id: string; a?: number; b?: string };

describe('OIMCollectionChangedFieldsWrapper', () => {
    test('tracks changed fields per pk and emits pk/field updates', () => {
        const queue = new OIMEventQueue();
        const collection = new OIMReactiveCollection<TEntity, string>(queue);
        const wrapper = new OIMCollectionChangedFieldsWrapper<TEntity, string>(
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
        const wrapper = new OIMCollectionChangedFieldsWrapper<TEntity, string>(
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
});
