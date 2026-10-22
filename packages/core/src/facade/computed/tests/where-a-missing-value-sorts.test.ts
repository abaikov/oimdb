import { oimColumnsComparator } from '../utils/oimColumnsComparator';
import { oimEntitySlotsComparator } from '../utils/oimEntitySlotsComparator';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';

type TCard = { id: string; rank?: number | null; title?: string };

const sortedIds = (cards: TCard[], compare: (left: TCard, right: TCard) => number): string[] =>
    cards.slice().sort(compare).map(card => card.id);

const slotOf = (entity: TCard | undefined): TOIMEntitySlot<TCard> =>
    ({ entity } as TOIMEntitySlot<TCard>);

describe('where a missing value sorts', () => {
    const cards: TCard[] = [
        { id: 'nan', rank: Number.NaN },
        { id: 'two', rank: 2 },
        { id: 'null', rank: null },
        { id: 'one', rank: 1 },
        { id: 'absent' },
    ];

    it('puts undefined, null and NaN after every value in ascending order', () => {
        const ids = sortedIds(cards, oimColumnsComparator<TCard>([{ column: 'rank', direction: 'asc' }]));

        expect(ids.slice(0, 2)).toEqual(['one', 'two']);
        expect(ids.slice(2).sort()).toEqual(['absent', 'nan', 'null']);
    });

    it('still puts them last when the order is descending', () => {
        const ids = sortedIds(cards, oimColumnsComparator<TCard>([{ column: 'rank', direction: 'desc' }]));

        expect(ids.slice(0, 2)).toEqual(['two', 'one']);
        expect(ids.slice(2).sort()).toEqual(['absent', 'nan', 'null']);
    });

    it('treats two missing values as equal and lets the next column decide', () => {
        const compare = oimColumnsComparator<TCard>([
            { column: 'rank', direction: 'asc' },
            { column: 'title', direction: 'asc' },
        ]);

        expect(compare({ id: 'a', rank: null, title: 'b' }, { id: 'b', rank: Number.NaN, title: 'a' })).toBe(1);
        expect(compare({ id: 'a', title: 'a' }, { id: 'b', rank: null, title: 'b' })).toBe(-1);
        expect(compare({ id: 'a', rank: null }, { id: 'b' })).toBe(0);
    });

    it('puts a slot whose entity is gone after every slot that has one', () => {
        const compare = oimEntitySlotsComparator<TCard>(
            oimColumnsComparator<TCard>([{ column: 'rank', direction: 'asc' }]),
        );

        expect(compare(slotOf(undefined), slotOf({ id: 'one', rank: 1 }))).toBe(1);
        expect(compare(slotOf({ id: 'one', rank: 1 }), slotOf(undefined))).toBe(-1);
        expect(compare(slotOf(undefined), slotOf(undefined))).toBe(0);
        expect(compare(slotOf({ id: 'one', rank: 1 }), slotOf({ id: 'two', rank: 2 }))).toBe(-1);
    });
});
