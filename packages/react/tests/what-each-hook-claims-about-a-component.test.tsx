/**
 * Does React actually work on this model? Every test here is a claim about a
 * component, not about the engine.
 */
import * as React from 'react';
import { render, screen, act } from '@testing-library/react';
import type {
    TOIMBucketSlot, TOIMComputedSlot, TOIMEntitySlot, TOIMStoreKey,
    TOIMBucketSlotsArrayStore, TOIMBucketSlotsSetStore, TOIMSingleSlotStore, TOIMSlotStoreTree, TOIMStoreSlot,
} from '@oimdb/core';
import {
    OIMDB,
    OIMDefaults,
    OIMSlotContentBucketServiceSetDriven,
    OIMSlotStoreServiceSingleSlotDriven,
    OIMSlotStoreServiceTreeDriven,
    OIMUnusedSlotCollectorService,
    createOIMBucketService,
    createOIMComputedService,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
    oimSameValueZeroGuard,
} from '@oimdb/core';
import type { OIMSlotContentBucketServiceArrayDriven } from '@oimdb/core';
import type { TOIMBinding } from '../src/index';
import {
    OIMDBProvider, useOIMEntity, useOIMField, useOIMBucketSlotsByKey, useOIMBucketSlots, useOIMValue,
} from '../src/index';

type TDeck = { id: string };
type TCard = { id: string; deckId: string; title: string; rank: number };
type TCardSlot = TOIMEntitySlot<TCard>;
type TCards = TOIMStoreSlot<Map<TOIMStoreKey, TOIMEntitySlot<TCard, TOIMStoreKey>>, TOIMEntitySlot<TCard, TOIMStoreKey>, Partial<TCard>>;

const createCardsService = (db: OIMDB) => createOIMEntityService<TCard>(db, { keyOf: card => card.id });
type TCardsService = ReturnType<typeof createCardsService>;

const createByDeckArrayService = (db: OIMDB) => createOIMBucketService<
    TCardSlot, TOIMStoreKey, TOIMBucketSlotsArrayStore<TCardSlot>, OIMSlotContentBucketServiceArrayDriven<TCardSlot>
>(db);

const createByDeckSetService = (db: OIMDB) => createOIMBucketService<
    TCardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
>(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });

function build(): { db: OIMDB; cardsService: TCardsService; cards: TCards } {
    const db = new OIMDB();
    const cardsService = createCardsService(db);
    return { db, cardsService, cards: cardsService.createStoreSlot(db) };
}

/** After an upsert, the identity that write filed. */
const slotOf = (
    cardsService: TCardsService, cards: TCards, id: string,
): TOIMEntitySlot<TCard, TOIMStoreKey> =>
    cardsService.getSlotByKey(cards, id);

const updateCard = (cardsService: TCardsService, cards: TCards, id: string, patch: Partial<TCard>): void => {
    cardsService.slotContentService.updateEntity(cardsService.getSlotByKey(cards, id), patch);
};

const wrap = (db: OIMDB) =>
    function Wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
        return <OIMDBProvider db={db}>{children}</OIMDBProvider>;
    };

