import type { Action } from 'redux';
import { OIMDB } from '@oimdb/core';
import type { Store } from 'redux';
import { createStore, applyMiddleware } from 'redux';
import type {
    TOIMReduxDefaultCollectionState,
    TOIMReduxCollectionReducerChildOptions} from '../src';
import {
    OIMReduxAdapter,
    EOIMReduxReducerActionType
} from '../src';
import { entityServiceOf, updateEntityByKey } from './support/engine';

type TUser = { id: string; name: string; age: number };
type TState = TOIMReduxDefaultCollectionState<TUser, string>;

const childReducer = (state: TState | undefined, action: Action): TState => {
    if (state === undefined) return { entities: {}, ids: [] };
    if (action.type === 'UPDATE_USER_NAME') {
        const typed = action as { type: string; id: string; name: string };
        return {
            ...state,
            entities: {
                ...state.entities,
                [typed.id]: { ...state.entities[typed.id], name: typed.name },
            },
        };
    }
    if (action.type === 'ADD_USER') {
        const typed = action as { type: string; user: TUser };
        return {
            entities: { ...state.entities, [typed.user.id]: typed.user },
            ids: [...state.ids, typed.user.id],
        };
    }
    if (action.type === 'REMOVE_USER') {
        const typed = action as { type: string; id: string };
        const entities = { ...state.entities };
        delete entities[typed.id];
        return { entities, ids: state.ids.filter(id => id !== typed.id) };
    }
    return state;
};

/**
 * The five-line opening every test in this file shares: a channel, a
 * collection, an adapter over it and the collection reducer wrapping
 * `childReducer`. What is under test starts at the dispatch that follows.
 */
function buildAdapter() {
    const db = new OIMDB();
    const usersService = entityServiceOf<TUser>(db, item => item.id);
    const users = usersService.createStoreSlot(db);
    const adapter = new OIMReduxAdapter({ channelMap: db });
    const childOptions: TOIMReduxCollectionReducerChildOptions<TUser, string, TState> = {
        reducer: childReducer,
        keyOf: e => e.id,
    };
    return {
        db,
        usersService,
        users,
        adapter,
        reducer: adapter.createCollectionReducer<TUser, string, TState>(usersService, users, childOptions),
    };
}

describe('OIMReduxAdapter child-reducer sync-back', () => {
    test('a custom action handled by the child reducer lands in Redux state and syncs back into the engine', () => {
        const { db, usersService, users, adapter, reducer } = buildAdapter();
        usersService.slotContentService.upsertEntities(users, [{ id: '1', name: 'Alice', age: 30 }]);
        db.flush();

        const store: Store = createStore(reducer as never);
        adapter.setStore(store);

        store.dispatch({ type: 'UPDATE_USER_NAME', id: '1', name: 'Alice Updated' });

        // Redux sees the child reducer's own result immediately...
        const state = store.getState() as TState;
        expect(state.entities['1'].name).toBe('Alice Updated');
        expect(state.entities['1'].age).toBe(30);
        // ...and the same write is mirrored back into the collection it came from.
        expect(usersService.getSlotByKey(users, '1')?.entity).toEqual({ id: '1', name: 'Alice Updated', age: 30 });
    });

    test('syncs an entity added through the child reducer into the collection', () => {
        const { usersService, users, adapter, reducer } = buildAdapter();
        const store: Store = createStore(reducer as never);
        adapter.setStore(store);

        store.dispatch({ type: 'ADD_USER', user: { id: '2', name: 'Bob', age: 25 } });

        expect(usersService.getSlotByKey(users, '2')?.entity).toEqual({ id: '2', name: 'Bob', age: 25 });
    });

    test('syncs an entity removed through the child reducer out of the collection', () => {
        const { db, usersService, users, adapter, reducer } = buildAdapter();
        usersService.slotContentService.upsertEntities(users, [
            { id: '1', name: 'Alice', age: 30 },
            { id: '2', name: 'Bob', age: 25 },
        ]);
        db.flush();

        const store: Store = createStore(reducer as never);
        adapter.setStore(store);

        store.dispatch({ type: 'REMOVE_USER', id: '1' });

        expect(usersService.getSlotByKey(users, '1')?.entity).toBeUndefined();
        expect(usersService.getSlotByKey(users, '2')?.entity).toEqual({ id: '2', name: 'Bob', age: 25 });
    });

    test("the middleware's flush reports what it drained, including the sync-back's own writes", () => {
        const { db, usersService, users, adapter, reducer } = buildAdapter();
        usersService.slotContentService.upsertEntities(users, [{ id: '1', name: 'Alice', age: 30 }]);
        db.flush();

        const store: Store = createStore(reducer as never, applyMiddleware(adapter.createMiddleware()));
        adapter.setStore(store);
        const dispatchSpy = jest.spyOn(store, 'dispatch');

        store.dispatch({ type: 'UPDATE_USER_NAME', id: '1', name: 'Alice Updated' });

        // TWO. The middleware does not flush under a frame-wide mute: that would
        // drop every OTHER change in the same frame. See
        // `pending-frame-outside-the-dispatch.test.ts`, and
        // `OIMReduxAdapter.createMiddleware` for why narrowing the mute cannot
        // be made honest: whether Redux really holds what the runtime now holds
        // depends on the population's write strategy and on a mapper this adapter
        // may not have written.
        //
        // What the extra dispatch buys back is that the store shows what the
        // runtime holds. What it costs is one re-run of the mapper over a runtime
        // that agrees with the store — an equal state with a new identity — and
        // only for the collection whose own child did the writing. Any other
        // reducer over this runtime needs that dispatch.
        expect(dispatchSpy).toHaveBeenCalledTimes(2);
        expect(dispatchSpy).toHaveBeenLastCalledWith({ type: EOIMReduxReducerActionType.UPDATE });
        expect((store.getState() as TState).entities['1'].name).toBe('Alice Updated');

        // A write the store doesn't know about yet (made directly, no round
        // trip) still produces exactly one OIMDB_UPDATE on its own frame.
        updateEntityByKey(usersService, users, '1', { age: 32 });
        db.flush();
        expect(dispatchSpy).toHaveBeenCalledTimes(3);
        expect(dispatchSpy).toHaveBeenLastCalledWith({ type: EOIMReduxReducerActionType.UPDATE });
    });
});
