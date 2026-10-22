import { OIMDB, OIMUnusedSlotCollectorService } from '@oimdb/core';
import type { TOIMReduxDefaultCollectionState } from '../src';
import { OIMReduxAdapter, EOIMReduxReducerActionType } from '../src';
import { deleteEntityByKey, entityServiceOf } from './support/engine';

type TUser = { id: string; name: string };

/**
 * A channel, a collection, an adapter watching it and the reducer that reports
 * it — the opening every test here shares. What each test is actually about
 * starts after this.
 */
function buildAdapter() {
    const db = new OIMDB();
    const usersService = entityServiceOf<TUser>(db, i => i.id);
    const users = usersService.createStoreSlot(db);
    const adapter = new OIMReduxAdapter({ channelMap: db });
    const reducer = adapter.createCollectionReducer<
        TUser, string, TOIMReduxDefaultCollectionState<TUser, string>
    >(usersService, users);
    return { db, usersService, users, adapter, reducer };
}

describe('watching a collection does not pin its identities', () => {
    test('a removed row is released once the adapter has reported it, however many rows come and go', () => {
        const { db, usersService, users, reducer } = buildAdapter();

        usersService.slotContentService.upsertEntities(users, [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }]);
        db.flush();
        let state = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE });
        expect(Object.keys(state!.entities).sort()).toEqual(['1', '2']);
        expect(usersService.getSlotCount(users)).toBe(2);

        deleteEntityByKey(usersService, users,'1');
        db.flush();

        // The reducer must still learn about the removal...
        state = reducer(state!, { type: EOIMReduxReducerActionType.UPDATE });
        expect(Object.keys(state!.entities)).toEqual(['2']);

        // ...and the identity must then be let go. An adapter that subscribes to
        // every row it ever sees and never unsubscribes pins the whole
        // population in memory forever, because an identity with a live
        // dependent is never released.
        // The reducer resolved a key the state still listed, which minted the removed row
        // back; the mint is the collector's, and this is where it gives it up.
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(usersService.getSlotCount(users)).toBe(1);

        // With the last row gone too, nothing at all is held.
        deleteEntityByKey(usersService, users,'2');
        db.flush();
        state = reducer(state!, { type: EOIMReduxReducerActionType.UPDATE });
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(usersService.getSlotCount(users)).toBe(0);

        // Releasing on report is the steady state, not a one-off: fifty rows
        // arriving and leaving one after another accumulate nothing.
        for (let i = 0; i < 50; i++) {
            usersService.slotContentService.upsertEntity(users, { id: `u${i}`, name: `n${i}` });
            db.flush();
            state = reducer(state!, { type: EOIMReduxReducerActionType.UPDATE });
            deleteEntityByKey(usersService, users,`u${i}`);
            db.flush();
            state = reducer(state!, { type: EOIMReduxReducerActionType.UPDATE });
        }
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(usersService.getSlotCount(users)).toBe(0);
    });
});

describe('a store attached after the fact', () => {
    test('receives what moved before it existed', () => {
        const { db, usersService, users, adapter, reducer } = buildAdapter();

        // Writes land while the store does not exist yet — Redux's own creation
        // order makes this the normal case, not an edge one.
        usersService.slotContentService.upsertEntities(users, [{ id: '1', name: 'Alice' }]);
        db.flush();

        const dispatched: string[] = [];
        adapter.setStore({
            dispatch: (action: { type: string }) => { dispatched.push(action.type); return action; },
            getState: () => ({}),
            subscribe: () => () => undefined,
            replaceReducer: () => undefined,
        } as never);

        expect(dispatched).toEqual([EOIMReduxReducerActionType.UPDATE]);
        const state = reducer(undefined, { type: EOIMReduxReducerActionType.UPDATE });
        expect(Object.keys(state!.entities)).toEqual(['1']);
    });
});
