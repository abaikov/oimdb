/**
 * What a throw out of a child reducer's sync-back leaves behind.
 *
 * Every reducer this adapter builds keeps one flag — `isSyncingFromChild` —
 * raised for exactly as long as it is writing the engine on behalf of a child
 * action. The OIMDB_UPDATE those writes provoke is the reducer's own echo, and
 * the flag is what lets the UPDATE branch recognise it and return the state
 * untouched instead of looping.
 *
 * Everything between raising the flag and lowering it is code this package does
 * not own: a custom extractor, a write strategy, a bucket the caller writes.
 * Raised and lowered by two bare assignments, ONE throw out of any of it leaves
 * the flag up for the life of the reducer — and from then on every OIMDB_UPDATE
 * returns the state it was handed. The store freezes one snapshot behind the
 * runtime, silently, and nothing after the throw is ever seen again. That is
 * why each test below throws on purpose and then checks that the next frame
 * still lands.
 *
 * The throw itself travels on to whoever dispatched. Redux's own `dispatch`
 * wraps the root reducer in this same shape and lets a throwing reducer through
 * to its caller; containing it here would leave Redux holding a state the engine
 * was never synced to, with no signal that the sync-back did not happen.
 */
import type { Action } from 'redux';
import { OIMDB } from '@oimdb/core';
import type {
    TOIMReduxDefaultCollectionState,
    TOIMReduxDefaultGlobalIndexState,
    TOIMReduxDefaultIndexState,
    TOIMReduxGlobalIndex,
    TOIMReduxKeyedIndex} from '../src';
import {
    OIMReduxAdapter,
    EOIMReduxReducerActionType
} from '../src';
import {
    bucketServiceOf,
    entityServiceOf,
    setBucketSlots,
    setSingleBucketSlots,
    singleBucketOf,
} from './support/engine';

type TUser = { id: string; name: string; department: string };
type TCollectionState = TOIMReduxDefaultCollectionState<TUser, string>;
type TIndexState = TOIMReduxDefaultIndexState<string, string>;
type TGlobalIndexState = TOIMReduxDefaultGlobalIndexState<string>;

/**
 * The one action every test here uses to reach the sync-back path. Each child
 * reducer below answers it with a NEW object and answers everything else with
 * the state it was handed — the sync-back only runs when the child returns
 * something other than what it was given.
 */
const SYNC_BACK = 'SYNC_BACK';

const collectionChildReducer = (
    state: TCollectionState | undefined,
    action: Action
): TCollectionState => {
    if (state === undefined) return { entities: {}, ids: [] };
    if (action.type === SYNC_BACK) return { entities: { ...state.entities }, ids: [...state.ids] };
    return state;
};

const indexChildReducer = (state: TIndexState | undefined, action: Action): TIndexState => {
    if (state === undefined) return { entities: {} };
    if (action.type === SYNC_BACK) return { entities: { ...state.entities } };
    return state;
};

const globalIndexChildReducer = (
    state: TGlobalIndexState | undefined,
    action: Action
): TGlobalIndexState => {
    if (state === undefined) return { ids: [] };
    if (action.type === SYNC_BACK) return { ids: [...state.ids] };
    return state;
};

describe('a throw out of a child reducer sync-back', () => {
    test('reaches the dispatcher, and leaves the collection reducer able to see the next frame', () => {
        const db = new OIMDB();
        const usersService = entityServiceOf<TUser>(db, item => item.id);
        const users = usersService.createStoreSlot(db);
        const adapter = new OIMReduxAdapter({ channelMap: db });

        let throwsOnce = true;
        const reducer = adapter.createCollectionReducer<TUser, string, TCollectionState>(usersService, users, {
            reducer: collectionChildReducer,
            extractEntities: (_prevState, _nextState, entityService, entityStoreSlot) => {
                if (throwsOnce) {
                    throwsOnce = false;
                    throw new Error('extractor blew up');
                }
                entityService.slotContentService.upsertEntities(entityStoreSlot, [{ id: '2', name: 'Bob', department: 'eng' }]);
            },
        });

        const initial = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE }) as TCollectionState;
        expect(initial.ids).toEqual([]);

        expect(() => reducer(initial, { type: SYNC_BACK })).toThrow('extractor blew up');

        // The frame after the throw must still arrive. A latched guard would
        // hand `initial` straight back here — the store one write behind the
        // collection, and every write after it too.
        usersService.slotContentService.upsertEntity(users, { id: '1', name: 'Alice', department: 'eng' });
        db.flush();
        const afterThrow = reducer(initial, { type: EOIMReduxReducerActionType.UPDATE }) as TCollectionState;
        expect(afterThrow).not.toBe(initial);
        expect(Object.keys(afterThrow.entities)).toEqual(['1']);

        // ...and the sync-back path itself still works, in both directions.
        reducer(afterThrow, { type: SYNC_BACK });
        expect(usersService.getSlotByKey(users, '2')?.entity).toEqual({ id: '2', name: 'Bob', department: 'eng' });
    });

    test('reaches the dispatcher, and leaves the keyed-index reducer able to see the next frame', () => {
        const db = new OIMDB();
        const usersService = entityServiceOf<TUser>(db, item => item.id);
        const users = usersService.createStoreSlot(db);
        const byDepartmentService = bucketServiceOf<TUser>(db);
        const byDepartment = byDepartmentService.createStoreSlot(db);
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const keyedIndex: TOIMReduxKeyedIndex<string, string, TUser> = {
            bucketService: byDepartmentService,
            bucketStoreSlot: byDepartment,
            entityService: usersService,
            entityStoreSlot: users,
        };

        let throwsOnce = true;
        const reducer = adapter.createKeyedIndexReducer<string, string, TIndexState, TUser>(keyedIndex, {
            reducer: indexChildReducer,
            extractIndexState: () => {
                if (throwsOnce) {
                    throwsOnce = false;
                    throw new Error('index extractor blew up');
                }
            },
        });

        const initial = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE }) as TIndexState;
        expect(() => reducer(initial, { type: SYNC_BACK })).toThrow('index extractor blew up');

        usersService.slotContentService.upsertEntity(users, { id: 'u1', name: 'Alice', department: 'eng' });
        // A bucket's slots are the caller's to write: a write does not re-file a row.
        setBucketSlots(byDepartmentService, byDepartment, usersService, users, 'eng', ['u1']);
        db.flush();
        const afterThrow = reducer(initial, { type: EOIMReduxReducerActionType.UPDATE }) as TIndexState;
        expect(afterThrow.entities.eng).toEqual({ id: 'eng', ids: ['u1'] });
    });

    test('reaches the dispatcher, and leaves the Global-index reducer able to see the next frame', () => {
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

        let throwsOnce = true;
        const reducer = adapter.createGlobalIndexReducer<string, TGlobalIndexState, TUser>(globalIndex, {
            reducer: globalIndexChildReducer,
            extractGlobalIndexState: () => {
                if (throwsOnce) {
                    throwsOnce = false;
                    throw new Error('global extractor blew up');
                }
            },
        });

        const initial = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE }) as TGlobalIndexState;
        expect(() => reducer(initial, { type: SYNC_BACK })).toThrow('global extractor blew up');

        usersService.slotContentService.upsertEntity(users, { id: 'u1', name: 'Alice', department: 'eng' });
        // The whole-population list is written by the caller.
        setSingleBucketSlots(singleBucket, usersService, users, ['u1']);
        db.flush();
        const afterThrow = reducer(initial, { type: EOIMReduxReducerActionType.UPDATE }) as TGlobalIndexState;
        expect(afterThrow.ids).toEqual(['u1']);
    });
});
