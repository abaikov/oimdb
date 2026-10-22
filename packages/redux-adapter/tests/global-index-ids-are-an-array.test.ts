/**
 * Why the Global-index sync-back has NO colliding-key refusal, pinned.
 *
 * `oimDefaultCollectionMapper` and `oimDefaultKeyedIndexMapper` refuse two engine
 * addresses that land on one property name — `a-numeric-key-and-the-string-it-stringifies-to.test.ts` holds both
 * refusals — because their state shapes carry addresses as property names of a
 * plain object, where `1` and `'1'` are two rows in the core's `Map` and one
 * name in Redux. Only one of the two entries can exist there, and everything
 * downstream is computed from the one that survived.
 *
 * `TOIMReduxDefaultGlobalIndexState` carries them in an ARRAY. Two elements stay
 * two elements, `oimDefaultGlobalIndexMapper` puts the raw `slot.key` into it, and
 * the sync-back resolves each element to the identity the population files it
 * under. Nothing claims a name, so nothing loses one, so there is nothing to
 * refuse — and a guard added here for symmetry would reject a state this path
 * represents exactly. These tests fail the moment one is added, which is the
 * only thing that can keep the exemption honest.
 *
 * See the
 * comment at the hold in `OIMReduxReducerFactory.createGlobalIndexReducer` for
 * the hazard that IS left on this path and why the caller's own declaration is
 * where it is settled.
 */
import type { Action } from 'redux';
import { OIMDB } from '@oimdb/core';
import type { TOIMBucketSlot, TOIMEntitySlot, TOIMStoreKey, TOIMBucketSlotsSetStore } from '@oimdb/core';
import type {
    TOIMReduxDefaultGlobalIndexState,
    TOIMReduxGlobalIndex,
} from '../src';
import { OIMReduxAdapter, EOIMReduxReducerActionType } from '../src';
import type { TBucketService } from './support/engine';
import { entityServiceOf, setSingleBucketSlots, singleBucketOf } from './support/engine';

/**
 * A population addressed by `TOIMStoreKey`, so both scalar forms of one address can
 * be present at once — the same non-contrivance the mixed-key fixtures in
 * `a-numeric-key-and-the-string-it-stringifies-to.test.ts` describe: a server that sends an id sometimes as `7`
 * and sometimes as `"7"`.
 */
type TUser = { id: TOIMStoreKey; name: string };
type TState = TOIMReduxDefaultGlobalIndexState<TOIMStoreKey>;

/**
 * The bucket here is always hand-filled, and what fills it is whatever Redux
 * says it is — the sync-back this file exercises.
 */
function buildGlobalIndex() {
    const db = new OIMDB();
    const usersService = entityServiceOf<TUser>(db, item => item.id);
    const users = usersService.createStoreSlot(db);
    const { singleBucket, bucketService, bucket } = singleBucketOf<TUser>(db);
    const globalIndex: TOIMReduxGlobalIndex<TOIMStoreKey, TUser> = {
        bucketService,
        bucketSlot: bucket,
        entityService: usersService,
        entityStoreSlot: users,
    };
    return { db, usersService, users, singleBucket, bucketService, bucket, globalIndex };
}

/** Whatever Redux is told to list, it lists. */
const idsChildReducer = (state: TState | undefined, action: Action): TState => {
    if (state === undefined) return { ids: [] };
    if (action.type === 'SET_IDS') {
        const typed = action as { type: string; ids: TOIMStoreKey[] };
        return { ids: typed.ids };
    }
    return state;
};

function slotKeysOf(
    bucketService: TBucketService<TUser>,
    bucket: TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot<TUser>>, TOIMStoreKey>
): TOIMStoreKey[] {
    const keys: TOIMStoreKey[] = [];
    for (const slot of bucketService.slotContentService.getBucketMemberSlots(bucket)) keys.push(slot.key as TOIMStoreKey);
    return keys;
}

describe('a Global index whose Redux state lists both scalar forms of one address', () => {
    test('takes both, because the carrier is an array and neither one loses', () => {
        const { db, usersService, users, bucketService, bucket, globalIndex } = buildGlobalIndex();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createGlobalIndexReducer<TOIMStoreKey, TState, TUser>(
            globalIndex,
            { reducer: idsChildReducer },
        );

        // Two addresses, written through the engine: rows are filed in a `Map`,
        // so these are two rows and stay two rows.
        usersService.slotContentService.upsertEntities(users, [{ id: 1, name: 'Alice' }, { id: '1', name: 'Bob' }]);
        db.flush();
        expect(usersService.getSlotCount(users)).toBe(2);

        const s1 = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE }) as TState;

        // Held in a `const`: a reducer takes redux's `Action`, and an object
        // literal carrying more than `type` is refused at the call.
        const setBoth = { type: 'SET_IDS', ids: [1, '1'] };
        // THE ASSERTION THE EXEMPTION RESTS ON. A `collidingKeysError` copied
        // here from the two mapper paths would throw on exactly this state —
        // and it would be wrong to, because `ids` is an array: it names both
        // rows and the engine can hold both.
        expect(() => reducer(s1, setBoth)).not.toThrow();
        db.flush();

        const keys = slotKeysOf(bucketService, bucket);
        expect(keys).toHaveLength(2);
        // `toContain` compares with `===`, so these two assertions are the ones
        // that would fail if the two forms had been folded into one.
        expect(keys).toContain(1);
        expect(keys).toContain('1');
        // And no identity was minted beside them: each listed id resolved to a
        // row that was already there.
        expect(usersService.getSlotCount(users)).toBe(2);
    });

    test('a numeric pk makes the round trip as a number, so the ids the mapper hands out address the rows they came from', () => {
        const { db, usersService, users, singleBucket, bucketService, bucket, globalIndex } = buildGlobalIndex();
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createGlobalIndexReducer<TOIMStoreKey, TState, TUser>(
            globalIndex,
            { reducer: idsChildReducer },
        );

        usersService.slotContentService.upsertEntities(users, [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]);
        setSingleBucketSlots(singleBucket, usersService, users, [1, 2]);
        db.flush();

        // THE OTHER HALF OF THE EXEMPTION. `oimDefaultGlobalIndexMapper` pushes the
        // raw `slot.key` into an array — never a property name — so these are
        // numbers. `toEqual` tells `1` from `'1'`, which is the whole point of
        // the assertion.
        const s1 = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE }) as TState;
        expect(s1.ids).toEqual([1, 2]);

        // Straight back in, as a child reducer that reorders or filters would
        // hand them back.
        const resend = { type: 'SET_IDS', ids: [2, 1] };
        reducer(s1, resend);
        db.flush();

        expect(slotKeysOf(bucketService, bucket).slice().sort()).toEqual([1, 2]);
        // The round trip resolved the rows it started from: no string-addressed
        // identity was minted beside them.
        expect(usersService.getSlotCount(users)).toBe(2);
    });
});