describe('binding one row', () => {
    it('re-renders that row and no other', () => {
        const { db, cardsService, cards } = build();
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deckId: 'd1', title: 'alpha', rank: 1 },
            { id: 'c2', deckId: 'd1', title: 'beta', rank: 2 },
        ]);
        db.flush();

        const renders: Record<string, number> = { c1: 0, c2: 0 };
        function Row({ pk }: { pk: string }): React.ReactElement {
            const card = useOIMEntity(cardsService, cards, pk);
            renders[pk]++;
            return <span data-testid={pk}>{card?.title}</span>;
        }
        render(<><Row pk="c1" /><Row pk="c2" /></>, { wrapper: wrap(db) });
        expect(screen.getByTestId('c1').textContent).toBe('alpha');
        const before = { ...renders };

        act(() => { updateCard(cardsService, cards, 'c1', { title: 'ALPHA' }); db.flush(); });

        expect(screen.getByTestId('c1').textContent).toBe('ALPHA');
        expect(renders.c1).toBe(before.c1 + 1);
        expect(renders.c2).toBe(before.c2);
    });

    it('re-renders even though the entity reference never changed', () => {
        // The default write strategy writes IN PLACE, so the object identity
        // never moves and anything comparing values would conclude nothing
        // happened.
        const { db, cardsService, cards } = build();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1', title: 'alpha', rank: 1 });
        db.flush();
        const stored = slotOf(cardsService, cards, 'c1').entity;

        function Row(): React.ReactElement {
            const card = useOIMEntity(cardsService, cards, 'c1');
            return <span data-testid="t">{card?.title}</span>;
        }
        render(<Row />, { wrapper: wrap(db) });

        act(() => { updateCard(cardsService, cards, 'c1', { title: 'ALPHA' }); db.flush(); });

        expect(slotOf(cardsService, cards, 'c1').entity).toBe(stored);
        expect(screen.getByTestId('t').textContent).toBe('ALPHA');
    });

    it('renders once for many writes in one frame', () => {
        const { db, cardsService, cards } = build();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1', title: 'a', rank: 1 });
        db.flush();
        let renders = 0;
        function Row(): React.ReactElement {
            const card = useOIMEntity(cardsService, cards, 'c1');
            renders++;
            return <span data-testid="t">{card?.title}</span>;
        }
        render(<Row />, { wrapper: wrap(db) });
        const before = renders;

        act(() => {
            for (const title of ['b', 'c', 'd', 'e', 'f']) updateCard(cardsService, cards, 'c1', { title });
            db.flush();
        });

        expect(screen.getByTestId('t').textContent).toBe('f');
        expect(renders).toBe(before + 1);
    });

    it('does not render for a write that changed nothing', () => {
        const { db, cardsService, cards } = build();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1', title: 'a', rank: 1 });
        db.flush();
        let renders = 0;
        function Row(): React.ReactElement {
            renders++;
            return <span>{useOIMEntity(cardsService, cards, 'c1')?.title}</span>;
        }
        render(<Row />, { wrapper: wrap(db) });
        const before = renders;

        act(() => { updateCard(cardsService, cards, 'c1', { title: 'a' }); db.flush(); });

        expect(renders).toBe(before);
    });

    it('lets the identity go when the last component unmounts', () => {
        const { db, cardsService, cards } = build();
        function Ghost(): React.ReactElement {
            return <span>{useOIMEntity(cardsService, cards, 'never-written')?.title ?? '-'}</span>;
        }
        const view = render(<Ghost />, { wrapper: wrap(db) });
        // Minted by the RENDER, which asks `getSlotByKey`; `subscribe` resolves the same
        // key onto that identity, so the count is one either way.
        expect(cardsService.getSlotCount(cards)).toBe(1);
        view.unmount();
        // The last render's mint is still the collector's, so the population answers once
        // the frame it was minted in closes.
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });
});

describe('binding one field', () => {
    it('re-renders for that field and not for a sibling', () => {
        const { db, cardsService, cards } = build();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1', title: 'alpha', rank: 1 });
        db.flush();
        const slot = slotOf(cardsService, cards, 'c1');

        let titleRenders = 0;
        function Title(): React.ReactElement {
            titleRenders++;
            return <span data-testid="t">{String(useOIMField(cardsService, slot, 'title') ?? '')}</span>;
        }
        render(<Title />, { wrapper: wrap(db) });
        const before = titleRenders;

        act(() => { updateCard(cardsService, cards, 'c1', { rank: 99 }); db.flush(); });
        expect(titleRenders).toBe(before);

        act(() => { updateCard(cardsService, cards, 'c1', { title: 'ALPHA' }); db.flush(); });
        expect(titleRenders).toBe(before + 1);
        expect(screen.getByTestId('t').textContent).toBe('ALPHA');
    });
});

