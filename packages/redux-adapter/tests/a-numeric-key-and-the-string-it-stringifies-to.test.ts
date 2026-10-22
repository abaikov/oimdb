/**
 * The same paths every other file here exercises, with NUMERIC keys.
 *
 * Every fixture in this directory was string-keyed, and that is the only reason
 * the three defects below survived: `@oimdb/core` files rows and buckets in real
 * `Map`s, where `1` and `'1'` are two addresses, while this package puts keys
 * into plain objects and must not read them back with `Object.keys` / `for..in`,
 * where they are always strings. For a string-keyed population the round trip is
 * the identity function and everything works; for a numeric one every key handed
 * back to the engine addressed a place nothing was ever filed at — a row that was
 * never removed, a bucket minted beside the live one, a list written where
 * nobody reads.
 *
 * Nothing here throws in either direction. That is what makes these tests the
 * only thing that can say which behaviour is in the code.
 */
import type { Action, Store } from 'redux';
import { OIMDB } from '@oimdb/core';
import { createStore } from 'redux';
import type {
    TOIMReduxDefaultCollectionState,
    TOIMReduxDefaultIndexState,
    TOIMReduxKeyedIndex,
    TOIMReduxLinkedIndex,
} from '../src';
import type { TOIMStoreKey } from '@oimdb/core';
import {
    OIMReduxAdapter,
    EOIMReduxReducerActionType,
    oimDefaultCollectionMapper,
    oimDefaultKeyedIndexMapper,
} from '../src';
import type { TBucketService, TBucketStoreSlot } from './support/engine';
import {
    bucketServiceOf,
    deleteEntityByKey,
    entityServiceOf,
    replacingEntityServiceOf,
    setBucketSlots,
    updateEntityByKey,
} from './support/engine';

/** What the bucket for `key` holds, by slot key — `[]` for no bucket. */
function slotKeysOf<TEntity extends object>(
    bucketService: TBucketService<TEntity>, bucketStoreSlot: TBucketStoreSlot<TEntity>, key: TOIMStoreKey,
): unknown[] {
    const bucket = bucketService.findSlotByKey(bucketStoreSlot, key);
    if (bucket === undefined) return [];
    return Array.from(bucketService.slotContentService.getBucketMemberSlots(bucket)).map(slot => slot.key);
}

type TUser = { id: number; name: string };
type TUserState = TOIMReduxDefaultCollectionState<TUser, number>;

const usersChildReducer = (state: TUserState | undefined, action: Action): TUserState => {
    if (state === undefined) return { entities: {}, ids: [] };
    if (action.type === 'REMOVE_USER') {
        const typed = action as { type: string; id: number };
        const entities = { ...state.entities };
        delete entities[typed.id];
        return { entities, ids: state.ids.filter(id => id !== typed.id) };
    }
    if (action.type === 'ADD_USER') {
        const typed = action as { type: string; user: TUser };
        return {
            entities: { ...state.entities, [typed.user.id]: typed.user },
            ids: [...state.ids, typed.user.id],
        };
    }
    return state;
};

describe('a numerically keyed collection synced back from a child reducer', () => {
    test('a row removed in Redux leaves the collection', () => {
        const db = new OIMDB();
        const usersService = entityServiceOf<TUser>(db,item => item.id);
        const users = usersService.createStoreSlot(db);
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createCollectionReducer<TUser, number, TUserState>(usersService, users, {
            reducer: usersChildReducer,
        });

        usersService.slotContentService.upsertEntities(users, [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]);
        db.flush();

        const store: Store = createStore(reducer as never);
        adapter.setStore(store);

        store.dispatch({ type: 'REMOVE_USER', id: 1 });

        // The removal is not driven by the diff's keys: `removeByKey('1')` looks the
        // row up in a `Map` that holds `1`, finds nothing and removes nothing.
        expect(usersService.getSlotByKey(users, 1)?.entity).toBeUndefined();
        // ...and only that row: the walk that replaced the diff must not take
        // anything Redux still lists.
        expect(usersService.getSlotByKey(users, 2)?.entity).toEqual({ id: 2, name: 'Bob' });

        const state = store.getState() as TUserState;
        expect(state.ids).toEqual([2]);
    });

    test('a row added in Redux still lands in the collection', () => {
        const db = new OIMDB();
        const usersService = entityServiceOf<TUser>(db,item => item.id);
        const users = usersService.createStoreSlot(db);
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const reducer = adapter.createCollectionReducer<TUser, number, TUserState>(usersService, users, {
            reducer: usersChildReducer,
        });

        const store: Store = createStore(reducer as never);
        adapter.setStore(store);

        store.dispatch({ type: 'ADD_USER', user: { id: 3, name: 'Carol' } });

        // The upsert path never needed a key — the entity carries its own — so
        // this passed before and has to go on passing: the walk that replaced
        // the removal diff must not have taken the arrival with it.
        expect(usersService.getSlotByKey(users, 3)?.entity).toEqual({ id: 3, name: 'Carol' });
    });
});

