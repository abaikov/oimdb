import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { OIMDB, OIMEffectService, createOIMEntitySlotCollectionStoreAggregate } from '@oimdb/core';
import { OIMDBProvider, useOIMSelector } from '../src/index';

type TCard = { id: string; title: string };

const build = () => {
    const db = new OIMDB();
    const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
    cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace' });
    cards.writeSlotContentByKey('k', { id: 'k', title: 'King' });
    db.flush();
    return { db, cards };
};

describe('what a selector renders with and without deps', () => {
    let subscribeSpy: jest.SpyInstance;
    beforeEach(() => { subscribeSpy = jest.spyOn(OIMEffectService.INSTANCE, 'subscribeEffectToTrackedSources'); });
    afterEach(() => { subscribeSpy.mockRestore(); });

    it('without deps runs select on every render, and leaves the subscription alone while the sources stay', () => {
        const { db, cards } = build();
        let selects = 0;
        function Card({ id }: { id: string; tick: number }): React.ReactElement {
            return <span data-testid="card">{useOIMSelector(() => { selects++; return cards.getSlotByKey(id).entity?.title; })}</span>;
        }
        const { rerender } = render(<OIMDBProvider db={db}><Card id="a" tick={0} /></OIMDBProvider>);
        const mountedSelects = selects;
        const mountedSubscribes = subscribeSpy.mock.calls.length;
        rerender(<OIMDBProvider db={db}><Card id="a" tick={1} /></OIMDBProvider>);
        expect(selects).toBe(mountedSelects + 1);
        expect(subscribeSpy.mock.calls.length).toBe(mountedSubscribes);
        rerender(<OIMDBProvider db={db}><Card id="k" tick={2} /></OIMDBProvider>);
        expect(subscribeSpy.mock.calls.length).toBe(mountedSubscribes + 1);
        expect(screen.getByTestId('card').textContent).toBe('King');
        act(() => { cards.getSlotByKey('k').updateEntity({ title: 'King of hearts' }); db.flush(); });
        expect(screen.getByTestId('card').textContent).toBe('King of hearts');
        act(() => { cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' }); db.flush(); });
        expect(screen.getByTestId('card').textContent).toBe('King of hearts');
    });

    it('with deps runs select only when a dep changes or a source is written', () => {
        const { db, cards } = build();
        let selects = 0;
        function Card({ id }: { id: string; tick: number }): React.ReactElement {
            return <span data-testid="card">{useOIMSelector(() => { selects++; return cards.getSlotByKey(id).entity?.title; }, [id])}</span>;
        }
        const { rerender } = render(<OIMDBProvider db={db}><Card id="a" tick={0} /></OIMDBProvider>);
        const mountedSelects = selects;
        rerender(<OIMDBProvider db={db}><Card id="a" tick={1} /></OIMDBProvider>);
        expect(selects).toBe(mountedSelects);
        expect(mountedSelects).toBe(1);
        rerender(<OIMDBProvider db={db}><Card id="k" tick={2} /></OIMDBProvider>);
        expect(selects).toBe(mountedSelects + 1);
        expect(screen.getByTestId('card').textContent).toBe('King');
        const movedSelects = selects;
        act(() => { cards.getSlotByKey('k').updateEntity({ title: 'King of hearts' }); db.flush(); });
        expect(selects).toBe(movedSelects + 1);
        expect(screen.getByTestId('card').textContent).toBe('King of hearts');
    });

    it('with deps shows a write that a render reaches before the flush', () => {
        const { db, cards } = build();
        function Card({ id }: { id: string; tick: number }): React.ReactElement {
            return <span data-testid="card">{useOIMSelector(() => cards.getSlotByKey(id).entity?.title, [id])}</span>;
        }
        const { rerender } = render(<OIMDBProvider db={db}><Card id="a" tick={0} /></OIMDBProvider>);
        cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' });
        rerender(<OIMDBProvider db={db}><Card id="a" tick={1} /></OIMDBProvider>);
        expect(screen.getByTestId('card').textContent).toBe('Ace of spades');
    });

    it('with a select defined outside the component shows a write that a render reaches before the flush', () => {
        const { db, cards } = build();
        const selectAce = (): string | undefined => cards.getSlotByKey('a').entity?.title;
        function Card(_: { tick: number }): React.ReactElement {
            return <span data-testid="card">{useOIMSelector(selectAce)}</span>;
        }
        const { rerender } = render(<OIMDBProvider db={db}><Card tick={0} /></OIMDBProvider>);
        cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' });
        rerender(<OIMDBProvider db={db}><Card tick={1} /></OIMDBProvider>);
        expect(screen.getByTestId('card').textContent).toBe('Ace of spades');
    });

    it('with empty deps, or with a select defined outside the component, runs select only on a write', () => {
        const { db, cards } = build();
        let selects = 0;
        const selectAce = (): string | undefined => { selects++; return cards.getSlotByKey('a').entity?.title; };
        function Static(): React.ReactElement {
            return <span data-testid="static">{useOIMSelector(() => { selects++; return cards.getSlotByKey('a').entity?.title; }, [])}</span>;
        }
        function Hoisted(): React.ReactElement {
            return <span data-testid="hoisted">{useOIMSelector(selectAce)}</span>;
        }
        function Screen(_: { tick: number }): React.ReactElement {
            return <><Static /><Hoisted /></>;
        }
        const { rerender } = render(<OIMDBProvider db={db}><Screen tick={0} /></OIMDBProvider>);
        const mountedSelects = selects;
        rerender(<OIMDBProvider db={db}><Screen tick={1} /></OIMDBProvider>);
        rerender(<OIMDBProvider db={db}><Screen tick={2} /></OIMDBProvider>);
        expect(selects).toBe(mountedSelects);
        act(() => { cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' }); db.flush(); });
        expect(selects).toBe(mountedSelects + 2);
        expect(screen.getByTestId('static').textContent).toBe('Ace of spades');
        expect(screen.getByTestId('hoisted').textContent).toBe('Ace of spades');
    });
});

describe('two components over one slot nobody holds', () => {
    it('both show a write that lands between their render and their subscription', () => {
        const { db, cards } = build();
        function Card({ testId }: { testId: string }): React.ReactElement {
            return <span data-testid={testId}>{useOIMSelector(() => cards.getSlotByKey('a').entity?.title)}</span>;
        }
        function Writer(): React.ReactElement {
            React.useLayoutEffect(() => { cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' }); }, []);
            return <span />;
        }
        render(<OIMDBProvider db={db}><Card testId="first" /><Card testId="second" /><Writer /></OIMDBProvider>);
        expect(screen.getByTestId('first').textContent).toBe('Ace of spades');
        expect(screen.getByTestId('second').textContent).toBe('Ace of spades');
    });
});