describe('binding a list', () => {
    it('follows the slots and order it is given, and ignores unrelated writes', () => {
        // A bucket collection is a store of buckets by key plus a bucket
        // service: nothing reads a column to decide what a bucket holds.
        const { db, cardsService, cards } = build();
        const byDeckService = createByDeckArrayService(db);
        const byDeck = byDeckService.createStoreSlot(db);
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deckId: 'd1', title: 'alpha', rank: 2 },
            { id: 'c2', deckId: 'd1', title: 'beta', rank: 1 },
            { id: 'c3', deckId: 'd2', title: 'gamma', rank: 1 },
        ]);
        // Held for the whole test: this is the caller resolving a bucket outside
        // React, which `useOIMBucketSlots` is the hook for.
        const heldSlot = byDeckService.holdSlotByKey(byDeck, 'd1');
        const bucket = heldSlot;
        const file = (...ids: readonly string[]): void => {
            byDeckService.slotContentService.writeBucketMemberSlots(bucket, ids.map(id => slotOf(cardsService, cards, id)));
        };
        file('c2', 'c1');
        const d2Slot = byDeckService.holdSlotByKey(byDeck, 'd2');
        byDeckService.slotContentService.writeBucketMemberSlots(d2Slot, [slotOf(cardsService, cards, 'c3')]);
        db.flush();

        let renders = 0;
        function List(): React.ReactElement {
            const inDeck: readonly TOIMEntitySlot<TCard>[] = useOIMBucketSlots(byDeckService, bucket);
            renders++;
            return <span data-testid="list">{inDeck.map(s => s.entity?.id).join(',')}</span>;
        }
        render(<List />, { wrapper: wrap(db) });
        expect(screen.getByTestId('list').textContent).toBe('c2,c1');
        const before = renders;

        // A row in another deck: this list must not move.
        act(() => { updateCard(cardsService, cards, 'c3', { title: 'GAMMA' }); db.flush(); });
        expect(renders).toBe(before);

        act(() => {
            byDeckService.slotContentService.moveBucketMemberSlotToPosition(bucket, 1, 0);
            db.flush();
        });
        expect(screen.getByTestId('list').textContent).toBe('c1,c2');

        // A row arrives, and one leaves. `remove` takes the value out of the
        // collection and leaves the bucket's slots alone, so the departure is one
        // call about the row and one about the bucket.
        act(() => {
            cardsService.slotContentService.upsertEntity(cards, { id: 'c4', deckId: 'd1', title: 'delta', rank: 5 });
            file('c1', 'c2', 'c4');
            db.flush();
        });
        expect(screen.getByTestId('list').textContent).toBe('c1,c2,c4');
        act(() => {
            const c2 = slotOf(cardsService, cards, 'c2');
            file('c1', 'c4');
            cardsService.slotContentService.deleteEntity(c2);
            db.flush();
        });
        expect(screen.getByTestId('list').textContent).toBe('c1,c4');

        heldSlot.owner.unholdSlot(heldSlot);
        d2Slot.owner.unholdSlot(d2Slot);
    });
});

describe('what a hook needs above it', () => {
    /**
     * EVERY hook needs a provider, `useOIMEntity` included. Subscribing is an
     * effect on an `OIMDB`, which no entity service carries, so the
     * database has to come from above.
     */
    it('refuses a row, a field and a list with no provider', () => {
        const { db, cardsService, cards } = build();
        const byDeckService = createByDeckSetService(db);
        const byDeck = byDeckService.createStoreSlot(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1', title: 'alpha', rank: 1 });
        const everyCardSlot = byDeckService.holdSlotByKey(byDeck, 'all');
        byDeckService.slotContentService.writeBucketMemberSlots(everyCardSlot, [slotOf(cardsService, cards, 'c1')]);
        db.flush();
        const slot = slotOf(cardsService, cards, 'c1');

        function Row(): React.ReactElement {
            return <span>{useOIMEntity(cardsService, cards, 'c1')?.title}</span>;
        }
        function Field(): React.ReactElement {
            return <span>{String(useOIMField(cardsService, slot, 'title') ?? '')}</span>;
        }
        function List(): React.ReactElement {
            const inDeck: readonly TOIMEntitySlot<TCard>[] = useOIMBucketSlots(byDeckService, everyCardSlot);
            return <span>{inDeck.length}</span>;
        }

        // React reports a render that throws on its own account; the throw is
        // the assertion here, so its log is noise.
        const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            expect(() => render(<Row />)).toThrow(/OIMDBProvider/);
            expect(() => render(<Field />)).toThrow(/OIMDBProvider/);
            expect(() => render(<List />)).toThrow(/OIMDBProvider/);
        } finally {
            logged.mockRestore();
        }
        everyCardSlot.owner.unholdSlot(everyCardSlot);
    });
});

