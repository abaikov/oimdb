/**
 * Subscribing to an identity you did not resolve.
 *
 * `useOIMBucketSlots` and `useOIMField` are handed an identity somebody else
 * resolved — and subscribing is not the passive act it looks like:
 * `OIMEffectService.disposeEffect` ends in `root.owner?.unholdSlot(root)`, so tearing the
 * subscription down asks that identity's owner whether the identity may go. For
 * `useOIMField` the root is the COLUMN, and a column released this way asks the
 * same question of its row.
 *
 * What fails then is silent. The caller still has the identity in a variable,
 * the collection mints a SECOND one at that key on the next write, and the
 * caller reads empty for ever with nothing thrown — which is why every test
 * below ends by WRITING and looking at what came back, rather than only counting
 * holds.
 *
 * The caller here holds what it resolved, as a store module does: `hold` is the
 * only door onto a keyed identity that has no value yet, and it hands back the
 * reference that keeps it.
 *
 * `useOIMBucketSlotsByKey` is not in this position and has its own file: it RESOLVES its
 * bucket and gives that hold back.
 */
import * as React from 'react';
import { render, screen, act } from '@testing-library/react';
import type { TOIMEntitySlot } from '@oimdb/core';
import { OIMDB, createOIMBucketService, createOIMEntityService } from '@oimdb/core';
import { OIMDBProvider, useOIMField, useOIMBucketSlots } from '../src/index';

type TCard = { id: string; deckId: string; title: string; rank: number };
type TCardSlot = TOIMEntitySlot<TCard>;

/**
 * The rows `seed` writes are deliberately in NO bucket. Two tests below turn on
 * a row holding nothing but the caller's own reference at the instant a
 * subscription is torn down, and a slot in a bucket is one of the terms that keeps an
 * identity filed — so a row left in a deck would pass them without the hold
 * doing any of the work.
 */
function build() {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMBucketService<TCardSlot>(db);
    const byDeck = byDeckService.createStoreSlot(db);
    return { db, cardsService, cards, byDeckService, byDeck };
}

type TFixture = ReturnType<typeof build>;

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

const seed = (cardsService: TFixture['cardsService'], cards: TFixture['cards'], db: OIMDB): void => {
    cardsService.slotContentService.upsertEntities(cards, [
        { id: 'c1', deckId: 'd1', title: 'alpha', rank: 2 },
        { id: 'c2', deckId: 'd1', title: 'beta', rank: 1 },
    ]);
    db.flush();
};

describe('useOIMBucketSlots, on a bucket somebody else resolved', () => {
    it('leaves an empty bucket exactly as it found it', () => {
        const { db, cardsService, cards, byDeckService, byDeck } = build();
        seed(cardsService, cards, db);
        const emptySlot = byDeckService.holdSlotByKey(byDeck, 'empty');
        expect(emptySlot.holdCount).toBe(1);

        function List(): React.ReactElement {
            return <span data-testid="n">{useOIMBucketSlots(byDeckService, emptySlot).length}</span>;
        }
        const view = render(<List />, { wrapper: wrap(db) });
        expect(screen.getByTestId('n').textContent).toBe('0');
        // The caller's reference, and the subscription's.
        expect(emptySlot.holdCount).toBe(2);

        view.unmount();

        // The bucket is still the one the collection files, and the hold is
        // given back rather than spent: this component did not resolve the
        // identity, so it has no business deciding that nothing wants it.
        expect(byDeckService.getSlotByKey(byDeck, 'empty')).toBe(emptySlot);
        expect(emptySlot.holdCount).toBe(1);
        emptySlot.owner.unholdSlot(emptySlot);
    });

    it('is still subscribed to the bucket the collection files, after StrictMode remounts it', () => {
        const { db, cardsService, cards, byDeckService, byDeck } = build();
        seed(cardsService, cards, db);
        const laterSlot = byDeckService.holdSlotByKey(byDeck, 'later');
        function List(): React.ReactElement {
            return (
                <span data-testid="list">
                    {useOIMBucketSlots(byDeckService, laterSlot).map(slot => slot.entity?.id).join(',')}
                </span>
            );
        }
        render(<List />, { wrapper: wrapStrict(db) });
        expect(screen.getByTestId('list').textContent).toBe('');
        expect(byDeckService.getSlotByKey(byDeck, 'later')).toBe(laterSlot);

        act(() => {
            const ninthSlot = cardsService.slotContentService.upsertEntity(cards, { id: 'c9', deckId: 'later', title: 'ninth', rank: 1 });
            byDeckService.slotContentService.writeBucketMemberSlots(laterSlot, [ninthSlot]);
            db.flush();
        });

        expect(screen.getByTestId('list').textContent).toBe('c9');
        expect(byDeckService.getSlotByKey(byDeck, 'later')).toBe(laterSlot);
    });
});

