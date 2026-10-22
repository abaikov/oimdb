/**
 * Who gives the hold back.
 *
 * Resolving a group takes a hold on its bucket — `holdSlotByKey(key)` mints it and
 * hands back the bucket, counted — and a held bucket is never reclaimed, because
 * `unhold` unfiles only on the give-back that takes the count to
 * zero. Every test here is a claim about a COMPONENT's share of that count: what
 * it takes, when it takes it, and that nothing is left behind by an unmount, by
 * StrictMode's mount-unmount-remount, by a key that moves, or by a render React
 * throws away.
 *
 * CONTAINMENT IS WRITTEN HERE, BY HAND. Nothing re-files a row when it is
 * written, so `put` below does what an application does: it writes the rows and
 * then says who is in each deck it touched — including the deck a card LEFT.
 *
 * `put` takes its own hold around each write and gives it straight back, so the
 * only hold left standing at any assertion is the component's.
 */
import * as React from 'react';
import { render, screen, act } from '@testing-library/react';
import type {
    TOIMBucketSlot, TOIMEntitySlot, TOIMStoreKey, TOIMBucketSlotsArrayStore, TOIMStoreSlot,
} from '@oimdb/core';
import {
    OIMDB,
    OIMUnusedSlotCollectorService,
    createOIMBucketService,
    createOIMEntityService,
    oimIsSlotReleased,
} from '@oimdb/core';
import type { OIMSlotContentBucketServiceArrayDriven } from '@oimdb/core';
import { OIMDBProvider, useOIMBucketSlotsByKey } from '../src/index';

type TCard = { id: string; deckId: string; title: string; rank: number };
type TCardSlot = TOIMEntitySlot<TCard>;
type TByDeckSlot = TOIMBucketSlot<TOIMBucketSlotsArrayStore<TCardSlot>, TOIMStoreKey>;
type TByDeck = TOIMStoreSlot<Map<TOIMStoreKey, TByDeckSlot>, TByDeckSlot, readonly TCardSlot[]>;

const createCardsService = (db: OIMDB) => createOIMEntityService<TCard>(db, { keyOf: card => card.id });
type TCardsService = ReturnType<typeof createCardsService>;

const createByDeckService = (db: OIMDB) => createOIMBucketService<
    TCardSlot, TOIMStoreKey, TOIMBucketSlotsArrayStore<TCardSlot>, OIMSlotContentBucketServiceArrayDriven<TCardSlot>
>(db);
type TByDeckService = ReturnType<typeof createByDeckService>;

function build(): {
    db: OIMDB;
    cardsService: TCardsService;
    cards: TOIMStoreSlot<Map<TOIMStoreKey, TOIMEntitySlot<TCard, TOIMStoreKey>>, TOIMEntitySlot<TCard, TOIMStoreKey>, Partial<TCard>>;
    byDeckService: TByDeckService;
    byDeck: TByDeck;
    put: (...rows: readonly TCard[]) => void;
} {
    const db = new OIMDB();
    const cardsService = createCardsService(db);
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createByDeckService(db);
    const byDeck = byDeckService.createStoreSlot(db);

    const present = new Map<string, TCard>();
    const put = (...rows: readonly TCard[]): void => {
        const touched = new Set<string>();
        for (const row of rows) {
            const before = present.get(row.id);
            if (before !== undefined) touched.add(before.deckId);
            touched.add(row.deckId);
            present.set(row.id, row);
        }
        cardsService.slotContentService.upsertEntities(cards, rows);
        for (const deck of touched) {
            const inDeck: TOIMEntitySlot<TCard>[] = [];
            for (const row of present.values()) {
                if (row.deckId === deck) inDeck.push(cardsService.getSlotByKey(cards, row.id));
            }
            const heldSlot = byDeckService.holdSlotByKey(byDeck, deck);
            byDeckService.slotContentService.writeBucketMemberSlots(heldSlot, inDeck);
            heldSlot.owner.unholdSlot(heldSlot);
        }
    };

    return { db, cardsService, cards, byDeckService, byDeck, put };
}

const flushUnusedSlots = (db: OIMDB): void => {
    OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
};

const wrap = (db: OIMDB) =>
    function Wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
        return <OIMDBProvider db={db}>{children}</OIMDBProvider>;
    };

/** The same, with React's own double-mount of every effect turned on. */
const wrapStrict = (db: OIMDB) =>
    function Wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
        return (
            <React.StrictMode>
                <OIMDBProvider db={db}>{children}</OIMDBProvider>
            </React.StrictMode>
        );
    };

