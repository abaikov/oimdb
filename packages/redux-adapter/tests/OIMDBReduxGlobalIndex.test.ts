import {
    OIMEventQueue,
    OIMEventQueueSchedulerImmediate,
    OIMReactiveCollection,
    OIMReactiveCollectionGlobalIndexManualArrayBased,
    OIMDerivedCollectionGlobalIndexArrayBased,
} from '@oimdb/core';
import { Store, createStore, combineReducers, applyMiddleware } from 'redux';
import {
    OIMDBReduxAdapter,
    EOIMDBReduxReducerActionType,
    TOIMDBReduxDefaultGlobalIndexState,
} from '../src';

interface User {
    id: string;
    name: string;
    rank: number;
}

describe('createGlobalIndexReducer', () => {
    let queue: OIMEventQueue;
    let adapter: OIMDBReduxAdapter;
    let users: OIMReactiveCollection<User, string>;

    beforeEach(() => {
        queue = new OIMEventQueue();
        adapter = new OIMDBReduxAdapter(queue);
        users = new OIMReactiveCollection<User, string>(queue, {
            selectPk: u => u.id,
        });
    });

    afterEach(() => {
        queue.destroy();
    });

    test('initializes { ids } from a manual global index', () => {
        const list = new OIMReactiveCollectionGlobalIndexManualArrayBased<
            string,
            User
        >(queue, { collection: users });
        const reducer = adapter.createGlobalIndexReducer(list);

        users.upsertMany([
            { id: 'u1', name: 'A', rank: 1 },
            { id: 'u2', name: 'B', rank: 2 },
        ]);
        list.setPks(['u2', 'u1']);
        queue.flush();

        const state = reducer(undefined, {
            type: EOIMDBReduxReducerActionType.UPDATE,
        });
        expect(state).toEqual({ ids: ['u2', 'u1'] });
    });

    test('recomputes on change and is a no-op when nothing changed', () => {
        const list = new OIMReactiveCollectionGlobalIndexManualArrayBased<
            string,
            User
        >(queue, { collection: users });
        const reducer = adapter.createGlobalIndexReducer(list);

        users.upsertMany([
            { id: 'u1', name: 'A', rank: 1 },
            { id: 'u2', name: 'B', rank: 2 },
        ]);
        list.setPks(['u1']);
        queue.flush();
        const s1 = reducer(undefined, {
            type: EOIMDBReduxReducerActionType.UPDATE,
        }) as TOIMDBReduxDefaultGlobalIndexState<string>;
        expect(s1).toEqual({ ids: ['u1'] });

        // No index change → dispatch returns the SAME reference.
        const s2 = reducer(s1, {
            type: EOIMDBReduxReducerActionType.UPDATE,
        });
        expect(s2).toBe(s1);

        // Change → new state.
        list.addPks(['u2']);
        queue.flush();
        const s3 = reducer(s1, {
            type: EOIMDBReduxReducerActionType.UPDATE,
        }) as TOIMDBReduxDefaultGlobalIndexState<string>;
        expect(s3).toEqual({ ids: ['u1', 'u2'] });
        expect(s3).not.toBe(s1);
    });

    test('tracks a derived (auto) global ordered list', () => {
        const recent = new OIMDerivedCollectionGlobalIndexArrayBased<
            string,
            User
        >(queue, users, { orderBy: u => u.rank });
        const reducer = adapter.createGlobalIndexReducer(recent);

        users.upsertMany([
            { id: 'u1', name: 'A', rank: 2 },
            { id: 'u2', name: 'B', rank: 1 },
        ]);
        queue.flush();
        let state = reducer(undefined, {
            type: EOIMDBReduxReducerActionType.UPDATE,
        }) as TOIMDBReduxDefaultGlobalIndexState<string>;
        expect(state.ids).toEqual(['u2', 'u1']);

        users.upsertOne({ id: 'u3', name: 'C', rank: 0 });
        queue.flush();
        state = reducer(state, {
            type: EOIMDBReduxReducerActionType.UPDATE,
        }) as TOIMDBReduxDefaultGlobalIndexState<string>;
        expect(state.ids).toEqual(['u3', 'u2', 'u1']);
    });

    test('flows OIMDB → Redux store end to end', () => {
        const scheduler = new OIMEventQueueSchedulerImmediate();
        const q = new OIMEventQueue({ scheduler });
        const adapter2 = new OIMDBReduxAdapter(q);
        const coll = new OIMReactiveCollection<User, string>(q, {
            selectPk: u => u.id,
        });
        const recent = new OIMDerivedCollectionGlobalIndexArrayBased<
            string,
            User
        >(q, coll, { orderBy: u => u.rank });

        const rootReducer = combineReducers({
            recent: adapter2.createGlobalIndexReducer(recent),
        });
        const store: Store = createStore(
            rootReducer,
            applyMiddleware(adapter2.createMiddleware())
        );
        adapter2.setStore(store);

        coll.upsertMany([
            { id: 'u1', name: 'A', rank: 2 },
            { id: 'u2', name: 'B', rank: 1 },
        ]);
        q.flush();

        expect(
            (store.getState() as { recent: TOIMDBReduxDefaultGlobalIndexState<string> })
                .recent.ids
        ).toEqual(['u2', 'u1']);

        q.destroy();
    });
});
