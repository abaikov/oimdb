import * as React from 'react';
import { render, screen, act } from '@testing-library/react';
import {
    OIMDB, createOIMEntityService, createOIMIndexService,
} from '@oimdb/core';
import { OIMDBProvider, useOIMSlotsByKeys, useOIMValue } from '../src/index';

type TCard = { id: string; deck: string };

describe('an index passed to useOIMSlotsByKeys', () => {
    it('holds the bucket while mounted and renders its members', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const deckIndexService = createOIMIndexService(db, { entityService: cardsService, columns: ['deck'] });
        const deckIndex = deckIndexService.createIndexStoreSlot(cards);
        cardsService.slotContentService.upsertEntities(cards, [{ id: 'c1', deck: 'spades' }, { id: 'c2', deck: 'hearts' }]);
        db.flush();

        function Spades(): React.ReactElement {
            const [spades] = useOIMSlotsByKeys(deckIndexService, deckIndex, ['spades']);
            const ids = useOIMValue(React.useMemo(() => ({
                sourceSlots: [spades],
                derive: () => Array.from(deckIndexService.slotContentService.getBucketMemberSlots(spades), slot => slot.entity?.id).join(','),
            }), [spades]));
            return <span data-testid="spades">{ids}</span>;
        }
        render(
            <OIMDBProvider db={db}><Spades /></OIMDBProvider>,
        );
        expect(screen.getByTestId('spades').textContent).toBe('c1');

        act(() => { cardsService.slotContentService.upsertEntity(cards, { id: 'c3', deck: 'spades' }); db.flush(); });

        expect(screen.getByTestId('spades').textContent).toBe('c1,c3');
    });
});