type TDeck = { id: number; name: string; cardIds: number[] };
type TCard = { id: number; title: string };
type TDeckState = TOIMReduxDefaultCollectionState<TDeck, number>;

function buildDecks() {
    const db = new OIMDB();
    // The linked-index diff keys off entity-reference equality, so the watched
    // collection needs a write strategy that allocates on change.
    const decksService = replacingEntityServiceOf<TDeck>(db,item => item.id);
    const decks = decksService.createStoreSlot(db);
    const cardsService = entityServiceOf<TCard>(db,item => item.id);
    const cards = cardsService.createStoreSlot(db);
    const cardsByDeckService = bucketServiceOf<TCard>(db);
    const cardsByDeck = cardsByDeckService.createStoreSlot(db);
    const adapter = new OIMReduxAdapter({ channelMap: db });
    const linkedIndexes: ReadonlyArray<TOIMReduxLinkedIndex<TDeck, TCard>> = [
        {
            bucketService: cardsByDeckService,
            bucketStoreSlot: cardsByDeck,
            linkedEntityService: cardsService,
            linkedEntityStoreSlot: cards,
            fieldName: 'cardIds',
        },
    ];
    const reducer = adapter.createCollectionReducer<TDeck, number, TDeckState>(decksService, decks, {
        reducer: s => s ?? { entities: {}, ids: [] },
        linkedIndexes,
    });
    return { db, decksService, decks, cardsService, cards, cardsByDeckService, cardsByDeck, reducer };
}

describe('linked indexes of a numerically keyed collection', () => {
    test("a bucket's slots are written to the bucket the collection files under, and no string one is minted beside it", () => {
        const { db, decksService, decks, cardsService, cards, cardsByDeckService, cardsByDeck, reducer } = buildDecks();

        cardsService.slotContentService.upsertEntities(cards, [{ id: 1, title: 'Ace' }, { id: 2, title: 'King' }]);
        decksService.slotContentService.upsertEntity(decks, { id: 7, name: 'Starter', cardIds: [1, 2] });
        db.flush();

        // The from-scratch path: the deck was already there when the reducer
        // first ran, which is Redux's ordinary creation order.
        const s1 = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE });

        expect(slotKeysOf(cardsByDeckService, cardsByDeck, 7)).toEqual([1, 2]);
        expect(Array.from(cardsByDeckService.getSlots(cardsByDeck)).map(b => b.key)).toEqual([7]);

        updateEntityByKey(decksService, decks,7, { cardIds: [2] });
        db.flush();
        const s2 = reducer(s1, { type: EOIMReduxReducerActionType.UPDATE });
        expect(slotKeysOf(cardsByDeckService, cardsByDeck, 7)).toEqual([2]);
        expect(cardsByDeckService.getSlotCount(cardsByDeck)).toBe(1);

        // And the removal path: the owning entity's key is read off the entity
        // the old state still holds, so the bucket that is cleared is the one
        // that had the rows — after which nothing holds it and it goes.
        deleteEntityByKey(decksService, decks,7);
        db.flush();
        reducer(s2, { type: EOIMReduxReducerActionType.UPDATE });
        db.flush();
        expect(cardsByDeckService.getSlotCount(cardsByDeck)).toBe(0);
    });
});

