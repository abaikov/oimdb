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
        wrapper.changedPksEventEmitter.subscribeOnKey('u1', () =>
            pkEvents.push('u1')
        );
        wrapper.changedFieldsEventEmitter.subscribeOnKey('a', () =>
            fieldEvents.push('a')
        );

        wrapper.upsertOneByPk('u1', { a: 1, b: 'x' });
        queue.flush();

        const fields = Array.from(wrapper.getChangedFieldsByPk('u1')).sort();
        expect(fields).toEqual(['a', 'b']);
        expect(Array.from(wrapper.getChangedPksByField('a'))).toEqual(['u1']);
        expect(pkEvents).toEqual(['u1']);
        expect(fieldEvents).toEqual(['a']);
    });
});
