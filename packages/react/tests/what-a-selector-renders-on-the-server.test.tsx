/** @jest-environment node */
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { OIMDB, createOIMEntitySlotCollectionStoreAggregate } from '@oimdb/core';
import { OIMDBProvider, useOIMSelector } from '../src/index';

type TCard = { id: string; title: string };

describe('what a selector renders on the server', () => {
    it('renders what select returned, with no window and no layout effect', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
        cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace' });
        db.flush();
        function Card(): React.ReactElement {
            return <span>{useOIMSelector(() => cards.getSlotByKey('a').entity?.title)}</span>;
        }
        const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            expect(renderToString(<OIMDBProvider db={db}><Card /></OIMDBProvider>)).toBe('<span>Ace</span>');
            expect(quiet).not.toHaveBeenCalled();
        } finally {
            quiet.mockRestore();
        }
    });
});