type TIndexState = TOIMReduxDefaultIndexState<number, number>;

const groupsChildReducer = (state: TIndexState | undefined, action: Action): TIndexState => {
    if (state === undefined) return { entities: {} };
    if (action.type === 'SET_GROUP') {
        const typed = action as { type: string; groupId: number; ids: number[] };
        return {
            entities: {
                ...state.entities,
                [typed.groupId]: { id: typed.groupId, ids: typed.ids },
            },
        };
    }
    return state;
};

describe('a keyed index with numeric keys, synced back from a child reducer', () => {
    test('the live bucket is written, not emptied, and no second one is minted', () => {
        const db = new OIMDB();
        const usersService = entityServiceOf<TUser>(db,item => item.id);
        const users = usersService.createStoreSlot(db);
        // What the bucket holds here is what Redux says it is: the sync-back writes it,
        // the same as every other index.
        const byGroupService = bucketServiceOf<TUser>(db);
        const byGroup = byGroupService.createStoreSlot(db);
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const keyedIndex: TOIMReduxKeyedIndex<number, number, TUser> = {
            bucketService: byGroupService,
            bucketStoreSlot: byGroup,
            entityService: usersService,
            entityStoreSlot: users,
        };
        const reducer = adapter.createKeyedIndexReducer<number, number, TIndexState, TUser>(
            keyedIndex,
            { reducer: groupsChildReducer },
        );

        usersService.slotContentService.upsertEntities(users, [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]);
        // The index already holds group 10, written through the engine: this is
        // the live bucket, addressed by the number.
        setBucketSlots(byGroupService, byGroup, usersService, users, 10, [1]);
        db.flush();

        const s1 = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE }) as TIndexState;
        expect(s1.entities[10]).toEqual({ id: 10, ids: [1] });

        // Held in a `const`: a reducer takes redux's `Action`, and an object
        // literal carrying more than `type` is refused at the call.
        const setGroup = { type: 'SET_GROUP', groupId: 10, ids: [1, 2] };
        const s2 = reducer(s1, setGroup) as TIndexState;
        db.flush();

        expect(slotKeysOf(byGroupService, byGroup, 10)).toEqual([1, 2]);
        expect(Array.from(byGroupService.getSlots(byGroup)).map(b => b.key)).toEqual([10]);
        expect(s2.entities[10]).toEqual({ id: 10, ids: [1, 2] });
    });

    test('a key Redux stops listing still empties its bucket', () => {
        const db = new OIMDB();
        const usersService = entityServiceOf<TUser>(db,item => item.id);
        const users = usersService.createStoreSlot(db);
        const byGroupService = bucketServiceOf<TUser>(db);
        const byGroup = byGroupService.createStoreSlot(db);
        const adapter = new OIMReduxAdapter({ channelMap: db });
        const keyedIndex: TOIMReduxKeyedIndex<number, number, TUser> = {
            bucketService: byGroupService,
            bucketStoreSlot: byGroup,
            entityService: usersService,
            entityStoreSlot: users,
        };
        const reducer = adapter.createKeyedIndexReducer<number, number, TIndexState, TUser>(
            keyedIndex,
            {
                // Whatever Redux is asked to hold, it holds — the point here is
                // the key that is NOT in the state any more.
                reducer: (state: TIndexState | undefined, action: Action): TIndexState => {
                    if (state === undefined) return { entities: {} };
                    if (action.type === 'DROP_GROUP') return { entities: {} };
                    return state;
                },
            },
        );

        usersService.slotContentService.upsertEntities(users, [{ id: 1, name: 'Alice' }]);
        setBucketSlots(byGroupService, byGroup, usersService, users, 10, [1]);
        db.flush();

        const s1 = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE }) as TIndexState;
        expect(s1.entities[10]).toEqual({ id: 10, ids: [1] });

        reducer(s1, { type: 'DROP_GROUP' });
        db.flush();

        // Keying off `entry.id` must not cost the other half of the sync: a key
        // the state no longer lists is still cleared, and the bucket then goes.
        expect(byGroupService.getSlotCount(byGroup)).toBe(0);
    });
});

