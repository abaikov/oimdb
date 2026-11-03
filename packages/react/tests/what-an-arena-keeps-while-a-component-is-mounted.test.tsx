import * as React from 'react';
import { render, act } from '@testing-library/react';
import { OIMDB, OIMUnusedSlotCollectorService, createOIMComputedService, isOIMSameValueZero } from '@oimdb/core';
import { useOIMSlotsByKeys } from '../src/index';
import { createOIMEntityContentService } from '@oimdb/core';
import { createOIMSlotCollectionService } from '@oimdb/core';

type TCard = { id: string; rank: number };

function build() {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    let builtCount = 0;
    const ranksService = createOIMComputedService<string, number>({
        createSources: ({ key: id }) => {
            builtCount++;
            return { sourceSlots: [cardsService.getSlotByKey(cards, id)] };
        },
        derive: computedSlot => cardsService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? -1,
        sameValueGuard: isOIMSameValueZero,
    });
    const ranks = ranksService.createStoreSlot(db);
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
    { ranks, ids }: {
        ranks: TWorld['ranks'];
        ids: readonly string[];
    },
): React.ReactElement {
    const slots = useOIMSlotsByKeys(ranks, ids);
    return <span>{slots.map(slot => slot.value).join(',')}</span>;
}

describe('a component wrapped in an arena', () => {
    it('shows every derivation it resolved during its first render', () => {
        const w = build();
        w.cardsService.writeInBatch(w.cards, () => ([{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }]).map(entity => w.cardsService.writeSlotContentByKey(w.cards, entity.id, entity)));
        w.settle();

        const view = render(<Ranks ranks={w.ranks} ids={['a', 'b', 'c']} />);

        expect(view.container.textContent).toBe('1,2,3');
        expect(w.builtCount()).toBe(3);
    });

    it('keeps all three past a settle that would otherwise collect them', () => {
        const w = build();
        w.cardsService.writeInBatch(w.cards, () => ([{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }]).map(entity => w.cardsService.writeSlotContentByKey(w.cards, entity.id, entity)));
        w.settle();
        render(<Ranks ranks={w.ranks} ids={['a', 'b', 'c']} />);

        act(() => { w.settle(); });

        expect(w.ranksService.getSlotCount(w.ranks)).toBe(3);
        expect(w.builtCount()).toBe(3);
    });

    it('gives every one of them back when it unmounts', () => {
        const w = build();
        w.cardsService.writeInBatch(w.cards, () => ([{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }]).map(entity => w.cardsService.writeSlotContentByKey(w.cards, entity.id, entity)));
        w.settle();
        const view = render(<Ranks ranks={w.ranks} ids={['a', 'b', 'c']} />);
        act(() => { w.settle(); });

        view.unmount();
        w.settle();

        // Asking for one by key would REBUILD it — the very thing this file counts — so the
        // population is what says they went.
        expect(w.ranksService.getSlotCount(w.ranks)).toBe(0);
        expect(w.builtCount()).toBe(3);
    });

    it('rebuilds them for the next mount, which is what proves the arena was the cache', () => {
        const w = build();
        w.cardsService.writeInBatch(w.cards, () => ([{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }]).map(entity => w.cardsService.writeSlotContentByKey(w.cards, entity.id, entity)));
        w.settle();
        const view = render(<Ranks ranks={w.ranks} ids={['a', 'b', 'c']} />);
        act(() => { w.settle(); });
        view.unmount();
        w.settle();

        render(<Ranks ranks={w.ranks} ids={['a', 'b', 'c']} />);

        expect(w.builtCount()).toBe(6);
    });

    it('leaves nothing filed after StrictMode has mounted, unmounted and remounted it', () => {
        const w = build();
        w.cardsService.writeInBatch(w.cards, () => ([{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }]).map(entity => w.cardsService.writeSlotContentByKey(w.cards, entity.id, entity)));
        w.settle();
        const view = render(
            <React.StrictMode><Ranks ranks={w.ranks} ids={['a', 'b', 'c']} /></React.StrictMode>);
        act(() => { w.settle(); });
        expect(w.ranksService.getSlotCount(w.ranks)).toBe(3);

        view.unmount();
        w.settle();

        expect(w.ranksService.getSlotCount(w.ranks)).toBe(0);
    });

    it('neither rebuilds nor stacks a second hold when a render hands it an equal key list', () => {
        const w = build();
        w.cardsService.writeInBatch(w.cards, () => ([{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }]).map(entity => w.cardsService.writeSlotContentByKey(w.cards, entity.id, entity)));
        w.settle();
        const view = render(<Ranks ranks={w.ranks} ids={['a', 'b', 'c']} />);
        act(() => { w.settle(); });

        act(() => { view.rerender(<Ranks ranks={w.ranks} ids={['a', 'b', 'c']} />); });
        act(() => { view.rerender(<Ranks ranks={w.ranks} ids={['a', 'b', 'c']} />); });
        act(() => { w.settle(); });

        expect(w.builtCount()).toBe(3);
        expect(w.ranksService.getSlotByKey(w.ranks, 'a').holdCount).toBe(1);
        expect(w.ranksService.getSlotByKey(w.ranks, 'c').holdCount).toBe(1);
    });

    it('ends the whole arena when the key list moves, so the keys it still names are rebuilt', () => {
        const w = build();
        w.cardsService.writeInBatch(w.cards, () => ([{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }]).map(entity => w.cardsService.writeSlotContentByKey(w.cards, entity.id, entity)));
        w.settle();
        const view = render(<Ranks ranks={w.ranks} ids={['a', 'b', 'c']} />);
        act(() => { w.settle(); });

        act(() => { view.rerender(<Ranks ranks={w.ranks} ids={['a', 'b']} />); });
        act(() => { w.settle(); });

        expect(w.ranksService.getSlotCount(w.ranks)).toBe(2);
        expect(w.ranksService.getSlotByKey(w.ranks, 'a').holdCount).toBe(1);
        expect(w.ranksService.getSlotByKey(w.ranks, 'b').holdCount).toBe(1);
        expect(w.builtCount()).toBe(5);
        expect(view.container.textContent).toBe('1,2');
    });
});
