/**
 * The window between a render and the subscription that render commits.
 *
 * `useSyncExternalStore` reads a snapshot while rendering, calls `subscribe` in a
 * PASSIVE effect, then reads the snapshot again and forces a re-render if the
 * two differ. That second read is the one check React added for exactly this
 * window — and with a snapshot that is a local counter bumped only by the
 * notification, and no notification possible before the subscription exists, it
 * compares `0` against `0` and can never fire.
 *
 * The window is not narrow. Passive effects run after EVERY layout effect in the
 * tree, so a sibling's `useLayoutEffect` that writes and flushes — the ordinary
 * shape of "seed this screen from what just arrived" — lands inside it. What the
 * component shows afterwards is what it read while rendering, permanently.
 *
 * Every test here is that sibling. The fix is a bump of the counter INSIDE
 * `subscribe`, before attaching, so the version React captured at render is
 * stale by construction and its post-commit check re-reads the value — which
 * every hook reads OUTSIDE the snapshot.
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import type { TOIMEntitySlot } from '@oimdb/core';
import { OIMDB, createOIMBucketService, createOIMEntityService } from '@oimdb/core';
import {
    OIMDBProvider, useOIMEntity, useOIMField, useOIMBucketSlotsByKey, useOIMBucketSlots,
} from '../src/index';

type TCard = { id: string; deckId: string; title: string; rank: number };
type TCardSlot = TOIMEntitySlot<TCard>;

/**
 * `put` writes rows and then files them, because nothing files them for it: a
 * write moves the card's value and touches no bucket. Every writer here that is
 * supposed to change a CONTAINMENT goes through `put`; the ones that only move a
 * title write the row directly.
 */
function build() {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMBucketService<TCardSlot>(db);
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
                if (row.deckId === deck) inDeck.push(cardsService.getSlotByKey(cards, row.id)!);
            }
            const heldSlot = byDeckService.holdSlotByKey(byDeck, deck);
            byDeckService.slotContentService.writeBucketMemberSlots(heldSlot, inDeck);
            heldSlot.owner.unholdSlot(heldSlot);
        }
    };

    return { db, cardsService, cards, byDeckService, byDeck, put };
}

const wrap = (db: OIMDB) =>
    function Wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
        return <OIMDBProvider db={db}>{children}</OIMDBProvider>;
    };

/**
 * The sibling. Its layout effect runs after every component in this commit has
 * rendered and before any of them has subscribed, which is the whole window.
 */
function makeWriter(write: () => void): () => React.ReactElement {
    return function Writer(): React.ReactElement {
        React.useLayoutEffect(write, []);
        return <span data-testid="writer" />;
    };
}

describe('a write from a sibling layout effect, which lands between render and subscribe', () => {
    it('is shown by useOIMEntity', () => {
        const { db, cardsService, cards } = build();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1', title: 'alpha', rank: 1 });
        db.flush();
        const Writer = makeWriter(() => {
            cardsService.slotContentService.updateEntity(cardsService.getSlotByKey(cards, 'c1'), { title: 'ALPHA' });
            db.flush();
        });

        function Row(): React.ReactElement {
            return <span data-testid="t">{useOIMEntity(cardsService, cards, 'c1')?.title}</span>;
        }
        render(<><Row /><Writer /></>, { wrapper: wrap(db) });

        // Without the bump in `subscribe` this reads 'alpha' — the render-time
        // value, kept for ever, because the post-commit check compared 0 with 0.
        expect(screen.getByTestId('t').textContent).toBe('ALPHA');
    });

    it('is shown by useOIMField', () => {
        const { db, cardsService, cards } = build();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1', title: 'alpha', rank: 1 });
        db.flush();
        const slot = cardsService.getSlotByKey(cards, 'c1')!;
        const Writer = makeWriter(() => {
            cardsService.slotContentService.updateEntity(slot, { title: 'ALPHA' });
            db.flush();
        });

        function Title(): React.ReactElement {
            return <span data-testid="t">{String(useOIMField(cardsService, slot, 'title') ?? '-')}</span>;
        }
        render(<><Title /><Writer /></>, { wrapper: wrap(db) });

        expect(screen.getByTestId('t').textContent).toBe('ALPHA');
    });

    it('is shown by useOIMBucketSlots', () => {
        const { db, byDeckService, byDeck, put } = build();
        put({ id: 'c1', deckId: 'd1', title: 'alpha', rank: 1 });
        db.flush();
        const d1Slot = byDeckService.holdSlotByKey(byDeck, 'd1');
        const Writer = makeWriter(() => {
            put({ id: 'c2', deckId: 'd1', title: 'beta', rank: 2 });
            db.flush();
        });

        function List(): React.ReactElement {
            return (
                <span data-testid="list">
                    {useOIMBucketSlots(byDeckService, d1Slot).map(slot => slot.entity?.id).join(',')}
                </span>
            );
        }
        render(<><List /><Writer /></>, { wrapper: wrap(db) });

        expect(screen.getByTestId('list').textContent).toBe('c1,c2');
        d1Slot.owner.unholdSlot(d1Slot);
    });

    it('is shown by useOIMBucketSlotsByKey, whose own resolve is inside the same window', () => {
        // Sharpest here: the render path's `getSlotByKey` mints an empty bucket
        // into the unused-slot collector — so the render-time answer is `[]`.
        // The layout effect files the group,
        // `subscribe` then resolves it, and without the bump nothing tells React
        // that the two reads disagree.
        const { db, byDeckService, byDeck, put } = build();
        put({ id: 'c1', deckId: 'd1', title: 'alpha', rank: 1 });
        db.flush();
        const Writer = makeWriter(() => {
            put({ id: 'c9', deckId: 'later', title: 'ninth', rank: 1 });
            db.flush();
        });

        function List(): React.ReactElement {
            return (
                <span data-testid="list">
                    {useOIMBucketSlotsByKey(byDeckService, byDeck, 'later').map(slot => slot.entity?.id).join(',')}
                </span>
            );
        }
        render(<><List /><Writer /></>, { wrapper: wrap(db) });

        expect(screen.getByTestId('list').textContent).toBe('c9');
    });
});

describe('what the bump costs', () => {
    it('renders one extra time per SUBSCRIPTION commit, and not per render or per write', () => {
        // Between render and subscribe the component holds nothing, and a write to an
        // unheld slot leaves no trace on the channel, so the window cannot be inspected:
        // the bump is paid on every subscription, never per notification.
        const { db, cardsService, cards } = build();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1', title: 'alpha', rank: 1 });
        db.flush();

        let renders = 0;
        function Row({ pk }: { pk: string }): React.ReactElement {
            renders++;
            return <span data-testid="t">{useOIMEntity(cardsService, cards, pk)?.title}</span>;
        }
        const view = render(<Row pk="c1" />, { wrapper: wrap(db) });
        expect(renders).toBe(2);

        view.rerender(<Row pk="c1" />);
        expect(renders).toBe(3);
    });
});
