import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import {
    OIMDB, createOIMColumnGroup, createOIMEntitySlotCollectionStoreAggregate, createOIMSingleSlotStoreAggregate,
    createOIMEntityContentService, createOIMSlotCollectionIndexStoreAggregate, createOIMSourceTrackingComputedService,
    createOIMSingleSourceTrackingComputedService,
} from '@oimdb/core';
import type { TOIMStoreKey } from '@oimdb/core';
import { OIMDBProvider, useOIMSelector } from '../src/index';

type TCard = { id: string; deck: string; title: string; rank: number };

const createAppDB = () => new OIMDB({
    createSchemas: db => {
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
        return {
            default: {
                cards,
                cardsByDeck: createOIMSlotCollectionIndexStoreAggregate(cards, { selectKey: (card: TCard) => card.deck }),
                viewer: createOIMSingleSlotStoreAggregate(db, { slotContentService: createOIMEntityContentService<{ name: string }>() }),
            },
        };
    },
});
type TAppDB = ReturnType<typeof createAppDB>;
const useAppSelector = useOIMSelector.withTypes<TAppDB>();

const seed = (db: TAppDB) => {
    const { cards } = db.schemas.default;
    cards.writeSlotContentByKey('a', { id: 'a', deck: 'spades', title: 'Ace', rank: 1 });
    cards.writeSlotContentByKey('k', { id: 'k', deck: 'spades', title: 'King', rank: 13 });
    cards.writeSlotContentByKey('q', { id: 'q', deck: 'hearts', title: 'Queen', rank: 12 });
    db.flush();
};

const TITLE = createOIMColumnGroup<keyof TCard & string>(['title']);

