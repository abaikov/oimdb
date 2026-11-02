import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { OIMDB, createOIMEntitySlotCollectionStoreAggregate } from '@oimdb/core';
import { OIMDBProvider, useOIMDB, useOIMEntity } from '../src/index';

type TTodo = { id: string; title: string };

const createAppDB = () => new OIMDB({
    createSchemas: (db) => ({ default: { todos: createOIMEntitySlotCollectionStoreAggregate<TTodo>(db) } }),
});

type TAppDB = ReturnType<typeof createAppDB>;

const useAppDB = useOIMDB.withTypes<TAppDB>();

describe('what a typed db hook hands a component', () => {
    it('is the same hook, typed with the app db, so a component reads its schemas without a cast', () => {
        const db = createAppDB();
        db.schemas.default.todos.writeSlotContentByKey('t1', { id: 't1', title: 'Buy milk' });
        db.flush();

        function Todo({ id }: { id: string }): React.ReactElement {
            const todos = useAppDB().schemas.default.todos;
            return <span data-testid={`todo-${id}`}>{useOIMEntity(todos.storeSlot, id)?.title}</span>;
        }
        render(<OIMDBProvider db={db}><Todo id="t1" /></OIMDBProvider>);
        expect(screen.getByTestId('todo-t1').textContent).toBe('Buy milk');

        act(() => {
            db.schemas.default.todos.getSlotByKey('t1').updateEntity({ title: 'Buy oat milk' });
            db.flush();
        });
        expect(screen.getByTestId('todo-t1').textContent).toBe('Buy oat milk');
        expect(useAppDB).toBe(useOIMDB);
    });

    it('keeps the untyped hook untyped', () => {
        const useSchemasOfThePlainHook = (): unknown => {
            // @ts-expect-error the plain hook does not know the app schemas
            return useOIMDB().schemas.default;
        };
        expect(typeof useSchemasOfThePlainHook).toBe('function');
    });
});