/**
 * The half of the class that keying off `entry.id` does NOT close.
 *
 * `entry.id` survives the stringification — a numeric index key goes out as
 * `'10'` and comes back as `10` — and that is enough while the two directions
 * stay one-to-one. They stop being one-to-one the moment an index holds `1` and
 * `'1'` at once: two buckets in the core's `Map`, one property name in the plain
 * Redux object. Only one entry can exist there, so the state names one bucket
 * and never mentions the other — and `syncIndexEntities` then finds that other
 * bucket missing from what Redux lists and EMPTIES it, every frame.
 *
 * An index addressed by `TOIMStoreKey` is what makes this reachable, and it is not a
 * contrivance: a caller that files by a field a server sends sometimes as `7` and
 * sometimes as `"7"` produces exactly these two buckets.
 */
type TMixedIndexState = TOIMReduxDefaultIndexState<TOIMStoreKey, number>;

function buildMixedKeyIndex() {
    const db = new OIMDB();
    const usersService = entityServiceOf<TUser>(db,item => item.id);
    const users = usersService.createStoreSlot(db);
    const byGroupService = bucketServiceOf<TUser>(db);
    const byGroup = byGroupService.createStoreSlot(db);
    const keyedIndex: TOIMReduxKeyedIndex<TOIMStoreKey, number, TUser> = {
        bucketService: byGroupService,
        bucketStoreSlot: byGroup,
        entityService: usersService,
        entityStoreSlot: users,
    };

    usersService.slotContentService.upsertEntities(users, [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]);
    // Two addresses, written through the engine: the store files them in a
    // `Map`, so these are two buckets and stay two buckets. Each holds a row,
    // and slots are what keep a bucket.
    setBucketSlots(byGroupService, byGroup, usersService, users, 1, [1]);
    setBucketSlots(byGroupService, byGroup, usersService, users, '1', [2]);
    db.flush();

    return { usersService, users, byGroupService, byGroup, keyedIndex };
}

describe('a keyed index holding both scalar forms of one address', () => {
    test('the from-scratch build refuses the two keys instead of dropping one', () => {
        const { byGroupService, byGroup, keyedIndex } = buildMixedKeyIndex();

        expect(byGroupService.getSlotCount(byGroup)).toBe(2);

        expect(() =>
            oimDefaultKeyedIndexMapper<TOIMStoreKey, number, TUser>(
                keyedIndex,
                new Set<TOIMStoreKey>(),
                undefined,
            ),
        ).toThrow(/two buckets in the index and one property name/);
    });

    test('the incremental path refuses them too, rather than deleting the other key', () => {
        const { keyedIndex } = buildMixedKeyIndex();

        // A state that already names the string key. The numeric one changed
        // this frame, and its entry would land on the same property name.
        const state: TMixedIndexState = { entities: { '1': { id: '1', ids: [2] } } };

        expect(() =>
            oimDefaultKeyedIndexMapper<TOIMStoreKey, number, TUser>(
                keyedIndex,
                new Set<TOIMStoreKey>([1]),
                state,
            ),
        ).toThrow(/two buckets in the index and one property name/);
    });

    test('a key updating its own entry is not mistaken for a collision', () => {
        const { keyedIndex } = buildMixedKeyIndex();

        const state: TMixedIndexState = { entities: { '1': { id: '1', ids: [] } } };

        // The guard compares the entry's raw `id` with the key being written, so
        // the ordinary case — a key rewriting the entry it owns — goes through.
        // Without that comparison every incremental update would throw.
        const next = oimDefaultKeyedIndexMapper<TOIMStoreKey, number, TUser>(
            keyedIndex,
            new Set<TOIMStoreKey>(['1']),
            state,
        );
        expect(next.entities['1']).toEqual({ id: '1', ids: [2] });
    });
});