describe('what a selector renders', () => {
    it('renders an entity read through its aggregate, and re-renders when it is written', () => {
        const db = createAppDB();
        seed(db);
        function Card({ id }: { id: string }): React.ReactElement {
            const card = useAppSelector(appDb => appDb.schemas.default.cards.getSlotByKey(id).entity);
            return <span data-testid="card">{card?.title}</span>;
        }
        render(<OIMDBProvider db={db}><Card id="a" /></OIMDBProvider>);
        expect(screen.getByTestId('card').textContent).toBe('Ace');

        act(() => { db.schemas.default.cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' }); db.flush(); });
        expect(screen.getByTestId('card').textContent).toBe('Ace of spades');
    });

    it('re-renders even though an in-place write kept the entity reference', () => {
        const db = createAppDB();
        seed(db);
        const before = db.schemas.default.cards.getSlotByKey('a').entity;
        function Rank(): React.ReactElement {
            return <span data-testid="rank">{useAppSelector(appDb => appDb.schemas.default.cards.getSlotByKey('a').entity)?.rank}</span>;
        }
        render(<OIMDBProvider db={db}><Rank /></OIMDBProvider>);
        act(() => { db.schemas.default.cards.getSlotByKey('a').updateEntity({ rank: 2 }); db.flush(); });
        expect(db.schemas.default.cards.getSlotByKey('a').entity).toBe(before);
        expect(screen.getByTestId('rank').textContent).toBe('2');
    });

    it('runs select once per change, not three times', () => {
        const db = createAppDB();
        seed(db);
        let selects = 0;
        function Card(): React.ReactElement {
            const title = useAppSelector(appDb => { selects++; return appDb.schemas.default.cards.getSlotByKey('a').entity?.title; });
            return <span>{title}</span>;
        }
        render(<OIMDBProvider db={db}><Card /></OIMDBProvider>);
        const settled = selects;
        act(() => { db.schemas.default.cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' }); db.flush(); });
        expect(selects - settled).toBe(1);
    });

    it('does not render for a write to an entity it did not read', () => {
        const db = createAppDB();
        seed(db);
        let renders = 0;
        function Card(): React.ReactElement {
            renders++;
            return <span>{useAppSelector(appDb => appDb.schemas.default.cards.getSlotByKey('a').entity?.title)}</span>;
        }
        render(<OIMDBProvider db={db}><Card /></OIMDBProvider>);
        const settled = renders;
        act(() => { db.schemas.default.cards.getSlotByKey('k').updateEntity({ title: 'King of hearts' }); db.flush(); });
        expect(renders).toBe(settled);
    });

    it('renders once for many writes in one frame', () => {
        const db = createAppDB();
        seed(db);
        let renders = 0;
        function Card(): React.ReactElement {
            renders++;
            return <span>{useAppSelector(appDb => appDb.schemas.default.cards.getSlotByKey('a').entity?.rank)}</span>;
        }
        render(<OIMDBProvider db={db}><Card /></OIMDBProvider>);
        const settled = renders;
        act(() => {
            const ace = db.schemas.default.cards.getSlotByKey('a');
            ace.updateEntity({ rank: 2 });
            ace.updateEntity({ rank: 3 });
            ace.updateEntity({ rank: 4 });
            db.flush();
        });
        expect(renders - settled).toBe(1);
    });

    it('subscribes to one column through a column group, so a sibling column does not render it', () => {
        const db = createAppDB();
        seed(db);
        let renders = 0;
        function Title(): React.ReactElement {
            renders++;
            const title = useAppSelector(appDb => appDb.schemas.default.cards.getSlotByKey('a').getEntity(TITLE)?.title);
            return <span data-testid="title">{title}</span>;
        }
        render(<OIMDBProvider db={db}><Title /></OIMDBProvider>);
        const settled = renders;
        act(() => { db.schemas.default.cards.getSlotByKey('a').updateEntity({ rank: 2 }); db.flush(); });
        expect(renders).toBe(settled);
        act(() => { db.schemas.default.cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' }); db.flush(); });
        expect(screen.getByTestId('title').textContent).toBe('Ace of spades');
    });

    it('follows a key that comes from props, and stops hearing the key it left', () => {
        const db = createAppDB();
        seed(db);
        let renders = 0;
        function Card({ id }: { id: string }): React.ReactElement {
            renders++;
            return <span data-testid="card">{useAppSelector(appDb => appDb.schemas.default.cards.getSlotByKey(id).entity?.title)}</span>;
        }
        const { rerender } = render(<OIMDBProvider db={db}><Card id="a" /></OIMDBProvider>);
        rerender(<OIMDBProvider db={db}><Card id="k" /></OIMDBProvider>);
        expect(screen.getByTestId('card').textContent).toBe('King');
        act(() => { db.schemas.default.cards.getSlotByKey('k').updateEntity({ title: 'King of hearts' }); db.flush(); });
        expect(screen.getByTestId('card').textContent).toBe('King of hearts');
        const settled = renders;
        act(() => { db.schemas.default.cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' }); db.flush(); });
        expect(renders).toBe(settled);
    });

    it('renders a single through getSingleSlot', () => {
        const db = createAppDB();
        db.schemas.default.viewer.getSingleSlot().writeSlotContent({ name: 'Ann' });
        db.flush();
        function Viewer(): React.ReactElement {
            return <span data-testid="viewer">{useAppSelector(appDb => appDb.schemas.default.viewer.getSingleSlot().entity?.name)}</span>;
        }
        render(<OIMDBProvider db={db}><Viewer /></OIMDBProvider>);
        expect(screen.getByTestId('viewer').textContent).toBe('Ann');
        act(() => { db.schemas.default.viewer.getSingleSlot().updateEntity({ name: 'Bob' }); db.flush(); });
        expect(screen.getByTestId('viewer').textContent).toBe('Bob');
    });

    it('renders a list by member keys: the list renders on membership, a row on its own entity', () => {
        const db = createAppDB();
        seed(db);
        let listRenders = 0;
        const rowRenders = new Map<TOIMStoreKey, number>();
        const Row = React.memo(function Row({ id }: { id: TOIMStoreKey }): React.ReactElement {
            rowRenders.set(id, (rowRenders.get(id) ?? 0) + 1);
            return <li>{useAppSelector(appDb => appDb.schemas.default.cards.getSlotByKey(id).entity?.title)}</li>;
        });
        function Deck(): React.ReactElement {
            listRenders++;
            const ids = useAppSelector(appDb => Array.from(appDb.schemas.default.cardsByDeck.getSlotByKey('spades').getBucketMemberSlots(), member => member.key));
            return <ul data-testid="deck">{ids.map(id => <Row key={id} id={id} />)}</ul>;
        }
        render(<OIMDBProvider db={db}><Deck /></OIMDBProvider>);
        expect(screen.getByTestId('deck').textContent).toBe('AceKing');

        const listSettled = listRenders;
        const kingSettled = rowRenders.get('k');
        act(() => { db.schemas.default.cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' }); db.flush(); });
        expect(screen.getByTestId('deck').textContent).toBe('Ace of spadesKing');
        expect(listRenders).toBe(listSettled);
        expect(rowRenders.get('k')).toBe(kingSettled);

        act(() => { db.schemas.default.cards.writeSlotContentByKey('j', { id: 'j', deck: 'spades', title: 'Jack', rank: 11 }); db.flush(); });
        expect(screen.getByTestId('deck').textContent).toBe('Ace of spadesKingJack');
    });

    it('renders a computed by key and a single computed through value', () => {
        const db = createAppDB();
        seed(db);
        const { cards } = db.schemas.default;
        const loudService = createOIMSourceTrackingComputedService<string, string>({
            derive: slot => (cards.getSlotByKey(slot.key).entity?.title ?? '').toUpperCase(),
            initialValue: '',
        });
        const louds = loudService.createStoreSlot(db);
        const countService = createOIMSingleSourceTrackingComputedService<number>({
            derive: () => cards.getEntityCount(),
            initialValue: 0,
        });
        const count = countService.createStoreSlot(db);
        function Summary(): React.ReactElement {
            const loud = useAppSelector(() => loudService.getSlotByKey(louds, 'a').value);
            const total = useAppSelector(() => countService.getSingleSlot(count).value);
            return <span data-testid="summary">{`${loud} ${total}`}</span>;
        }
        render(<OIMDBProvider db={db}><Summary /></OIMDBProvider>);
        expect(screen.getByTestId('summary').textContent).toBe('ACE 3');
        act(() => {
            cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' });
            cards.writeSlotContentByKey('j', { id: 'j', deck: 'spades', title: 'Jack', rank: 11 });
            db.flush();
        });
        expect(screen.getByTestId('summary').textContent).toBe('ACE OF SPADES 4');
    });

    it('throws a select error into the error boundary', () => {
        const db = createAppDB();
        seed(db);
        class Boundary extends React.Component<{ children: React.ReactNode }, { message: string | undefined }> {
            public override state = { message: undefined as string | undefined };
            public static getDerivedStateFromError(error: Error): { message: string } { return { message: error.message }; }
            public override render(): React.ReactNode {
                return this.state.message === undefined ? this.props.children : <span data-testid="caught">{this.state.message}</span>;
            }
        }
        function Card(): React.ReactElement {
            const rank = useAppSelector(appDb => {
                const card = appDb.schemas.default.cards.getSlotByKey('a').entity;
                if (card !== undefined && card.rank > 1) throw new Error(`rank ${card.rank} is out of range`);
                return card?.rank;
            });
            return <span>{rank}</span>;
        }
        const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            render(<OIMDBProvider db={db}><Boundary><Card /></Boundary></OIMDBProvider>);
            act(() => { db.schemas.default.cards.getSlotByKey('a').updateEntity({ rank: 2 }); db.flush(); });
            expect(screen.getByTestId('caught').textContent).toBe('rank 2 is out of range');
        } finally {
            quiet.mockRestore();
        }
    });

    it('refuses with no provider above it', () => {
        function Card(): React.ReactElement {
            return <span>{useOIMSelector(() => 1)}</span>;
        }
        const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            expect(() => render(<Card />)).toThrow('no <OIMDBProvider db={...}> above this component');
        } finally {
            quiet.mockRestore();
        }
    });

    it('refuses a slot filed on another database instead of never waking', () => {
        const db = createAppDB();
        const otherDb = createAppDB();
        seed(otherDb);
        function Card(): React.ReactElement {
            return <span>{useOIMSelector(() => otherDb.schemas.default.cards.getSlotByKey('a').entity?.title)}</span>;
        }
        const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            expect(() => render(<OIMDBProvider db={db}><Card /></OIMDBProvider>)).toThrow('filed on another OIMDB');
        } finally {
            quiet.mockRestore();
        }
    });
});
