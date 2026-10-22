import { createOIMCollectionKit, OIMEventQueue } from '../src';

type Card = { id: string; title: string; position: number };

describe('DX selectors for keyless global indexes', () => {
    function setup() {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<Card, string>(queue, {
            selectPk: card => card.id,
        });
        kit.collection.upsertMany([
            { id: 'c1', title: 'One', position: 2 },
            { id: 'c2', title: 'Two', position: 1 },
        ]);
        return { queue, kit };
    }

    test('entitiesByArrayGlobalIndex reads ordered entities and coalesces updates', () => {
        const { queue, kit } = setup();
        const list = kit.indexFactory.derivedArrayGlobalIndex({
            orderBy: card => card.position,
        });
        const selector = kit.select.entitiesByArrayGlobalIndex(list);

        const values: (readonly (Card | undefined)[])[] = [];
        const unwatch = selector.watch(v => values.push(v));

        // Initial value delivered synchronously.
        expect(values[0]?.map(c => c?.id)).toEqual(['c2', 'c1']);

        kit.collection.upsertOne({ id: 'c3', title: 'Three', position: 0 });
        queue.flush();

        expect(values.length).toBe(2);
        expect(values[1]?.map(c => c?.id)).toEqual(['c3', 'c2', 'c1']);

        unwatch();
        list.destroy();
        kit.collection.destroy();
        queue.destroy();
    });

    test('entitiesBySetGlobalIndex reflects whole-collection membership', () => {
        const { queue, kit } = setup();
        const set = kit.indexFactory.derivedSetGlobalIndex();
        const selector = kit.select.entitiesBySetGlobalIndex(set);

        const values: (readonly (Card | undefined)[])[] = [];
        const unwatch = selector.watch(v => values.push(v));

        expect(
            (values[0] ?? []).map(c => c?.id).sort()
        ).toEqual(['c1', 'c2']);

        kit.collection.removeOneByPk('c1');
        queue.flush();

        expect(values.length).toBe(2);
        expect((values[1] ?? []).map(c => c?.id)).toEqual(['c2']);

        unwatch();
        set.destroy();
        kit.collection.destroy();
        queue.destroy();
    });
});