describe('binding a group resolved outside React', () => {
    /**
     * `bucketService.holdSlotByKey(bucketStoreSlot, key)` is what a store module writes, and
     * what it gives back is the bucket itself, held. That is the shape
     * `useOIMBucketSlots` takes; `useOIMBucketSlotsByKey` is the one that does the
     * holding itself.
     */
    it('renders a group by key, and ignores a write to another group', () => {
        const { db, cardsService, cards } = build();
        const byDeckService = createByDeckSetService(db);
        const byDeck = byDeckService.createStoreSlot(db);
        const spadesSlot = byDeckService.holdSlotByKey(byDeck, 'spades');
        const heartsSlot = byDeckService.holdSlotByKey(byDeck, 'hearts');
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deckId: 'spades', title: 'ace', rank: 1 },
            { id: 'c2', deckId: 'hearts', title: 'king', rank: 2 },
        ]);
        byDeckService.slotContentService.writeBucketMemberSlots(spadesSlot, [slotOf(cardsService, cards, 'c1')]);
        byDeckService.slotContentService.writeBucketMemberSlots(heartsSlot, [slotOf(cardsService, cards, 'c2')]);
        db.flush();

        let renders = 0;
        function List(): React.ReactElement {
            const inDeck: readonly TOIMEntitySlot<TCard>[] = useOIMBucketSlots(byDeckService, spadesSlot);
            renders++;
            return <span data-testid="list">{inDeck.map(s => s.entity?.id).join(',')}</span>;
        }
        render(<List />, { wrapper: wrap(db) });
        expect(screen.getByTestId('list').textContent).toBe('c1');
        const before = renders;

        act(() => { updateCard(cardsService, cards, 'c2', { title: 'KING' }); db.flush(); });
        expect(renders).toBe(before);

        // A row moves INTO this group. Writing `deckId` moves a value and files
        // nothing, so both buckets are re-stated here: the one it left and the
        // one it joined.
        act(() => {
            updateCard(cardsService, cards, 'c2', { deckId: 'spades' });
            byDeckService.slotContentService.clearBucketMemberSlots(heartsSlot);
            byDeckService.slotContentService.writeBucketMemberSlots(
                spadesSlot, [slotOf(cardsService, cards, 'c1'), slotOf(cardsService, cards, 'c2')],
            );
            db.flush();
        });
        expect(screen.getByTestId('list').textContent?.split(',').sort()).toEqual(['c1', 'c2']);

        spadesSlot.owner.unholdSlot(spadesSlot);
        heartsSlot.owner.unholdSlot(heartsSlot);
    });
});

