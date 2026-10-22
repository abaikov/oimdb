import type { Action, Store } from 'redux';
import { OIMDB } from '@oimdb/core';
import { createStore, combineReducers, applyMiddleware } from 'redux';
import type {
    TOIMReduxDefaultCollectionState,
    TOIMReduxDefaultIndexState,
    TOIMReduxKeyedIndex,
    TOIMReduxCollectionReducerChildOptions,
} from '../src';
import { OIMReduxAdapter } from '../src';
import { bucketServiceOf, deleteEntityByKey, entityServiceOf, setBucketSlots } from './support/engine';

type TUser = { id: string; name: string; department: string };
type TUsersState = TOIMReduxDefaultCollectionState<TUser, string>;

/**
 * Handles one custom action and nothing else. Every other action — including the
 * `SOMETHING_ELSE` the tests below dispatch — comes straight back out, so the
 * only thing that action does is run the middleware.
 */
const childReducer = (state: TUsersState | undefined, action: Action): TUsersState => {
    if (state === undefined) return { entities: {}, ids: [] };
    if (action.type === 'ADD_USER') {
        const typed = action as { type: string; user: TUser };
        return {
            entities: { ...state.entities, [typed.user.id]: typed.user },
            ids: [...state.ids, typed.user.id],
        };
    }
    return state;
};

const childOptions: TOIMReduxCollectionReducerChildOptions<TUser, string, TUsersState> = {
    reducer: childReducer,
    keyOf: e => e.id,
};

function buildDb() {
    const db = new OIMDB();
    const usersService = entityServiceOf<TUser>(db, item => item.id);
    return { db, usersService, users: usersService.createStoreSlot(db) };
}

/**
 * THE FLUSH THE MIDDLEWARE RUNS DRAINS THE WHOLE PENDING FRAME, NOT THIS
 * DISPATCH'S SHARE OF IT.
 *
 * A frame-wide mute during the flush would make every `noteChanged` return
 * early, so the Global index's handler would not set `dirty` and the
 * after-each-frame handler would dispatch nothing. "The store already has that
 * state" is true only of the writes that dispatch's own child reducer made.
 *
 * A frame is armed by whoever writes first. A socket callback, a timer, a
 * projection, a background sync: any of them can leave a frame pending, and the
 * next action the application dispatches — any action — drains it. It must be
 * recorded, so an `OIMDB_UPDATE` follows and the change reaches Redux.
 *
 * `what-a-child-reducer-syncs-back.test.ts` is not coverage for this: its silent-flush test
 * flushes OUTSIDE a dispatch, which is the case that always worked.
 */
