import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { OIMDB, createOIMEntitySlotCollectionStoreAggregate, isOIMSlotReleased } from '@oimdb/core';
import type { IOIMSlotSubscriptionListener, TOIMSlot } from '@oimdb/core';
import { OIMDBProvider, useOIMSelector } from '../src/index';

type TCard = { id: string; title: string };

const build = (slotSubscriptionListener?: IOIMSlotSubscriptionListener) => {
    const db = new OIMDB();
    const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db, { slotSubscriptionListener });
    return { db, cards };
};

describe('what a selector holds', () => {
    it('holds the slot it read while mounted, and lets it go on unmount', () => {
        const { db, cards } = build();
        function Card(): React.ReactElement {
            return <span>{useOIMSelector(() => cards.getSlotByKey('a').entity?.title ?? 'none')}</span>;
        }
        const { unmount } = render(<OIMDBProvider db={db}><Card /></OIMDBProvider>);
        const reserved = cards.peekSlotByKey('a') as TOIMSlot;
        act(() => { db.flush(); });
        expect(isOIMSlotReleased(reserved)).toBe(false);

        unmount();
        db.flush();
        expect(isOIMSlotReleased(reserved)).toBe(true);
    });

    it('shows a value that arrives at an empty slot it is holding', () => {
        const { db, cards } = build();
        function Card(): React.ReactElement {
            return <span data-testid="card">{useOIMSelector(() => cards.getSlotByKey('a').entity?.title ?? 'loading')}</span>;
        }
        render(<OIMDBProvider db={db}><Card /></OIMDBProvider>);
        expect(screen.getByTestId('card').textContent).toBe('loading');
        act(() => { cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace' }); db.flush(); });
        expect(screen.getByTestId('card').textContent).toBe('Ace');
    });

    it('mints nothing that survives a flush from a render React throws away', () => {
        const { db, cards } = build();
        function Card(): React.ReactElement {
            const title = useOIMSelector(() => cards.getSlotByKey('a').entity?.title);
            throw new Error(`thrown after reading ${String(title)}`);
        }
        const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            expect(() => render(<OIMDBProvider db={db}><Card /></OIMDBProvider>)).toThrow('thrown after reading');
        } finally {
            quiet.mockRestore();
        }
        db.flush();
        expect(cards.peekSlotByKey('a')).toBeUndefined();
    });

    it('under StrictMode, which mounts every effect twice, leaves one subscription and the value arrives', () => {
        const firstSubscribed: TOIMSlot[] = [];
        const lastUnsubscribed: TOIMSlot[] = [];
        const { db, cards } = build({
            onSlotFirstSubscribed: slot => { firstSubscribed.push(slot); },
            onSlotLastUnsubscribed: slot => { lastUnsubscribed.push(slot); },
        });
        function Card(): React.ReactElement {
            return <span data-testid="card">{useOIMSelector(() => cards.getSlotByKey('a').entity?.title ?? 'loading')}</span>;
        }
        render(<React.StrictMode><OIMDBProvider db={db}><Card /></OIMDBProvider></React.StrictMode>);
        expect(firstSubscribed.length - lastUnsubscribed.length).toBe(1);
        act(() => { cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace' }); db.flush(); });
        expect(screen.getByTestId('card').textContent).toBe('Ace');
    });

    it('under StrictMode, tells the subscription listener of the first subscriber as many times as it records here', () => {
        const firstSubscribed: TOIMSlot[] = [];
        const { db, cards } = build({ onSlotFirstSubscribed: slot => { firstSubscribed.push(slot); }, onSlotLastUnsubscribed: () => undefined });
        function Card(): React.ReactElement {
            return <span>{useOIMSelector(() => cards.getSlotByKey('a').entity?.title)}</span>;
        }
        render(<React.StrictMode><OIMDBProvider db={db}><Card /></OIMDBProvider></React.StrictMode>);
        expect(firstSubscribed.length).toBe(2);
    });
});