describe('one key, one identity', () => {
    /**
     * `useOIMEntity` resolves the key once per (collection, pk) and holds the
     * identity it resolved. If `holdSlotByKey` ever minted a fresh slot per call,
     * every one of these components would be subscribed to an orphan and would
     * simply stop re-rendering, with nothing thrown.
     */
    it('tells two components on one key, and follows a key that moves', () => {
        const { db, cardsService, cards } = build();
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deckId: 'd1', title: 'alpha', rank: 1 },
            { id: 'c2', deckId: 'd1', title: 'beta', rank: 2 },
        ]);
        db.flush();

        let moving = 0;
        let fixed = 0;
        function Moving({ pk }: { pk: string }): React.ReactElement {
            moving++;
            return <span data-testid="moving">{useOIMEntity(cardsService, cards, pk)?.title}</span>;
        }
        function Fixed(): React.ReactElement {
            fixed++;
            return <span data-testid="fixed">{useOIMEntity(cardsService, cards, 'c1')?.title}</span>;
        }
        const view = render(<><Moving pk="c1" /><Fixed /></>, { wrapper: wrap(db) });

        // Both are on 'c1'. One write, both told.
        act(() => { updateCard(cardsService, cards, 'c1', { title: 'ALPHA' }); db.flush(); });
        expect(screen.getByTestId('moving').textContent).toBe('ALPHA');
        expect(screen.getByTestId('fixed').textContent).toBe('ALPHA');

        // The prop moves the key. The hook repoints, and lets the old one go.
        view.rerender(<><Moving pk="c2" /><Fixed /></>);
        expect(screen.getByTestId('moving').textContent).toBe('beta');
        const movingBefore = moving;
        const fixedBefore = fixed;

        act(() => { updateCard(cardsService, cards, 'c1', { title: 'alpha again' }); db.flush(); });
        expect(moving).toBe(movingBefore);
        expect(screen.getByTestId('fixed').textContent).toBe('alpha again');

        act(() => { updateCard(cardsService, cards, 'c2', { title: 'BETA' }); db.flush(); });
        expect(screen.getByTestId('moving').textContent).toBe('BETA');
        expect(fixed).toBe(fixedBefore + 1);

        // Two keys were asked for and two identities exist — repointing minted
        // no third, which is the whole of what one identity per key promises.
        expect(cardsService.getSlotCount(cards)).toBe(2);
    });
});

/**
 * A KEY THAT IS REBUILT ON EVERY RENDER.
 *
 * A bucket collection over an `OIMSlotStoreServiceTreeDriven` is keyed by a
 * `readonly TOIMEntitySlot[]`, and the natural call site builds it inline —
 * there is no spelling of `[deckSlot, daySlot]` that keeps its identity across
 * renders.
 *
 * A memo keyed on the key's identity does not merely resubscribe more often than
 * it has to: a fresh array rebuilds the store, which is a fresh `subscribe`,
 * which React honours on every commit; the bump on `subscribe`'s first line then
 * makes React's post-commit version check differ, React forces another render,
 * and that render builds another array. Nothing converges — the snapshot is a
 * counter precisely because values here cannot be compared.
 *
 * The cap inside the component is what makes that a FAILING test rather than a
 * hanging one.
 */
