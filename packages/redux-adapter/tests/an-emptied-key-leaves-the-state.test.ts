import { OIMDB } from '@oimdb/core';
import type { Store } from 'redux';
import { createStore } from 'redux';
import type {
    TOIMReduxDefaultIndexState,
    TOIMReduxKeyedIndex} from '../src';
import {
    OIMReduxAdapter,
    EOIMReduxReducerActionType
} from '../src';
import {
    bucketServiceOf, deleteEntityByKey, entityServiceOf, setBucketSlots, updateEntityByKey,
} from './support/engine';

type TUser = { id: string; name: string; department: string };

function buildDb() {
    const db = new OIMDB();
    const usersService = entityServiceOf<TUser>(db, item => item.id);
    const users = usersService.createStoreSlot(db);
    // A bucket collection is a slot store plus a bucket service, built by the
    // caller. A bucket's slots are not derived from a column: department is a plain
    // field, and whoever writes it also states which bucket the row belongs to.
    const byDepartmentService = bucketServiceOf<TUser>(db);
    const byDepartment = byDepartmentService.createStoreSlot(db);
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
    return { db, usersService, users, keyedIndex, setDepartment };
}

describe('OIMReduxAdapter.createKeyedIndexReducer', () => {
    test('initializes state with every bucket whose slots were written', () => {
        const { db, usersService, users, keyedIndex, setDepartment } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createKeyedIndexReducer<string, string, TOIMReduxDefaultIndexState<string, string>, TUser>(keyedIndex);

        usersService.slotContentService.upsertEntities(users, [
            { id: 'u1', name: 'Alice', department: 'eng' },
            { id: 'u2', name: 'Bob', department: 'eng' },
            { id: 'u3', name: 'Carol', department: 'design' },
        ]);
        setDepartment('eng', ['u1', 'u2']);
        setDepartment('design', ['u3']);
        db.flush();

        const state = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE });
        expect(state).toEqual({
            entities: {
                eng: { id: 'eng', ids: ['u1', 'u2'] },
                design: { id: 'design', ids: ['u3'] },
            },
        });
    });

    test("rewriting a bucket's slots produces an updated key, others stay referentially equal", () => {
        const { db, usersService, users, keyedIndex, setDepartment } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createKeyedIndexReducer<string, string, TOIMReduxDefaultIndexState<string, string>, TUser>(keyedIndex);

        usersService.slotContentService.upsertEntities(users, [
            { id: 'u1', name: 'Alice', department: 'eng' },
            { id: 'u3', name: 'Carol', department: 'design' },
        ]);
        setDepartment('eng', ['u1']);
        setDepartment('design', ['u3']);
        db.flush();
        const initial = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE }) as TOIMReduxDefaultIndexState<string, string>;

        // Carol moves to engineering: the value moves and the caller restates
        // both buckets it touches — a write does not re-file a row on its own.
        updateEntityByKey(usersService, users,'u3', { department: 'eng' });
        setDepartment('eng', ['u1', 'u3']);
        setDepartment('design', []);
        db.flush();
        const next = reducer(initial, { type: EOIMReduxReducerActionType.UPDATE }) as TOIMReduxDefaultIndexState<string, string>;

        expect(next.entities.eng).toEqual({ id: 'eng', ids: ['u1', 'u3'] });
        // `design` emptied, so it leaves the state rather than staying behind
        // holding an empty list — which is what a state built from scratch over
        // this same runtime would contain. See the test below for why the two
        // have to agree.
        expect('design' in next.entities).toBe(false);
    });

    test('a key that empties leaves the state, so updating into a shape and building it from scratch agree', () => {
        const { db, usersService, users, keyedIndex, setDepartment } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createKeyedIndexReducer<string, string, TOIMReduxDefaultIndexState<string, string>, TUser>(keyedIndex);

        usersService.slotContentService.upsertEntities(users, [
            { id: 'u1', name: 'Alice', department: 'eng' },
            { id: 'u2', name: 'Bob', department: 'design' },
            { id: 'u3', name: 'Carol', department: 'ops' },
        ]);
        setDepartment('eng', ['u1']);
        setDepartment('design', ['u2']);
        setDepartment('ops', ['u3']);
        db.flush();
        const initial = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE }) as TOIMReduxDefaultIndexState<string, string>;
        expect(Object.keys(initial.entities).sort()).toEqual(['design', 'eng', 'ops']);

        // Two departments empty out — one because its only row moved, one
        // because its only row is gone. Both are the caller's to restate.
        updateEntityByKey(usersService, users,'u2', { department: 'eng' });
        deleteEntityByKey(usersService, users,'u3');
        setDepartment('eng', ['u1', 'u2']);
        setDepartment('design', []);
        setDepartment('ops', []);
        db.flush();
        const updated = reducer(initial, { type: EOIMReduxReducerActionType.UPDATE }) as TOIMReduxDefaultIndexState<string, string>;

        // Nothing addresses `design` or `ops` any more. Keeping an empty entry
        // for each would grow this state by one key for every department the
        // application ever used — unbounded, and keyed by whatever the data
        // happened to contain.
        expect(Object.keys(updated.entities)).toEqual(['eng']);

        // The same runtime built from scratch instead of updated into — the two
        // ways of arriving at this state must not disagree about it. (Left last:
        // a from-scratch build resets this reducer's bookkeeping.)
        const fromScratch = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE });
        expect(updated).toEqual(fromScratch);
    });

    test('a custom mapper replaces the default one', () => {
        const { db, usersService, users, keyedIndex, setDepartment } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createKeyedIndexReducer<string, string, { count: number }, TUser>(
            keyedIndex,
            undefined,
            ki => {
                const bucket = ki.bucketService.findSlotByKey(ki.bucketStoreSlot, 'eng');
                if (bucket === undefined) return { count: 0 };
                let count = 0;
                for (const slot of ki.bucketService.slotContentService.getBucketMemberSlots(bucket)) if (slot.entity !== undefined) count++;
                return { count };
            }
        );

        usersService.slotContentService.upsertEntities(users, [
            { id: 'u1', name: 'Alice', department: 'eng' },
            { id: 'u2', name: 'Bob', department: 'eng' },
        ]);
        setDepartment('eng', ['u1', 'u2']);
        db.flush();

        const state = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE });
        expect(state).toEqual({ count: 2 });
    });

    test("writing a bucket's slots dispatches OIMDB_UPDATE for that frame", () => {
        const { db, usersService, users, keyedIndex, setDepartment } = buildDb();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createKeyedIndexReducer<string, string, TOIMReduxDefaultIndexState<string, string>, TUser>(keyedIndex);
        const reduxStore: Store = createStore(reducer as never);
        adapter.setStore(reduxStore);
        const dispatchSpy = jest.spyOn(reduxStore, 'dispatch');

        usersService.slotContentService.upsertEntity(users, { id: 'u1', name: 'Alice', department: 'eng' });
        setDepartment('eng', ['u1']);
        db.flush();
        expect(dispatchSpy).toHaveBeenCalledTimes(1);

        // A frame that doesn't touch this collection at all: nothing dispatched.
        db.flush();
        expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });
});
