import * as React from 'react';
import { render, screen, act } from '@testing-library/react';
import {
    OIMDB,
    createOIMComputedService,
    createOIMEntityService,
    oimSameValueZeroGuard,
} from '@oimdb/core';
import { OIMDBProvider, useOIMComputedValue } from '../src/index';

type TCard = { id: string; title: string; rank: number };

function build() {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const ranksService = createOIMComputedService<string, number>({
        createSources: (id: string) => ({ sourceSlots: [cardsService.getSlotByKey(cards, id)] }),
        derive: computedSlot => cardsService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? -1,
        sameValueGuard: oimSameValueZeroGuard,
    });
    const ranks = ranksService.createComputedStoreSlot(db);
    return { db, cardsService, cards, ranksService, ranks };
}

function wrap(db: OIMDB) {
    return function Wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
        return <OIMDBProvider db={db}>{children}</OIMDBProvider>;
    };
}

describe('useOIMComputedValue', () => {
    it('renders the computed value and re-renders when it changes', () => {
        const { db, cardsService, cards, ranksService, ranks } = build();
        cardsService.slotContentService.upsertEntities(cards, [{ id: 'c1', title: 'alpha', rank: 1 }]);
        db.flush();

        let renders = 0;
        function Rank(): React.ReactElement {
            const rank = useOIMComputedValue(ranksService.computedCollectionService.getSlotByKey(ranks, 'c1'));
            renders++;
            return <span data-testid="rank">{rank}</span>;
        }
        render(<Rank />, { wrapper: wrap(db) });
        expect(screen.getByTestId('rank').textContent).toBe('1');
        const before = renders;

        act(() => {
            cardsService.slotContentService.updateEntity(cardsService.getSlotByKey(cards, 'c1'), { rank: 5 });
            db.flush();
        });

        expect(screen.getByTestId('rank').textContent).toBe('5');
        expect(renders).toBe(before + 1);
    });

    it('does not re-render when a source changes and the value does not', () => {
        const { db, cardsService, cards, ranksService, ranks } = build();
        cardsService.slotContentService.upsertEntities(cards, [{ id: 'c1', title: 'alpha', rank: 1 }]);
        db.flush();

        let renders = 0;
        function Rank(): React.ReactElement {
            const rank = useOIMComputedValue(ranksService.computedCollectionService.getSlotByKey(ranks, 'c1'));
            renders++;
            return <span data-testid="rank">{rank}</span>;
        }
        render(<Rank />, { wrapper: wrap(db) });
        const before = renders;

        act(() => {
            cardsService.slotContentService.updateEntity(cardsService.getSlotByKey(cards, 'c1'), { title: 'ALPHA' });
            db.flush();
        });

        expect(screen.getByTestId('rank').textContent).toBe('1');
        expect(renders).toBe(before);
    });
});
