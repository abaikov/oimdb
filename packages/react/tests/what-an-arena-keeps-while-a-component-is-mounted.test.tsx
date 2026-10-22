import * as React from 'react';
import { render, act } from '@testing-library/react';
import {
    OIMDB,
    OIMUnusedSlotCollectorService,
    createOIMComputedService,
    createOIMEntityService,
    oimSameValueZeroGuard,
} from '@oimdb/core';
import { useOIMSlotsByKeys } from '../src/index';

type TCard = { id: string; rank: number };

function build() {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    let builtCount = 0;
    const ranksService = createOIMComputedService<string, number>({
        createSources: (id: string) => {
            builtCount++;
            return { sourceSlots: [cardsService.getSlotByKey(cards, id)] };
        },
        derive: computedSlot => cardsService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? -1,
        sameValueGuard: oimSameValueZeroGuard,
    });
    const ranks = ranksService.createComputedStoreSlot(db);
    return {
        cardsService,
        cards,
        ranksService,
        ranks,
        settle: (): void => {
            db.flush();
            OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        },
        builtCount: (): number => builtCount,
    };
}

type TWorld = ReturnType<typeof build>;

function Ranks(
    { ranksService, ranks, ids }: {
        ranksService: TWorld['ranksService'];
        ranks: TWorld['ranks'];
        ids: readonly string[];
    },
): React.ReactElement {
    const slots = useOIMSlotsByKeys(ranksService.computedCollectionService, ranks, ids);
    return <span>{slots.map(slot => slot.computedValueService.getValueForSlot(slot)).join(',')}</span>;
}

describe('a component wrapped in an arena', () => {
    it('shows every derivation it resolved during its first render', () => {
        const w = build();
        w.cardsService.slotContentService.upsertEntities(w.cards, [{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }]);
        w.settle();

        const view = render(<Ranks ranksService={w.ranksService} ranks={w.ranks} ids={['a', 'b', 'c']} />);

        expect(view.container.textContent).toBe('1,2,3');
        expect(w.builtCount()).toBe(3);
    });

    it('keeps all three past a settle that would otherwise collect them', () => {
        const w = build();
        w.cardsService.slotContentService.upsertEntities(w.cards, [{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }]);
        w.settle();
        render(<Ranks ranksService={w.ranksService} ranks={w.ranks} ids={['a', 'b', 'c']} />);

        act(() => { w.settle(); });

        expect(w.ranksService.computedCollectionService.getSlotCount(w.ranks)).toBe(3);
        expect(w.builtCount()).toBe(3);
    });

    it('gives every one of them back when it unmounts', () => {
        const w = build();
        w.cardsService.slotContentService.upsertEntities(w.cards, [{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }]);
        w.settle();
        const view = render(<Ranks ranksService={w.ranksService} ranks={w.ranks} ids={['a', 'b', 'c']} />);
        act(() => { w.settle(); });

        view.unmount();
        w.settle();

        // Asking for one by key would REBUILD it — the very thing this file counts — so the
        // population is what says they went.
        expect(w.ranksService.computedCollectionService.getSlotCount(w.ranks)).toBe(0);
        expect(w.builtCount()).toBe(3);
    });

    it('rebuilds them for the next mount, which is what proves the arena was the cache', () => {
        const w = build();
        w.cardsService.slotContentService.upsertEntities(w.cards, [{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }]);
        w.settle();
        const view = render(<Ranks ranksService={w.ranksService} ranks={w.ranks} ids={['a', 'b', 'c']} />);
        act(() => { w.settle(); });
        view.unmount();
        w.settle();

        render(<Ranks ranksService={w.ranksService} ranks={w.ranks} ids={['a', 'b', 'c']} />);

        expect(w.builtCount()).toBe(6);
    });

    it('leaves nothing filed after StrictMode has mounted, unmounted and remounted it', () => {
        const w = build();
        w.cardsService.slotContentService.upsertEntities(w.cards, [{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }]);
        w.settle();
        const view = render(
            <React.StrictMode><Ranks ranksService={w.ranksService} ranks={w.ranks} ids={['a', 'b', 'c']} /></React.StrictMode>);
        act(() => { w.settle(); });
        expect(w.ranksService.computedCollectionService.getSlotCount(w.ranks)).toBe(3);

        view.unmount();
        w.settle();

        expect(w.ranksService.computedCollectionService.getSlotCount(w.ranks)).toBe(0);
    });

    it('neither rebuilds nor stacks a second hold when a render hands it an equal key list', () => {
        const w = build();
        w.cardsService.slotContentService.upsertEntities(w.cards, [{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }]);
        w.settle();
        const view = render(<Ranks ranksService={w.ranksService} ranks={w.ranks} ids={['a', 'b', 'c']} />);
        act(() => { w.settle(); });

        act(() => { view.rerender(<Ranks ranksService={w.ranksService} ranks={w.ranks} ids={['a', 'b', 'c']} />); });
        act(() => { view.rerender(<Ranks ranksService={w.ranksService} ranks={w.ranks} ids={['a', 'b', 'c']} />); });
        act(() => { w.settle(); });

        expect(w.builtCount()).toBe(3);
        expect(w.ranksService.computedCollectionService.getSlotByKey(w.ranks, 'a').holdCount).toBe(1);
        expect(w.ranksService.computedCollectionService.getSlotByKey(w.ranks, 'c').holdCount).toBe(1);
    });

    it('ends the whole arena when the key list moves, so the keys it still names are rebuilt', () => {
        const w = build();
        w.cardsService.slotContentService.upsertEntities(w.cards, [{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }]);
        w.settle();
        const view = render(<Ranks ranksService={w.ranksService} ranks={w.ranks} ids={['a', 'b', 'c']} />);
        act(() => { w.settle(); });

        act(() => { view.rerender(<Ranks ranksService={w.ranksService} ranks={w.ranks} ids={['a', 'b']} />); });
        act(() => { w.settle(); });

        expect(w.ranksService.computedCollectionService.getSlotCount(w.ranks)).toBe(2);
        expect(w.ranksService.computedCollectionService.getSlotByKey(w.ranks, 'a').holdCount).toBe(1);
        expect(w.ranksService.computedCollectionService.getSlotByKey(w.ranks, 'b').holdCount).toBe(1);
        expect(w.builtCount()).toBe(5);
        expect(view.container.textContent).toBe('1,2');
    });
});
