import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMReactiveCollection } from '../src/core/OIMReactiveCollection';
import { createOIMCollectionIndexFactory } from '../src/core/OIMCollectionIndexFactory';
import { createOIMGlobalIndexSlotMap } from '../src/modules/wrapper/index/createOIMGlobalIndexSlotMap';
import { TOIMAnyEntitySlot } from '../src/types/TOIMEntitySlot';

type Card = { id: string; title: string; position: number };

function setup() {
    const queue = new OIMEventQueue();
    const cards = new OIMReactiveCollection<Card, string>(queue, {
        selectPk: c => c.id,
    });
    cards.upsertMany([
        { id: 'c1', title: 'One', position: 2 },
        { id: 'c2', title: 'Two', position: 1 },
    ]);
    const indexFactory = createOIMCollectionIndexFactory(queue, cards);
    return { queue, cards, indexFactory };
}

type Row = { instance: number; pk: string };

describe('OIMGlobalIndexSlotMap', () => {
    test('same slot maps to the same object across reads (array-based global, ordered)', () => {
        const { indexFactory } = setup();
        const list = indexFactory.derivedArrayGlobalIndex({
            orderBy: c => c.position,
        });

        let next = 0;
        const rows = createOIMGlobalIndexSlotMap(
            list,
            (slot: TOIMAnyEntitySlot<string>): Row => ({
                instance: next++,
                pk: slot.pk,
            })
        );

        const first = rows.getAll();
        const second = rows.getAll();

        expect(first.map(r => r.pk)).toEqual(['c2', 'c1']); // ordered by position
        expect(second[0]).toBe(first[0]); // reference-stable
        expect(second[1]).toBe(first[1]);
        expect(next).toBe(2); // create ran once per slot
    });

    test('works over a set-based global index', () => {
        const { indexFactory } = setup();
        const everyone = indexFactory.derivedSetGlobalIndex();

        const rows = createOIMGlobalIndexSlotMap(
            everyone,
            (slot: TOIMAnyEntitySlot<string>): Row => ({
                instance: 0,
                pk: slot.pk,
            })
        );

        expect(new Set(rows.getAll().map(r => r.pk))).toEqual(
            new Set(['c1', 'c2'])
        );
    });

    test('new member gets a fresh object; existing keep theirs', () => {
        const { queue, cards, indexFactory } = setup();
        const list = indexFactory.derivedArrayGlobalIndex({
            orderBy: c => c.position,
        });

        let next = 0;
        const rows = createOIMGlobalIndexSlotMap(
            list,
            (slot: TOIMAnyEntitySlot<string>): Row => ({
                instance: next++,
                pk: slot.pk,
            })
        );

        const before = new Map(rows.getAll().map(r => [r.pk, r] as const));
        const c2Row = before.get('c2');

        cards.upsertOne({ id: 'c3', title: 'Three', position: 0 });
        queue.flush();

        const after = new Map(rows.getAll().map(r => [r.pk, r] as const));
        expect(after.get('c2')).toBe(c2Row); // stable
        expect(after.has('c3')).toBe(true);
        expect(after.get('c3')).not.toBe(c2Row);
    });

    test('subscribe is a passthrough to the index', () => {
        const { queue, cards, indexFactory } = setup();
        const list = indexFactory.derivedArrayGlobalIndex({
            orderBy: c => c.position,
        });
        const rows = createOIMGlobalIndexSlotMap(list, () => ({}));

        let fired = 0;
        const off = rows.subscribe(() => {
            fired++;
        });

        cards.upsertOne({ id: 'c9', title: 'Nine', position: 9 });
        queue.flush();

        expect(fired).toBeGreaterThan(0);
        off();
    });

    test('map() chains with stable identity at each level', () => {
        const { indexFactory } = setup();
        const list = indexFactory.derivedArrayGlobalIndex({
            orderBy: c => c.position,
        });

        let rowN = 0;
        let cellN = 0;
        const rows = createOIMGlobalIndexSlotMap(
            list,
            (slot: TOIMAnyEntitySlot<string>): Row => ({
                instance: rowN++,
                pk: slot.pk,
            })
        );
        const cells = rows.map((row: Row) => ({ cell: cellN++, of: row }));

        const a = cells.getAll();
        const b = cells.getAll();
        expect(b[0]).toBe(a[0]); // chained object stable
        expect(a[0].of).toBe(rows.getAll()[0]); // reuses underlying Row
        expect(rowN).toBe(2);
        expect(cellN).toBe(2);
    });
});
