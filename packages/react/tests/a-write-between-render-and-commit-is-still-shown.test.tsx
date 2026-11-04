import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { OIMDB, createOIMEntitySlotCollectionStoreAggregate, createOIMSlotCollectionIndexStoreAggregate } from '@oimdb/core';
import { OIMDBProvider, useOIMSelector } from '../src/index';

type TCard = { id: string; deck: string; title: string };

const build = () => {
    const db = new OIMDB();
    const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
    const cardsByDeck = createOIMSlotCollectionIndexStoreAggregate(cards, { selectKey: (card: TCard) => card.deck });
    cards.writeSlotContentByKey('a', { id: 'a', deck: 'spades', title: 'Ace' });
    cards.writeSlotContentByKey('k', { id: 'k', deck: 'spades', title: 'King' });
    db.flush();
    return { db, cards, cardsByDeck };
};

function makeWriter(write: () => void): () => React.ReactElement {
    return function Writer(): React.ReactElement {
        React.useLayoutEffect(write, []);
        return <span />;
    };
}

describe('a write from a sibling layout effect, which lands between render and commit', () => {
    it('is shown for an entity on mount', () => {
        const { db, cards } = build();
        function Card(): React.ReactElement {
            return <span data-testid="card">{useOIMSelector(() => cards.getSlotByKey('a').entity?.title)}</span>;
        }
        const Writer = makeWriter(() => { cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' }); db.flush(); });
        render(<OIMDBProvider db={db}><Card /><Writer /></OIMDBProvider>);
        expect(screen.getByTestId('card').textContent).toBe('Ace of spades');
    });

    it('is shown for a bucket on mount', () => {
        const { db, cards, cardsByDeck } = build();
        function Deck(): React.ReactElement {
            const count = useOIMSelector(() => cardsByDeck.getSlotByKey('spades').getBucketMemberSlotCount());
            return <span data-testid="deck">{count}</span>;
        }
        const Writer = makeWriter(() => { cards.writeSlotContentByKey('j', { id: 'j', deck: 'spades', title: 'Jack' }); db.flush(); });
        render(<OIMDBProvider db={db}><Deck /><Writer /></OIMDBProvider>);
        expect(screen.getByTestId('deck').textContent).toBe('3');
    });

    it('is shown for the new key after the key moved, when the write lands on the slot the render just minted', () => {
        const { db, cards } = build();
        function Card({ id }: { id: string }): React.ReactElement {
            return <span data-testid="card">{useOIMSelector(() => cards.getSlotByKey(id).entity?.title ?? 'loading')}</span>;
        }
        function Screen({ id, write }: { id: string; write: (() => void) | undefined }): React.ReactElement {
            const Writer = React.useMemo(() => makeWriter(write ?? (() => undefined)), [write]);
            return <><Card id={id} /><Writer /></>;
        }
        const { rerender } = render(<OIMDBProvider db={db}><Screen id="a" write={undefined} /></OIMDBProvider>);
        const writeQueen = (): void => { cards.writeSlotContentByKey('q', { id: 'q', deck: 'hearts', title: 'Queen' }); db.flush(); };
        rerender(<OIMDBProvider db={db}><Screen id="q" write={writeQueen} /></OIMDBProvider>);
        expect(screen.getByTestId('card').textContent).toBe('Queen');
    });

    it('renders again when a flush before the subscription released the empty slot the render minted', () => {
        const { db, cards } = build();
        const Flusher = makeWriter(() => { db.flush(); });
        function Card(): React.ReactElement {
            return <span data-testid="card">{useOIMSelector(() => cards.getSlotByKey('x').entity?.title ?? 'loading')}</span>;
        }
        const minted = (): unknown => cards.peekSlotByKey('x');
        render(<OIMDBProvider db={db}><Card /><Flusher /></OIMDBProvider>);
        expect(minted()).toBeDefined();
        act(() => { cards.writeSlotContentByKey('x', { id: 'x', deck: 'hearts', title: 'Ten' }); db.flush(); });
        expect(screen.getByTestId('card').textContent).toBe('Ten');
    });

    it('costs one extra render per subscription commit, and none per write', () => {
        const { db, cards } = build();
        let renders = 0;
        function Card(): React.ReactElement {
            renders++;
            return <span>{useOIMSelector(() => cards.getSlotByKey('a').entity?.title)}</span>;
        }
        render(<OIMDBProvider db={db}><Card /></OIMDBProvider>);
        expect(renders).toBe(2);
        act(() => { cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' }); db.flush(); });
        expect(renders).toBe(3);
    });
});