describe('useOIMField, on a row somebody else resolved', () => {
    it('keeps a reserved row filed, so the value that arrives arrives HERE', () => {
        // A key a screen renders before its data arrives. `hold` is the door
        // that reserves it, and a reserved row holds nothing else at all — no
        // value, in no bucket, and after the unmount no dependent either.
        const { db, cardsService, cards } = build();
        seed(cardsService, cards, db);
        const reservedSlot = cardsService.holdSlotByKey(cards, 'reserved');
        const slot = reservedSlot;

        function Title(): React.ReactElement {
            return <span data-testid="t">{String(useOIMField(cardsService, slot, 'title') ?? '-')}</span>;
        }
        const view = render(<Title />, { wrapper: wrap(db) });
        expect(screen.getByTestId('t').textContent).toBe('-');
        expect(slot.holdCount).toBe(2);

        view.unmount();

        expect(cardsService.getSlotByKey(cards, 'reserved')).toBe(slot);
        expect(slot.holdCount).toBe(1);

        // And the collection still means this identity by that key: the value
        // lands on the object the caller is holding, not on a second one.
        cardsService.slotContentService.upsertEntity(cards, { id: 'reserved', deckId: 'd1', title: 'arrived', rank: 1 });
        db.flush();
        expect(slot.entity?.title).toBe('arrived');
        reservedSlot.owner.unholdSlot(reservedSlot);
    });

    it('keeps a row that was removed while it was mounted', () => {
        // The shape that looks most like ordinary use: the row was real, the
        // component watched it, and a removal emptied it. At that point the row
        // holds no value, so the teardown is what would unfile it.
        const { db, cardsService, cards } = build();
        seed(cardsService, cards, db);
        const keptSlot = cardsService.holdSlotByKey(cards, 'c1');
        const slot = keptSlot;

        function Title(): React.ReactElement {
            return <span data-testid="t">{String(useOIMField(cardsService, slot, 'title') ?? '-')}</span>;
        }
        const view = render(<Title />, { wrapper: wrap(db) });
        expect(screen.getByTestId('t').textContent).toBe('alpha');

        act(() => { cardsService.slotContentService.deleteEntity(cardsService.getSlotByKey(cards, 'c1')); db.flush(); });
        expect(screen.getByTestId('t').textContent).toBe('-');

        view.unmount();

        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(slot);

        // Re-hydrating the key writes to the identity the caller still holds.
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1', title: 'back again', rank: 2 });
        db.flush();
        expect(slot.entity?.title).toBe('back again');
        keptSlot.owner.unholdSlot(keptSlot);
    });

    it('is still subscribed to the row the collection files, after StrictMode remounts it', () => {
        const { db, cardsService, cards } = build();
        seed(cardsService, cards, db);
        const reservedSlot = cardsService.holdSlotByKey(cards, 'reserved');
        const slot = reservedSlot;

        function Title(): React.ReactElement {
            return <span data-testid="t">{String(useOIMField(cardsService, slot, 'title') ?? '-')}</span>;
        }
        render(<Title />, { wrapper: wrapStrict(db) });
        expect(screen.getByTestId('t').textContent).toBe('-');

        act(() => {
            cardsService.slotContentService.upsertEntity(cards, { id: 'reserved', deckId: 'd1', title: 'arrived', rank: 1 });
            db.flush();
        });

        expect(screen.getByTestId('t').textContent).toBe('arrived');
        expect(cardsService.getSlotByKey(cards, 'reserved')).toBe(slot);
        reservedSlot.owner.unholdSlot(reservedSlot);
    });
});