describe('a composite key, rebuilt inline on every render', () => {
    type TDay = { id: string };
    type TDated = { id: string; deckId: string; day: string; title: string };
    type TDatedSlot = TOIMEntitySlot<TDated>;
    type TChain = readonly TOIMEntitySlot[];
    type TByDeckAndDaySlot = TOIMBucketSlot<TOIMBucketSlotsSetStore<TDatedSlot>, TChain>;

    const setup = () => {
        const db = new OIMDB();
        const write = createOIMEntityWriterInPlace();
        const decksService = createOIMEntityService<TDeck>(db, { keyOf: deck => deck.id });
        const decks = decksService.createStoreSlot(db);
        const daysService = createOIMEntityService<TDay>(db, { keyOf: day => day.id });
        const days = daysService.createStoreSlot(db);
        const datedService = createOIMEntityService<TDated>(db, { keyOf: card => card.id, entityWriter: write });
        const dated = datedService.createStoreSlot(db);
        const byDeckAndDayService = createOIMBucketService<
            TDatedSlot, TChain, TOIMBucketSlotsSetStore<TDatedSlot>, OIMSlotContentBucketServiceSetDriven<TDatedSlot>,
            TOIMSlotStoreTree<TByDeckAndDaySlot, TOIMEntitySlot>
        >(db, {
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TDatedSlot>(),
            bucketSlotStoreService: new OIMSlotStoreServiceTreeDriven<TOIMEntitySlot, TByDeckAndDaySlot>(
                OIMDefaults.KEY_TREE_WALK_COMPOSITE.getValue(),
            ),
        });
        const byDeckAndDay = byDeckAndDayService.createStoreSlot(db);
        decksService.slotContentService.upsertEntities(decks, [{ id: 'spades' }, { id: 'hearts' }, { id: 'clubs' }]);
        daysService.slotContentService.upsertEntities(days, [{ id: 'mon' }, { id: 'tue' }, { id: 'sat' }]);

        const chain = (deckId: string, day: string): TChain =>
            [decksService.getSlotByKey(decks, deckId), daysService.getSlotByKey(days, day)];

        // The population the test intends, and the one call that files it. A
        // a bucket's slots are written by hand: nothing re-files a row when it is
        // written.
        const present = new Map<string, TDated>();
        const holds = new Map<string, TByDeckAndDaySlot>();
        const put = (...rows: readonly TDated[]): void => {
            for (const row of rows) present.set(row.id, row);
            datedService.slotContentService.upsertEntities(dated, rows);
            const touched = new Map<string, readonly [string, string]>();
            for (const row of rows) touched.set(`${row.deckId}/${row.day}`, [row.deckId, row.day]);
            for (const [deckId, day] of touched.values()) {
                const matching: TDatedSlot[] = [];
                for (const row of present.values()) {
                    if (row.deckId === deckId && row.day === day) matching.push(datedService.getSlotByKey(dated, row.id));
                }
                const at = `${deckId}/${day}`;
                // Held for the life of the test, so an empty bucket is not
                // unfiled between two writes of the same run.
                if (!holds.has(at)) holds.set(at, byDeckAndDayService.holdSlotByKey(byDeckAndDay, chain(deckId, day)));
                byDeckAndDayService.slotContentService.writeBucketMemberSlots(
                    byDeckAndDayService.getSlotByKey(byDeckAndDay, chain(deckId, day)), matching,
                );
            }
        };

        put(
            { id: 'c1', deckId: 'spades', day: 'mon', title: 'ace' },
            { id: 'c2', deckId: 'spades', day: 'tue', title: 'king' },
            { id: 'c3', deckId: 'hearts', day: 'mon', title: 'queen' },
        );
        db.flush();
        return { db, decksService, decks, daysService, days, put, byDeckAndDayService, byDeckAndDay, chain };
    };

    it('resolves one group and settles, instead of rendering without bound', () => {
        const { db, put, byDeckAndDayService, byDeckAndDay, chain } = setup();

        let renders = 0;
        function Combo({ deckId, day }: { deckId: string; day: string }): React.ReactElement {
            renders++;
            // The assertion, placed where it can still be reached. A binding
            // that does not converge never returns from `render()`.
            if (renders > 12) throw new Error(`rendered ${renders} times for one key`);
            const inGroup: readonly TDatedSlot[] = useOIMBucketSlotsByKey(byDeckAndDayService, byDeckAndDay, chain(deckId, day));
            return <span data-testid="n">{inGroup.map(s => s.entity?.id).sort().join(',')}</span>;
        }
        render(<Combo deckId="spades" day="mon" />, { wrapper: wrap(db) });

        expect(screen.getByTestId('n').textContent).toBe('c1');
        // One mount render plus the one forced by the bump on subscribing, which
        // is the documented price of a SUBSCRIPTION commit. The bound is loose
        // enough to survive a StrictMode double render and nowhere near the
        // fifty a loop reaches.
        expect(renders).toBeLessThanOrEqual(6);
        const settled = renders;

        // And it is genuinely subscribed to that group afterwards, rather than
        // frozen onto a handle nothing wakes.
        act(() => { put({ id: 'c4', deckId: 'hearts', day: 'mon', title: 'jack' }); db.flush(); });
        expect(renders).toBe(settled);

        act(() => { put({ id: 'c5', deckId: 'spades', day: 'mon', title: 'ten' }); db.flush(); });
        expect(screen.getByTestId('n').textContent).toBe('c1,c5');
    });

    it('still repoints when the segments actually change', () => {
        // The guard on the fix rather than on the defect: settling the key must
        // not out-cache a real move.
        const { db, byDeckAndDayService, byDeckAndDay, chain } = setup();

        function Combo({ day }: { day: string }): React.ReactElement {
            const inGroup: readonly TDatedSlot[] = useOIMBucketSlotsByKey(byDeckAndDayService, byDeckAndDay, chain('spades', day));
            return <span data-testid="n">{inGroup.map(s => s.entity?.id).sort().join(',')}</span>;
        }
        const view = render(<Combo day="mon" />, { wrapper: wrap(db) });
        expect(screen.getByTestId('n').textContent).toBe('c1');

        view.rerender(<Combo day="tue" />);
        expect(screen.getByTestId('n').textContent).toBe('c2');

        view.rerender(<Combo day="mon" />);
        expect(screen.getByTestId('n').textContent).toBe('c1');
    });

    it('gives the hold back on unmount, with the key settled', () => {
        // Settling changes WHICH array the subscription closes over, so the
        // release has to still be the one this component took. A bucket that is
        // empty when the last holder lets go is dropped out of its collection,
        // and that is what a leaked hold would prevent.
        const { db, byDeckAndDayService, byDeckAndDay, chain } = setup();
        const before = byDeckAndDayService.getSlotCount(byDeckAndDay);

        function Combo(): React.ReactElement {
            return <span>{useOIMBucketSlotsByKey(byDeckAndDayService, byDeckAndDay, chain('clubs', 'sat')).length}</span>;
        }
        const view = render(<Combo />, { wrapper: wrap(db) });
        expect(byDeckAndDayService.getSlotCount(byDeckAndDay)).toBe(before + 1);

        view.unmount();
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(byDeckAndDayService.getSlotCount(byDeckAndDay)).toBe(before);
    });
});

