/**
 * What the adapter holds, and what it lets go of.
 *
 * A subscription in this engine is a hand on the identity it watches: nothing
 * releases a row or a bucket that anything is still listening to. So every
 * subscription this adapter makes and does not dispose is a row or a bucket kept
 * alive by the mirror rather than by the application, and neither of the two
 * cases below raises anything — the numbers simply grow.
 */
import { OIMDB, OIMUnusedSlotCollectorService } from '@oimdb/core';
import type {
    TOIMReduxDefaultCollectionState,
    TOIMReduxDefaultGlobalIndexState,
    TOIMReduxDefaultIndexState,
    TOIMReduxGlobalIndex,
    TOIMReduxKeyedIndex,
} from '../src';
import { OIMReduxAdapter, EOIMReduxReducerActionType } from '../src';
import {
    bucketServiceOf,
    entityServiceOf,
    setBucketSlots,
    setSingleBucketSlots,
    singleBucketOf,
    subscriberCount,
} from './support/engine';

type TUser = { id: string; name: string; department: string };
type TUserState = TOIMReduxDefaultCollectionState<TUser, string>;
type TDepartmentState = TOIMReduxDefaultIndexState<string, string>;
type TAllState = TOIMReduxDefaultGlobalIndexState<string>;

function buildDb() {
    const db = new OIMDB();
    const usersService = entityServiceOf<TUser>(db, item => item.id);
    const users = usersService.createStoreSlot(db);
    const byDepartmentService = bucketServiceOf<TUser>(db);
    const byDepartment = byDepartmentService.createStoreSlot(db);
    const { singleBucket, bucketService: allService, bucket: allBucket } = singleBucketOf<TUser>(db);
    const keyedIndex: TOIMReduxKeyedIndex<string, string, TUser> = {
        bucketService: byDepartmentService,
        bucketStoreSlot: byDepartment,
        entityService: usersService,
        entityStoreSlot: users,
    };
    /** Write one department bucket's slots by resolving ids through `users`. */
    const setDepartment = (department: string, rowIds: readonly string[]): void => {
        setBucketSlots(byDepartmentService, byDepartment, usersService, users, department, rowIds);
    };
    return {
        db, usersService, users, byDepartmentService, byDepartment, singleBucket, allService, allBucket,
        keyedIndex, setDepartment,
    };
}

describe('dispose()', () => {
    test('lets go of every subscription the adapter made, not just the frame hook', () => {
        const {
            db, usersService, users, byDepartmentService, byDepartment, singleBucket, allService, allBucket,
            keyedIndex, setDepartment,
        } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });

        const collectionReducer = adapter.createCollectionReducer<TUser, string, TUserState>(usersService, users);
        const indexReducer = adapter.createKeyedIndexReducer<
            string, string, TDepartmentState, TUser
        >(keyedIndex);
        const globalIndex: TOIMReduxGlobalIndex<string, TUser> = {
            bucketService: allService,
            bucketSlot: allBucket,
            entityService: usersService,
            entityStoreSlot: users,
        };
        const globalReducer = adapter.createGlobalIndexReducer<string, TAllState, TUser>(globalIndex);

        usersService.slotContentService.upsertEntity(users, { id: 'u1', name: 'Alice', department: 'eng' });
        // A bucket with no slots is never watched (`instrumentKeyedIndex`
        // skips it), so its slots have to be written for the subscription
        // this test is about to count to exist at all.
        setDepartment('eng', ['u1']);
        setSingleBucketSlots(singleBucket, usersService, users, ['u1']);
        db.flush();
        collectionReducer(undefined, { type: EOIMReduxReducerActionType.UPDATE });
        indexReducer(undefined, { type: EOIMReduxReducerActionType.UPDATE });
        globalReducer(undefined, { type: EOIMReduxReducerActionType.UPDATE });

        const row = usersService.getSlotByKey(users, 'u1');
        expect(row).toBeDefined();
        const departmentBucket = byDepartmentService.getSlotByKey(byDepartment, 'eng');
        expect(departmentBucket).toBeDefined();

        usersService.slotContentService.upsertEntity(users, { id: 'u2', name: 'Bob', department: 'eng' });
        db.flush();
        expect(subscriberCount(usersService.getSlotByKey(users, 'u2')!)).toBe(1);
        expect(subscriberCount(row!)).toBe(1);
        expect(subscriberCount(departmentBucket!)).toBe(1);
        expect(subscriberCount(allBucket)).toBe(1);

        adapter.dispose();

        // THE ASSERTIONS THAT FLIP. `dispose` disposed the after-each-frame
        // subscription and nothing else, so a disposed adapter went on holding
        // the population, every row it had seen, every bucket it had discovered
        // and the Global index's sole bucket — and went on pinning all of them,
        // since the engine will not release an identity anything is listening
        // to.
        usersService.slotContentService.upsertEntity(users, { id: 'u3', name: 'Cy', department: 'eng' });
        db.flush();
        expect(subscriberCount(usersService.getSlotByKey(users, 'u3')!)).toBe(0);
        expect(subscriberCount(row!)).toBe(0);
        expect(subscriberCount(departmentBucket!)).toBe(0);
        expect(subscriberCount(allBucket)).toBe(0);
    });

    test('is idempotent, and stops the dispatching', () => {
        const { db, usersService, users } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createCollectionReducer<TUser, string, TUserState>(usersService, users);
        const dispatched: string[] = [];
        adapter.setStore({
            dispatch: (action: { type: string }) => { dispatched.push(action.type); return action; },
            getState: () => ({}),
            subscribe: () => () => undefined,
            replaceReducer: () => undefined,
        } as never);
        reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE });

        adapter.dispose();
        adapter.dispose();

        usersService.slotContentService.upsertEntity(users, { id: 'u1', name: 'Alice', department: 'eng' });
        db.flush();
        expect(dispatched).toEqual([]);
    });
});

