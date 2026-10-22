import { OIMDB } from '@oimdb/core';
import type { Store } from 'redux';
import { createStore } from 'redux';
import type {
    TOIMReduxDefaultCollectionState} from '../src';
import {
    OIMReduxAdapter,
    EOIMReduxReducerActionType
} from '../src';
import { deleteEntityByKey, entityServiceOf, updateEntityByKey } from './support/engine';

type TUser = { id: string; name: string; age: number };

function buildDb() {
    const db = new OIMDB();
    const usersService = entityServiceOf<TUser>(db, item => item.id);
    const users = usersService.createStoreSlot(db);
    return { db, usersService, users };
}

describe('OIMReduxAdapter.createCollectionReducer', () => {
    test('initializes state with every entity on the first OIMDB_UPDATE', () => {
        const { db, usersService, users } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createCollectionReducer<TUser, string, TOIMReduxDefaultCollectionState<TUser, string>>(usersService, users);

        usersService.slotContentService.upsertEntities(users, [
            { id: '1', name: 'Alice', age: 30 },
            { id: '2', name: 'Bob', age: 25 },
        ]);
        db.flush();

        const state = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE });
        expect(state).toEqual({
            entities: {
                '1': { id: '1', name: 'Alice', age: 30 },
                '2': { id: '2', name: 'Bob', age: 25 },
            },
            ids: ['1', '2'],
        });
    });

    test('updates only the touched entity on a subsequent write', () => {
        const { db, usersService, users } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createCollectionReducer<TUser, string, TOIMReduxDefaultCollectionState<TUser, string>>(usersService, users);

        usersService.slotContentService.upsertEntities(users, [
            { id: '1', name: 'Alice', age: 30 },
            { id: '2', name: 'Bob', age: 25 },
        ]);
        db.flush();
        const initial = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE });

        updateEntityByKey(usersService, users,'1', { age: 31 });
        db.flush();
        const next = reducer(initial, { type: EOIMReduxReducerActionType.UPDATE }) as TOIMReduxDefaultCollectionState<TUser, string>;

        expect(next.entities['1']).toEqual({ id: '1', name: 'Alice', age: 31 });
        // The untouched entity keeps the same reference — nothing re-read it.
        expect(next.entities['2']).toBe((initial as TOIMReduxDefaultCollectionState<TUser, string>).entities['2']);
        expect(next.ids).toEqual(['1', '2']);
    });

    test('removal drops the entity from entities and ids', () => {
        const { db, usersService, users } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createCollectionReducer<TUser, string, TOIMReduxDefaultCollectionState<TUser, string>>(usersService, users);

        usersService.slotContentService.upsertEntities(users, [
            { id: '1', name: 'Alice', age: 30 },
            { id: '2', name: 'Bob', age: 25 },
        ]);
        db.flush();
        const initial = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE });

        deleteEntityByKey(usersService, users,'1');
        db.flush();
        const next = reducer(initial, { type: EOIMReduxReducerActionType.UPDATE }) as TOIMReduxDefaultCollectionState<TUser, string>;

        expect(next.entities['1']).toBeUndefined();
        expect(next.entities['2']).toEqual({ id: '2', name: 'Bob', age: 25 });
        expect(next.ids).toEqual(['2']);
    });

    test('a custom mapper replaces the default one', () => {
        const { db, usersService, users } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createCollectionReducer<TUser, string, { count: number }>(
            usersService,
            users,
            undefined,
            (entityService, entityStoreSlot) => {
                let count = 0;
                for (const slot of entityService.getSlots(entityStoreSlot)) if (slot.entity !== undefined) count++;
                return { count };
            }
        );

        usersService.slotContentService.upsertEntities(users, [
            { id: '1', name: 'Alice', age: 30 },
            { id: '2', name: 'Bob', age: 25 },
        ]);
        db.flush();

        const state = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE });
        expect(state).toEqual({ count: 2 });
    });

    test('a write to a collection dispatches OIMDB_UPDATE once per frame, not once per write', () => {
        const { db, usersService, users } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createCollectionReducer<TUser, string, TOIMReduxDefaultCollectionState<TUser, string>>(usersService, users);
        const store: Store = createStore(reducer as never);
        adapter.setStore(store);

        const dispatchSpy = jest.spyOn(store, 'dispatch');

        usersService.slotContentService.upsertEntities(users, [
            { id: '1', name: 'Alice', age: 30 },
            { id: '2', name: 'Bob', age: 25 },
        ]);
        updateEntityByKey(usersService, users,'1', { age: 31 });
        db.flush();

        expect(dispatchSpy).toHaveBeenCalledTimes(1);
        expect(dispatchSpy).toHaveBeenCalledWith({ type: EOIMReduxReducerActionType.UPDATE });
    });

    test('nothing is dispatched for a frame this adapter does not watch', () => {
        const { db, usersService, users } = buildDb();
        const otherService = entityServiceOf<TUser>(db, item => item.id);
        const other = otherService.createStoreSlot(db);
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createCollectionReducer<TUser, string, TOIMReduxDefaultCollectionState<TUser, string>>(usersService, users);
        const store: Store = createStore(reducer as never);
        adapter.setStore(store);

        const dispatchSpy = jest.spyOn(store, 'dispatch');

        // A write to a collection nobody registered a reducer for.
        otherService.slotContentService.upsertEntity(other, { id: '9', name: 'Ghost', age: 0 });
        db.flush();

        expect(dispatchSpy).not.toHaveBeenCalled();
    });
});
