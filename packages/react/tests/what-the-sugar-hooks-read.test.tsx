import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import {
    OIMDB, createOIMComputedService, createOIMEntityContentService, createOIMEntitySlotCollectionStoreAggregate,
    createOIMSingleComputedService, createOIMSingleSlotStoreAggregate, createOIMSlotCollectionIndexStoreAggregate,
} from '@oimdb/core';
import {
    OIMDBProvider, useOIMBucketMemberKeysByKey, useOIMComputedValueByKey, useOIMEntities, useOIMEntitiesByKey,
    useOIMEntityByKey, useOIMSingleComputedValue, useOIMSingleEntity,
} from '../src/index';

type TCard = { id: string; deck: string; title: string };

const build = () => {
    const db = new OIMDB();
    const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
    const cardsByDeck = createOIMSlotCollectionIndexStoreAggregate(cards, { selectKey: (card: TCard) => card.deck });
    const viewer = createOIMSingleSlotStoreAggregate(db, { slotContentService: createOIMEntityContentService<{ name: string }>() });
    const loudService = createOIMComputedService<string, string>({
        createSources: slot => ({ sourceSlots: [cards.getSlotByKey(slot.key)] }),
        derive: slot => (cards.getSlotByKey(slot.key).entity?.title ?? '').toUpperCase(),
        initialValue: '',
    });
    const louds = loudService.createStoreAggregate(loudService.createStoreSlot(db));
    const countService = createOIMSingleComputedService<number>({
        createSources: () => ({ sourceSlots: [cardsByDeck.getSlotByKey('spades')] }),
        derive: () => cardsByDeck.getSlotByKey('spades').getBucketMemberSlotCount(),
        initialValue: 0,
    });
    const spadesCount = countService.createStoreAggregate(countService.createStoreSlot(db));
    cards.writeSlotContentByKey('a', { id: 'a', deck: 'spades', title: 'Ace' });
    cards.writeSlotContentByKey('k', { id: 'k', deck: 'spades', title: 'King' });
    viewer.getSingleSlot().writeSlotContent({ name: 'Ann' });
    db.flush();
    return { db, cards, cardsByDeck, viewer, louds, spadesCount };
};

describe('what the sugar hooks read', () => {
    it('reads entities, members, computeds and singles through the aggregates, and follows a write', () => {
        const { db, cards, cardsByDeck, viewer, louds, spadesCount } = build();
        function Screen(): React.ReactElement {
            const ace = useOIMEntityByKey(cards, 'a');
            const spades = useOIMEntitiesByKey(cardsByDeck, 'spades');
            const spadeIds = useOIMBucketMemberKeysByKey(cardsByDeck, 'spades');
            const loudAce = useOIMComputedValueByKey(louds, 'a');
            const who = useOIMSingleEntity(viewer);
            const count = useOIMSingleComputedValue(spadesCount);
            const all = useOIMEntities(cards);
            const line = [
                ace?.title, spades.map(card => card.title).join('+'), spadeIds.join('+'),
                loudAce, who?.name, count, all.length,
            ].join(' ');
            return <span data-testid="screen">{line}</span>;
        }
        render(<OIMDBProvider db={db}><Screen /></OIMDBProvider>);
        expect(screen.getByTestId('screen').textContent).toBe('Ace Ace+King a+k ACE Ann 2 2');

        act(() => {
            cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' });
            cards.writeSlotContentByKey('j', { id: 'j', deck: 'spades', title: 'Jack' });
            viewer.getSingleSlot().updateEntity({ name: 'Bob' });
            db.flush();
        });
        expect(screen.getByTestId('screen').textContent).toBe('Ace of spades Ace of spades+King+Jack a+k+j ACE OF SPADES Bob 3 3');
    });

    it('re-renders a row hook only for its own entity', () => {
        const { db, cards } = build();
        let renders = 0;
        function Row(): React.ReactElement {
            renders++;
            return <span>{useOIMEntityByKey(cards, 'a')?.title}</span>;
        }
        render(<OIMDBProvider db={db}><Row /></OIMDBProvider>);
        const settled = renders;
        act(() => { cards.getSlotByKey('k').updateEntity({ title: 'King of hearts' }); db.flush(); });
        expect(renders).toBe(settled);
    });
});
