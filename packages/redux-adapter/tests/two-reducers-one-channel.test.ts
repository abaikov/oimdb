/**
 * Two reducers over ONE collection, and two over one Global index.
 *
 * Nothing forbids it and nothing in either API hints at it: a population read by
 * two slices of a store — one listing it, one summarising it — is an ordinary
 * shape. The adapter filed one entry per watched identity, so the second
 * registration replaced the first one's bookkeeping and the first reducer was
 * never told about anything again. It did not throw and it did not go blank: it
 * kept returning the last state it built, so the slice simply stopped following
 * the runtime.
 */
import { OIMDB } from '@oimdb/core';
import type { Store } from 'redux';
import { createStore, combineReducers } from 'redux';
import type {
    TOIMReduxDefaultCollectionState,
    TOIMReduxDefaultGlobalIndexState,
    TOIMReduxGlobalIndex,
} from '../src';
import { OIMReduxAdapter, EOIMReduxReducerActionType } from '../src';
import { entityServiceOf, everyRow, setSingleBucketSlots, singleBucketOf } from './support/engine';

type TUser = { id: string; name: string };
type TUserState = TOIMReduxDefaultCollectionState<TUser, string>;
type TAllState = TOIMReduxDefaultGlobalIndexState<string>;

describe('two reducers over one collection', () => {
    test('both follow the runtime', () => {
        const db = new OIMDB();
        const usersService = entityServiceOf<TUser>(db, item => item.id);
        const users = usersService.createStoreSlot(db);
        const adapter = new OIMReduxAdapter({ channelMap: db });

        const listing = adapter.createCollectionReducer<TUser, string, TUserState>(usersService, users);
        const summary = adapter.createCollectionReducer<TUser, string, TUserState>(usersService, users);

        usersService.slotContentService.upsertEntity(users, { id: '1', name: 'Alice' });
        db.flush();
        let listed = listing(undefined, { type: EOIMReduxReducerActionType.UPDATE }) as TUserState;
        let summarised = summary(undefined, { type: EOIMReduxReducerActionType.UPDATE }) as TUserState;
        expect(Object.keys(listed.entities)).toEqual(['1']);
        expect(Object.keys(summarised.entities)).toEqual(['1']);

        usersService.slotContentService.upsertEntity(users, { id: '2', name: 'Bob' });
        db.flush();
        listed = listing(listed, { type: EOIMReduxReducerActionType.UPDATE }) as TUserState;
        summarised = summary(summarised, { type: EOIMReduxReducerActionType.UPDATE }) as TUserState;

        expect(Object.keys(listed.entities).sort()).toEqual(['1', '2']);
        expect(Object.keys(summarised.entities).sort()).toEqual(['1', '2']);

        // Each keeps its own bookkeeping: one of them being read does not
        // consume the other's pending keys.
        usersService.slotContentService.upsertEntity(users, { id: '3', name: 'Carol' });
        db.flush();
        listed = listing(listed, { type: EOIMReduxReducerActionType.UPDATE }) as TUserState;
        expect(Object.keys(listed.entities).sort()).toEqual(['1', '2', '3']);
        summarised = summary(summarised, { type: EOIMReduxReducerActionType.UPDATE }) as TUserState;
        expect(Object.keys(summarised.entities).sort()).toEqual(['1', '2', '3']);
    });
});

describe('two reducers over one Global index', () => {
    test('a write still dispatches, and both slices see it', () => {
        const db = new OIMDB();
        const usersService = entityServiceOf<TUser>(db, item => item.id);
        const users = usersService.createStoreSlot(db);
        const { singleBucket, bucketService, bucket } = singleBucketOf<TUser>(db);
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const globalIndex: TOIMReduxGlobalIndex<string, TUser> = {
            bucketService,
            bucketSlot: bucket,
            entityService: usersService,
            entityStoreSlot: users,
        };

        const rootReducer = combineReducers({
            listing: adapter.createGlobalIndexReducer<string, TAllState, TUser>(globalIndex),
            summary: adapter.createGlobalIndexReducer<string, TAllState, TUser>(globalIndex),
        });
        const reduxStore: Store = createStore(rootReducer);
        adapter.setStore(reduxStore);

        usersService.slotContentService.upsertEntity(users, { id: 'u1', name: 'Alice' });
        // The whole-population list a Global index carries is written by
        // the caller.
        setSingleBucketSlots(singleBucket, usersService, users, everyRow(usersService, users));
        db.flush();

        // THE ASSERTIONS THAT FLIP, and this path failed worse than the
        // collection one: the Global instrumentation captured one reducer's
        // bookkeeping in its handler and instruments a bucket once, so the
        // second registration got a handler that never touched it — while the
        // registry, which decides whether a frame is worth dispatching for, held
        // only the second. Between them nothing was ever dispatched again, so
        // NEITHER slice moved.
        const state = reduxStore.getState() as { listing: TAllState; summary: TAllState };
        expect(state.listing.ids).toEqual(['u1']);
        expect(state.summary.ids).toEqual(['u1']);
    });
});