describe('a frame pending before a dispatch', () => {
    test('a write made outside the dispatch loop reaches Redux', () => {
        const { db, usersService, users } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createCollectionReducer<TUser, string, TUsersState>(
            usersService, users, childOptions);

        usersService.slotContentService.upsertEntity(users, { id: 'u1', name: 'Alice', department: 'eng' });
        db.flush();

        const store: Store = createStore(
            reducer as never, applyMiddleware(adapter.createMiddleware()));
        adapter.setStore(store);
        expect((store.getState() as TUsersState).ids).toEqual(['u1']);

        // The socket callback. It writes and does not flush — arming a frame the
        // scheduler has not run yet.
        usersService.slotContentService.upsertEntity(users, { id: 'u9', name: 'Nine', department: 'ops' });

        // ...and before that frame runs, the application dispatches anything at
        // all. The child reducer hands this action straight back, so the ONLY
        // thing it does is run the middleware's flush.
        store.dispatch({ type: 'SOMETHING_ELSE' });

        // Under the mute this failed: `entities.u9` was `undefined`. The muted
        // flush drained the frame, `noteChanged` returned early, `updatedKeys`
        // stayed empty and no `OIMDB_UPDATE` was dispatched.
        const state = store.getState() as TUsersState;
        expect(state.entities.u9).toEqual({ id: 'u9', name: 'Nine', department: 'ops' });
        expect(state.ids).toEqual(['u1', 'u9']);

        // And it was permanent, not merely late: the frame is spent, so nothing
        // is left to deliver and no later flush could correct it.
        db.flush();
        expect((store.getState() as TUsersState).entities.u9).toBeDefined();
    });

    test('a removal made outside the dispatch loop reaches Redux', () => {
        const { db, usersService, users } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createCollectionReducer<TUser, string, TUsersState>(
            usersService, users, childOptions);

        usersService.slotContentService.upsertEntities(users, [
            { id: 'u1', name: 'Alice', department: 'eng' },
            { id: 'u2', name: 'Bob', department: 'eng' },
        ]);
        db.flush();

        const store: Store = createStore(
            reducer as never, applyMiddleware(adapter.createMiddleware()));
        adapter.setStore(store);
        expect((store.getState() as TUsersState).ids).toEqual(['u1', 'u2']);

        // The removal variant is the worse one, because the mute applied to the
        // REPORT and not to the TEARDOWN: `noteChanged(slot.key)` was swallowed
        // while the branch that detached the row's effect still ran. The row lost
        // its notification and its watcher in one frame.
        deleteEntityByKey(usersService, users,'u1');
        store.dispatch({ type: 'SOMETHING_ELSE' });

        const state = store.getState() as TUsersState;
        expect(state.ids).toEqual(['u2']);
        expect(state.entities.u1).toBeUndefined();
    });

    test("an index whose slots the dispatch's own sync-back writes reaches Redux", () => {
        const { db, usersService, users } = buildDb();
        const byDepartmentService = bucketServiceOf<TUser>(db);
        const byDepartment = byDepartmentService.createStoreSlot(db);

        const adapter = new OIMReduxAdapter({ channelMap: db });
        const keyedIndex: TOIMReduxKeyedIndex<string, string, TUser> = {
            bucketService: byDepartmentService,
            bucketStoreSlot: byDepartment,
            entityService: usersService,
            entityStoreSlot: users,
        };
        const rootReducer = combineReducers({
            users: adapter.createCollectionReducer<TUser, string, TUsersState>(
                usersService,
                users,
                {
                    reducer: childReducer,
                    keyOf: e => e.id,
                    // A write does not re-file a row, so the sync-back that puts
                    // the user into the collection also states which department
                    // bucket it belongs to — the same call an application would
                    // make.
                    extractEntities: (_prevState, nextState, entityService, entityStoreSlot) => {
                        const added = Object.values(nextState.entities);
                        entityService.slotContentService.upsertEntities(entityStoreSlot, added);
                        for (const user of added) {
                            setBucketSlots(byDepartmentService, byDepartment, entityService, entityStoreSlot, user.department, [user.id]);
                        }
                    },
                },
            ),
            byDepartment: adapter.createKeyedIndexReducer<
                string, string, TOIMReduxDefaultIndexState<string, string>, TUser
            >(keyedIndex),
        });

        const store: Store = createStore(
            rootReducer, applyMiddleware(adapter.createMiddleware()));
        adapter.setStore(store);

        // This is the mute starving a reducer INSIDE its own justification. The
        // action's child reducer put the user into Redux and synced it back into
        // the collection AND the index — so "the store already has that state"
        // holds for the USERS slice. It says nothing about `byDepartment`:
        // Redux has never been told about `eng`, and only an `OIMDB_UPDATE` can
        // tell it.
        store.dispatch({ type: 'ADD_USER', user: { id: 'u1', name: 'Alice', department: 'eng' } });

        const state = store.getState() as {
            users: TUsersState;
            byDepartment: TOIMReduxDefaultIndexState<string, string>;
        };
        expect(state.users.ids).toEqual(['u1']);
        // Under the mute this failed with `undefined`: the index's `noteChanged`
        // was muted by the very flush that applied the write, so `byDepartment`
        // stayed at its initial empty state.
        expect(state.byDepartment.entities.eng).toEqual({ id: 'eng', ids: ['u1'] });
    });
});
