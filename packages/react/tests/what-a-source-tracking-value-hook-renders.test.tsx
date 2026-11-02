import { act, render, screen } from '@testing-library/react';
import { OIMDB, createOIMEntityContentService, createOIMSlotCollectionService, createOIMSingleComputedService } from '@oimdb/core';
import type { TOIMEntitySlot } from '@oimdb/core';
import { OIMDBProvider, useOIMSourceTrackingValue } from '../src/index';

type TCard = { id: string; title: string; rank: number };

const build = () => {
    const db = new OIMDB();
    const cardService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    const cards = cardService.createStoreSlot(db);
    const ace = cardService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'Ace', rank: 1 });
    const king = cardService.writeSlotContentByKey(cards, 'k', { id: 'k', title: 'King', rank: 13 });
    db.flush();
    return { db, ace, king };
};

function CardTitle({ cardSlot, onRender }: { cardSlot: TOIMEntitySlot<TCard>; onRender: () => void }) {
    onRender();
    const title = useOIMSourceTrackingValue(() => cardSlot.entity?.title, [cardSlot]);
    return <span data-testid="title">{title}</span>;
}

describe('what a source-tracking value hook renders', () => {
    it('shows what it read and re-renders when that changes, with no source list', () => {
        const { db, ace } = build();
        render(<OIMDBProvider db={db}><CardTitle cardSlot={ace} onRender={() => undefined} /></OIMDBProvider>);
        expect(screen.getByTestId('title').textContent).toBe('Ace');
        act(() => { ace.updateEntity({ title: 'Ace of spades' }); db.flush(); });
        expect(screen.getByTestId('title').textContent).toBe('Ace of spades');
    });

    it('does not re-render for a write to an entity it did not read', () => {
        const { db, ace, king } = build();
        let renders = 0;
        render(<OIMDBProvider db={db}><CardTitle cardSlot={ace} onRender={() => { renders++; }} /></OIMDBProvider>);
        const settled = renders;
        act(() => { king.updateEntity({ title: 'King of hearts' }); db.flush(); });
        expect(renders).toBe(settled);
    });

    it('follows a new slot when the deps change', () => {
        const { db, ace, king } = build();
        const { rerender } = render(<OIMDBProvider db={db}><CardTitle cardSlot={ace} onRender={() => undefined} /></OIMDBProvider>);
        rerender(<OIMDBProvider db={db}><CardTitle cardSlot={king} onRender={() => undefined} /></OIMDBProvider>);
        expect(screen.getByTestId('title').textContent).toBe('King');
        act(() => { king.updateEntity({ title: 'King of hearts' }); db.flush(); });
        expect(screen.getByTestId('title').textContent).toBe('King of hearts');
    });

    it('reads a computed through its value and re-renders when the computed changes', () => {
        const { db, ace } = build();
        const rankService = createOIMSingleComputedService<number>({ createSources: () => ({ sourceSlots: [ace] }), derive: () => ace.entity?.rank ?? 0, initialValue: 0 });
        const rank = rankService.holdSingleSlot(rankService.createStoreSlot(db));
        function Rank() { return <span data-testid="rank">{useOIMSourceTrackingValue(() => rank.value * 10, [])}</span>; }
        render(<OIMDBProvider db={db}><Rank /></OIMDBProvider>);
        expect(screen.getByTestId('rank').textContent).toBe('10');
        act(() => { ace.updateEntityColumn('rank', 2); db.flush(); });
        expect(screen.getByTestId('rank').textContent).toBe('20');
    });
});