const seed = (put: (...rows: readonly TCard[]) => void, db: OIMDB): void => {
    put(
        { id: 'c2', deckId: 'd1', title: 'beta', rank: 1 },
        { id: 'c1', deckId: 'd1', title: 'alpha', rank: 2 },
        { id: 'c3', deckId: 'd2', title: 'gamma', rank: 1 },
    );
    db.flush();
};

describe('binding a group by key', () => {
    it('renders the slots it has on first paint, with no change to wait for', () => {
        const { db, cardsService, cards, byDeckService, byDeck, put } = build();
        seed(put, db);

        let renders = 0;
        function List({ deck }: { deck: string }): React.ReactElement {
            const inDeck: readonly TOIMEntitySlot<TCard>[] = useOIMBucketSlotsByKey(byDeckService, byDeck, deck);
            renders++;
            return <span data-testid="list">{inDeck.map(s => s.entity?.id).join(',')}</span>;
        }
        render(<List deck="d1" />, { wrapper: wrap(db) });

        // No act(), no flush, no write: what is on screen is what the collection
        // already held when the component asked.
        expect(screen.getByTestId('list').textContent).toBe('c2,c1');
        const before = renders;

        // A write to another group is not this one's business.
        act(() => {
            cardsService.slotContentService.updateEntity(cardsService.getSlotByKey(cards, 'c3'), { title: 'GAMMA' });
            db.flush();
        });
        expect(renders).toBe(before);

        act(() => { put({ id: 'c4', deckId: 'd1', title: 'delta', rank: 3 }); db.flush(); });
        expect(screen.getByTestId('list').textContent).toBe('c2,c1,c4');
    });

    it('holds the bucket once while mounted and gives the hold back on unmount', () => {
        const { db, byDeckService, byDeck, put } = build();
        seed(put, db);

        function List(): React.ReactElement {
            return <span>{useOIMBucketSlotsByKey(byDeckService, byDeck, 'd1').length}</span>;
        }
        const view = render(<List />, { wrapper: wrap(db) });
        expect(byDeckService.getSlotByKey(byDeck, 'd1')?.holdCount).toBe(1);

        view.unmount();
        expect(byDeckService.getSlotByKey(byDeck, 'd1')?.holdCount).toBe(0);
    });

    it('lets an empty group go entirely when the component unmounts', () => {
        // The leak this hook exists for, at its sharpest: a key computed from
        // what the user typed names a group with nothing in it, so the only
        // thing keeping the bucket alive is the hold.
        const { db, byDeckService, byDeck, put } = build();
        seed(put, db);
        expect(byDeckService.getSlotCount(byDeck)).toBe(2);

        function List(): React.ReactElement {
            return <span data-testid="n">{useOIMBucketSlotsByKey(byDeckService, byDeck, 'searched').length}</span>;
        }
        const view = render(<List />, { wrapper: wrap(db) });
        expect(screen.getByTestId('n').textContent).toBe('0');
        const searched = byDeckService.getSlotByKey(byDeck, 'searched');
        // The render's own mint is the collector's; what is left after it goes back is the
        // component's share, which is the one this file is about.
        flushUnusedSlots(db);
        expect(searched.holdCount).toBe(1);

        view.unmount();
        expect(oimIsSlotReleased(searched)).toBe(true);
        expect(byDeckService.getSlotCount(byDeck)).toBe(2);
    });

    it('takes no hold and mints nothing from a render React throws away', () => {
        // A sibling throws, so the tree this component rendered in is never
        // committed and nothing is ever called back for it.
        const { db, byDeckService, byDeck, put } = build();
        seed(put, db);

        function List(): React.ReactElement {
            return <span>{useOIMBucketSlotsByKey(byDeckService, byDeck, 'discarded').length}</span>;
        }
        function Bomb(): React.ReactElement {
            throw new Error('this render never commits');
        }
        class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
            public override state = { failed: false };
            public static getDerivedStateFromError(): { failed: boolean } {
                return { failed: true };
            }
            public override render(): React.ReactNode {
                return this.state.failed ? <span data-testid="fallback">-</span> : this.props.children;
            }
        }

        const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            render(<Boundary><List /><Bomb /></Boundary>, { wrapper: wrap(db) });
        } finally {
            logged.mockRestore();
        }

        expect(screen.getByTestId('fallback').textContent).toBe('-');
        flushUnusedSlots(db);
        expect(byDeckService.getSlotCount(byDeck)).toBe(2);
    });
});