describe('an index keyed by something transient', () => {
    test('gives back the bucket of every key whose slots are cleared, and the subscription with it', () => {
        const { db, usersService, users, byDepartmentService, byDepartment, keyedIndex, setDepartment } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createKeyedIndexReducer<
            string, string, TDepartmentState, TUser
        >(keyedIndex);

        usersService.slotContentService.upsertEntity(users, { id: 'u1', name: 'Alice', department: 'q0' });
        setDepartment('q0', ['u1']);
        db.flush();
        let state = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE }) as TDepartmentState;
        expect(Object.keys(state.entities)).toEqual(['q0']);

        // One row moving through twenty departments — a search term, a filter, a
        // page: an index key that is never used twice. A write does not re-file
        // a row, so the caller restates both buckets a move touches; each move
        // still empties the bucket it left.
        for (let i = 1; i < 20; i++) {
            usersService.slotContentService.upsertEntity(users, { id: 'u1', name: 'Alice', department: `q${i}` });
            setDepartment(`q${i - 1}`, []);
            setDepartment(`q${i}`, ['u1']);
            db.flush();
            state = reducer(state, { type: EOIMReduxReducerActionType.UPDATE }) as TDepartmentState;
        }

        // THE MECHANISM THIS PINS. The bucket watch was made once per bucket
        // and never disposed, on the stated grounds that buckets are never
        // released — which the subscription itself was what made true, since
        // `slot.owner.unholdSlot` declines a bucket anything reads.
        // Twenty keys, twenty buckets, twenty subscriptions, none of them ever
        // named again.
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(byDepartmentService.getSlotCount(byDepartment)).toBe(1);
        // The one key that still holds the row is still watched and still
        // reported — letting go of the empty ones must not cost that.
        expect(Object.keys(state.entities)).toEqual(['q19']);

        usersService.slotContentService.upsertEntity(users, { id: 'u1', name: 'Alice', department: 'q20' });
        setDepartment('q19', []);
        setDepartment('q20', ['u1']);
        db.flush();
        state = reducer(state, { type: EOIMReduxReducerActionType.UPDATE }) as TDepartmentState;
        expect(Object.keys(state.entities)).toEqual(['q20']);
    });

    test('a key that comes back is discovered again once its slots are rewritten', () => {
        const { db, usersService, users, keyedIndex, setDepartment } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createKeyedIndexReducer<
            string, string, TDepartmentState, TUser
        >(keyedIndex);

        usersService.slotContentService.upsertEntity(users, { id: 'u1', name: 'Alice', department: 'eng' });
        setDepartment('eng', ['u1']);
        db.flush();
        let state = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE }) as TDepartmentState;
        expect(state.entities.eng).toEqual({ id: 'eng', ids: ['u1'] });

        // The key empties: its bucket is given back, and the watch on it with it.
        usersService.slotContentService.upsertEntity(users, { id: 'u1', name: 'Alice', department: 'design' });
        setDepartment('eng', []);
        setDepartment('design', ['u1']);
        db.flush();
        state = reducer(state, { type: EOIMReduxReducerActionType.UPDATE }) as TDepartmentState;
        expect('eng' in state.entities).toBe(false);

        // And it comes back. A bucket is discovered through the population's own
        // identity — every write to a row writes the collection — so a key seen
        // before is discovered exactly as a key seen for the first time, once
        // its slots are written again.
        usersService.slotContentService.upsertEntity(users, { id: 'u2', name: 'Bob', department: 'eng' });
        setDepartment('eng', ['u2']);
        db.flush();
        state = reducer(state, { type: EOIMReduxReducerActionType.UPDATE }) as TDepartmentState;
        expect(state.entities.eng).toEqual({ id: 'eng', ids: ['u2'] });
    });
});
