import { OIMDB } from '@oimdb/core';
import type { Store} from 'redux';
import { createStore, combineReducers, applyMiddleware } from 'redux';
import type {
    TOIMReduxDefaultGlobalIndexState,
    TOIMReduxGlobalIndex} from '../src';
import {
    OIMReduxAdapter,
    EOIMReduxReducerActionType
} from '../src';
import { deleteEntityByKey, entityServiceOf, everyRow, setSingleBucketSlots, singleBucketOf } from './support/engine';

type TUser = { id: string; name: string };

function buildDb() {
    const db = new OIMDB();
    const usersService = entityServiceOf<TUser>(db, item => item.id);
    const users = usersService.createStoreSlot(db);
    // A keyless index is ONE bucket with no address — no shipped store takes a
    // `void` key — plus the bucket collection that writes it.
    const { singleBucket, bucketService, bucket } = singleBucketOf<TUser>(db);
    const globalIndex: TOIMReduxGlobalIndex<string, TUser> = {
        bucketService,
        bucketSlot: bucket,
        entityService: usersService,
        entityStoreSlot: users,
    };
    return { db, usersService, users, singleBucket, globalIndex };
}

describe('OIMReduxAdapter.createGlobalIndexReducer', () => {
    test('initializes { ids } from a whole-population list written by the caller', () => {
        const { db, usersService, users, singleBucket, globalIndex } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createGlobalIndexReducer<string, TOIMReduxDefaultGlobalIndexState<string>, TUser>(globalIndex);

        usersService.slotContentService.upsertEntities(users, [
            { id: 'u1', name: 'Alice' },
            { id: 'u2', name: 'Bob' },
        ]);
        setSingleBucketSlots(singleBucket, usersService, users, everyRow(usersService, users));
        db.flush();

        const state = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE }) as TOIMReduxDefaultGlobalIndexState<string>;
        expect(state.ids.slice().sort()).toEqual(['u1', 'u2']);
    });

    test('is a no-op (same reference) when nothing changed, and recomputes when the list is rewritten', () => {
        const { db, usersService, users, singleBucket, globalIndex } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createGlobalIndexReducer<string, TOIMReduxDefaultGlobalIndexState<string>, TUser>(globalIndex);

        usersService.slotContentService.upsertEntity(users, { id: 'u1', name: 'Alice' });
        setSingleBucketSlots(singleBucket, usersService, users, everyRow(usersService, users));
        db.flush();
        const s1 = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE }) as TOIMReduxDefaultGlobalIndexState<string>;
        expect(s1.ids).toEqual(['u1']);

        const s2 = reducer(s1, { type: EOIMReduxReducerActionType.UPDATE });
        expect(s2).toBe(s1);

        usersService.slotContentService.upsertEntity(users, { id: 'u2', name: 'Bob' });
        setSingleBucketSlots(singleBucket, usersService, users, everyRow(usersService, users));
        db.flush();
        const s3 = reducer(s1, { type: EOIMReduxReducerActionType.UPDATE }) as TOIMReduxDefaultGlobalIndexState<string>;
        expect(s3.ids.slice().sort()).toEqual(['u1', 'u2']);
        expect(s3).not.toBe(s1);
    });

    test('a removal reflected by rewriting the whole-population list updates the Global index', () => {
        const { db, usersService, users, singleBucket, globalIndex } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createGlobalIndexReducer<string, TOIMReduxDefaultGlobalIndexState<string>, TUser>(globalIndex);

        usersService.slotContentService.upsertEntities(users, [
            { id: 'u1', name: 'Alice' },
            { id: 'u2', name: 'Bob' },
        ]);
        setSingleBucketSlots(singleBucket, usersService, users, everyRow(usersService, users));
        db.flush();
        const s1 = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE }) as TOIMReduxDefaultGlobalIndexState<string>;

        deleteEntityByKey(usersService, users,'u1');
        setSingleBucketSlots(singleBucket, usersService, users, everyRow(usersService, users));
        db.flush();
        const s2 = reducer(s1, { type: EOIMReduxReducerActionType.UPDATE }) as TOIMReduxDefaultGlobalIndexState<string>;
        expect(s2.ids).toEqual(['u2']);
    });

    test('flows the engine -> Redux store end to end through the middleware', () => {
        const { db, usersService, users, singleBucket, globalIndex } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });

        const rootReducer = combineReducers({
            all: adapter.createGlobalIndexReducer<string, TOIMReduxDefaultGlobalIndexState<string>, TUser>(globalIndex),
        });
        const reduxStore: Store = createStore(rootReducer, applyMiddleware(adapter.createMiddleware()));
        adapter.setStore(reduxStore);

        usersService.slotContentService.upsertEntities(users, [
            { id: 'u1', name: 'Alice' },
            { id: 'u2', name: 'Bob' },
        ]);
        setSingleBucketSlots(singleBucket, usersService, users, everyRow(usersService, users));
        db.flush();

        const state = reduxStore.getState() as { all: TOIMReduxDefaultGlobalIndexState<string> };
        expect(state.all.ids.slice().sort()).toEqual(['u1', 'u2']);
    });
});
