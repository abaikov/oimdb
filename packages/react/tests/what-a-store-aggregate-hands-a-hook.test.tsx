import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import {
    OIMDB, createOIMSlotCollectionIndexService, createOIMSlotCollectionStoreAggregate, createOIMSingleSlotStoreAggregate,
    createOIMSlotContentEntityService,
} from '@oimdb/core';
import { OIMDBProvider, useOIMBucketSlotsByKey, useOIMEntity, useOIMSingleEntity } from '../src/index';

type TTodo = { id: string; listId: string; title: string };
type TFilter = { query: string };

describe('what a store aggregate hands a hook', () => {
    it('renders an entity, an index bucket and a single through the store slots of their aggregates', () => {
        const db = new OIMDB();
        const todos = createOIMSlotCollectionStoreAggregate(db, { slotContentService: createOIMSlotContentEntityService<TTodo>() });
        const byListService = createOIMSlotCollectionIndexService({ entityService: todos.slotService, columns: ['listId'] });
        const byList = byListService.createStoreAggregate(byListService.createIndexStoreSlot(todos.storeSlot));
        const filter = createOIMSingleSlotStoreAggregate(db, { slotContentService: createOIMSlotContentEntityService<TFilter>() });
        todos.writeSlotContentByKey('t1', { id: 't1', listId: 'inbox', title: 'Buy milk' });
        filter.writeSingleSlotContent({ query: 'milk' });
        db.flush();

        function Todo({ id }: { id: string }): React.ReactElement {
            return <span data-testid={`todo-${id}`}>{useOIMEntity(todos.storeSlot, id)?.title}</span>;
        }
        function Inbox(): React.ReactElement {
            return <span data-testid="inbox">{useOIMBucketSlotsByKey(byList.storeSlot, 'inbox').length}</span>;
        }
        function Query(): React.ReactElement {
            return <span data-testid="query">{useOIMSingleEntity(filter.storeSlot)?.query}</span>;
        }
        render(<OIMDBProvider db={db}><Todo id="t1" /><Inbox /><Query /></OIMDBProvider>);

        expect(screen.getByTestId('todo-t1').textContent).toBe('Buy milk');
        expect(screen.getByTestId('inbox').textContent).toBe('1');
        expect(screen.getByTestId('query').textContent).toBe('milk');

        act(() => {
            todos.writeSlotContentByKey('t2', { id: 't2', listId: 'inbox', title: 'Call mum' });
            todos.slotContentService.updateEntity(todos.getSlotByKey('t1'), { title: 'Buy oat milk' });
            filter.writeSingleSlotContent({ query: 'oat' });
            db.flush();
        });

        expect(screen.getByTestId('todo-t1').textContent).toBe('Buy oat milk');
        expect(screen.getByTestId('inbox').textContent).toBe('2');
        expect(screen.getByTestId('query').textContent).toBe('oat');
    });
});