/**
 * The same collision one layer down: a COLLECTION holding both scalar forms of
 * one primary key.
 *
 * Two rows in the core's `Map`, one property name in `entities`. Outward, `ids`
 * lists both and `entities` can only hold one, so a reader walking `ids` is
 * served the same row twice. Back into the engine, the sync-back asks
 * `slot.key in defaultState.entities` per identity — one name answers for both
 * rows, so a child reducer deleting that single entry removes BOTH rows from the
 * collection.
 *
 * A population addressed by `TOIMStoreKey` is what makes this reachable, and it is
 * the same non-contrivance as the index case: a server that sends an id
 * sometimes as `7` and sometimes as `"7"` upserts exactly these two rows.
 */
type TMixedUser = { id: TOIMStoreKey; name: string };
type TMixedUserState = TOIMReduxDefaultCollectionState<TMixedUser, TOIMStoreKey>;

function buildMixedKeyCollection() {
    const db = new OIMDB();
    const usersService = entityServiceOf<TMixedUser>(db,item => item.id);
    const users = usersService.createStoreSlot(db);
    // Two addresses, written through the engine: rows are filed in a `Map`, so
    // these are two rows and stay two rows.
    usersService.slotContentService.upsertEntities(users, [{ id: 1, name: 'Alice' }, { id: '1', name: 'Bob' }]);
    db.flush();
    return { usersService, users };
}

describe('a collection holding both scalar forms of one primary key', () => {
    test('the from-scratch build refuses the two keys instead of dropping one', () => {
        const { usersService, users } = buildMixedKeyCollection();

        expect(usersService.getSlotCount(users)).toBe(2);

        expect(() =>
            oimDefaultCollectionMapper<TMixedUser, TOIMStoreKey>(
                usersService,
                users,
                new Set<TOIMStoreKey>(),
                undefined,
            ),
        ).toThrow(/two rows in the collection and one property name/);
    });

    test('the incremental path refuses them too, rather than overwriting the other row', () => {
        const { usersService, users } = buildMixedKeyCollection();

        // A state that already names the string key. The numeric one changed
        // this frame, and its entry would land on the same property name.
        const state: TMixedUserState = {
            entities: { '1': { id: '1', name: 'Bob' } },
            ids: ['1'],
        };

        expect(() =>
            oimDefaultCollectionMapper<TMixedUser, TOIMStoreKey>(
                usersService,
                users,
                new Set<TOIMStoreKey>([1]),
                state,
            ),
        ).toThrow(/two rows in the collection and one property name/);
    });

    test('a key updating its own entry is not mistaken for a collision', () => {
        const { usersService, users } = buildMixedKeyCollection();

        const state: TMixedUserState = {
            entities: { '1': { id: '1', name: 'stale' } },
            ids: ['1'],
        };

        // The guard compares the raw key that claimed a property name with the
        // key being written, so the ordinary case — a key rewriting the entry it
        // owns — goes through. Without that comparison every incremental update
        // would throw.
        const next = oimDefaultCollectionMapper<TMixedUser, TOIMStoreKey>(
            usersService,
            users,
            new Set<TOIMStoreKey>(['1']),
            state,
        );
        expect(next.ids).toEqual(['1']);
        expect(next.entities['1']).toEqual({ id: '1', name: 'Bob' });
    });

    test('an id listed under the other spelling of the ONLY row is not a collision', () => {
        const db = new OIMDB();
        const usersService = entityServiceOf<TMixedUser>(db,item => item.id);
        const users = usersService.createStoreSlot(db);
        usersService.slotContentService.upsertEntities(users, [{ id: 1, name: 'Alice' }]);
        db.flush();

        // One row, and a state that spells its id as a string — what a child
        // reducer building `ids` from `Object.keys` produces. There is no second
        // row, so nothing is lost and nothing may be refused: the guard asks the
        // collection whether the listed id still names a row before it throws.
        const state: TMixedUserState = {
            entities: { '1': { id: 1, name: 'stale' } },
            ids: ['1'],
        };

        const next = oimDefaultCollectionMapper<TMixedUser, TOIMStoreKey>(
            usersService,
            users,
            new Set<TOIMStoreKey>([1]),
            state,
        );
        expect(next.ids).toEqual(['1']);
        expect(next.entities['1']).toEqual({ id: 1, name: 'Alice' });
    });
});