describe('a group under StrictMode, which mounts every effect twice', () => {
    it('leaves one hold and not two', () => {
        const { db, byDeckService, byDeck, put } = build();
        seed(put, db);

        function List(): React.ReactElement {
            return <span>{useOIMBucketSlotsByKey(byDeckService, byDeck, 'd1').length}</span>;
        }
        const view = render(<List />, { wrapper: wrapStrict(db) });

        // Mount, unmount, mount again: one hold taken, one given back, one taken.
        expect(byDeckService.getSlotByKey(byDeck, 'd1')?.holdCount).toBe(1);
        view.unmount();
        expect(byDeckService.getSlotByKey(byDeck, 'd1')?.holdCount).toBe(0);
    });

    it('is still subscribed to the bucket the collection actually files', () => {
        // The remount's half of it, and the one that fails silently. The first
        // mount's release drops an EMPTY group out of its collection, so a
        // component that resolved once and captured the bucket comes back
        // subscribed to a bucket nothing files any more: the next hold mints a
        // second one at the same key, and this list reads empty for ever.
        const { db, byDeckService, byDeck, put } = build();
        seed(put, db);

        function List(): React.ReactElement {
            const inDeck: readonly TOIMEntitySlot<TCard>[] = useOIMBucketSlotsByKey(byDeckService, byDeck, 'later');
            return <span data-testid="list">{inDeck.map(s => s.entity?.id).join(',')}</span>;
        }
        render(<List />, { wrapper: wrapStrict(db) });
        expect(screen.getByTestId('list').textContent).toBe('');
        const later = byDeckService.getSlotByKey(byDeck, 'later');
        flushUnusedSlots(db);
        expect(later.holdCount).toBe(1);

        act(() => { put({ id: 'c9', deckId: 'later', title: 'ninth', rank: 1 }); db.flush(); });

        expect(screen.getByTestId('list').textContent).toBe('c9');
    });
});

describe('a key that moves between renders', () => {
    it('gives the old group back and takes the new one', () => {
        const { db, byDeckService, byDeck, put } = build();
        seed(put, db);

        let renders = 0;
        function List({ deck }: { deck: string }): React.ReactElement {
            const inDeck: readonly TOIMEntitySlot<TCard>[] = useOIMBucketSlotsByKey(byDeckService, byDeck, deck);
            renders++;
            return <span data-testid="list">{inDeck.map(s => s.entity?.id).join(',')}</span>;
        }
        const view = render(<List deck="d1" />, { wrapper: wrap(db) });
        expect(screen.getByTestId('list').textContent).toBe('c2,c1');
        expect(byDeckService.getSlotByKey(byDeck, 'd1')?.holdCount).toBe(1);
        expect(byDeckService.getSlotByKey(byDeck, 'd2')?.holdCount).toBe(0);

        view.rerender(<List deck="d2" />);

        expect(screen.getByTestId('list').textContent).toBe('c3');
        expect(byDeckService.getSlotByKey(byDeck, 'd1')?.holdCount).toBe(0);
        expect(byDeckService.getSlotByKey(byDeck, 'd2')?.holdCount).toBe(1);

        // And the old group is nothing to this component any more — not even
        // when d1's order genuinely moves: the wake reaches whoever is listening
        // to that bucket, which is nobody.
        const before = renders;
        act(() => {
            const d1 = byDeckService.getSlotByKey(byDeck, 'd1');
            byDeckService.slotContentService.moveBucketMemberSlotToPosition(d1, 0, 1);
            db.flush();
        });
        expect(renders).toBe(before);
        expect(byDeckService.slotContentService.getBucketMemberSlotAt(byDeckService.getSlotByKey(byDeck, 'd1'), 0)?.entity?.id).toBe('c1');

        // Every key it ever asked about, given back.
        view.unmount();
        expect(byDeckService.getSlotByKey(byDeck, 'd1')?.holdCount).toBe(0);
        expect(byDeckService.getSlotByKey(byDeck, 'd2')?.holdCount).toBe(0);
    });

    it('leaves nothing behind when the key it leaves is an empty one', () => {
        const { db, byDeckService, byDeck, put } = build();
        seed(put, db);

        function List({ deck }: { deck: string }): React.ReactElement {
            return <span data-testid="n">{useOIMBucketSlotsByKey(byDeckService, byDeck, deck).length}</span>;
        }
        const view = render(<List deck="typed" />, { wrapper: wrap(db) });
        const typed = byDeckService.getSlotByKey(byDeck, 'typed');
        flushUnusedSlots(db);
        expect(typed.holdCount).toBe(1);

        view.rerender(<List deck="typed-o" />);

        // The keystroke before this one is not a bucket any more.
        expect(oimIsSlotReleased(typed)).toBe(true);
        const typedO = byDeckService.getSlotByKey(byDeck, 'typed-o');
        flushUnusedSlots(db);
        expect(typedO.holdCount).toBe(1);
        expect(screen.getByTestId('n').textContent).toBe('0');

        view.unmount();
        expect(oimIsSlotReleased(typedO)).toBe(true);
        expect(byDeckService.getSlotCount(byDeck)).toBe(2);
    });
});