describe('binding a derived value', () => {
    it('renders a computed and only when its value moved', () => {
        const { db, cardsService, cards } = build();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1', title: 'alpha', rank: 1 });
        db.flush();
        // Held for the life of the test: the computed takes no hold of its
        // own, so the row is kept by whoever resolved it.
        const cardSlot = cardsService.holdSlotByKey(cards, 'c1');
        const lengthService = createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
            computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
            sameValueGuard: oimSameValueZeroGuard,
        });
        const length = lengthService.createComputedStoreSlot(
            db,
            () => (cardSlot.entity?.title ?? '').length,
            () => ({ sourceSlots: [cardSlot] }),
        );
        const lengthSlot = lengthService.computedCollectionService.holdSlotByKey(length, undefined);
        const binding: TOIMBinding<number> = {
            sourceComputeds: [lengthSlot],
            derive: () => lengthService.computedCollectionService.slotContentService.getValueForSlot(lengthSlot),
        };

        let renders = 0;
        function Length(): React.ReactElement {
            renders++;
            return <span data-testid="n">{useOIMValue(binding)}</span>;
        }
        render(<Length />, { wrapper: wrap(db) });
        expect(screen.getByTestId('n').textContent).toBe('5');

        // The first wake after a subscription always runs the body: an effect is
        // born at `ranAtRevision === -1`, below every reading the clock can
        // produce. Spent here, so what follows is the steady state.
        act(() => { updateCard(cardsService, cards, 'c1', { title: 'ALPHA' }); db.flush(); });
        expect(screen.getByTestId('n').textContent).toBe('5');
        const before = renders;

        // Same length: the computed did not move, so nothing renders.
        act(() => { updateCard(cardsService, cards, 'c1', { title: 'alpha' }); db.flush(); });
        expect(renders).toBe(before);

        act(() => { updateCard(cardsService, cards, 'c1', { title: 'alphabet' }); db.flush(); });
        expect(screen.getByTestId('n').textContent).toBe('8');
        expect(renders).toBe(before + 1);

        lengthSlot.owner.unholdSlot(lengthSlot);
        cardSlot.owner.unholdSlot(cardSlot);
    });
});
