import {
    OIMReactiveCollection,
    OIMEventQueue,
    OIMEventQueueSchedulerImmediate,
    OIMCollectionStoreTrieDriven,
    OIMPkCodecKeyPath,
    TOIMKeyPath,
} from '@oimdb/core';
import { createStore, applyMiddleware, Action } from 'redux';
import {
    createDefaultCollectionMapper,
    OIMDBReduxAdapter,
    TOIMDBReduxDefaultCollectionState,
} from '../src';

interface Membership {
    userId: number;
    projectId: number;
    role: string;
}

describe('redux mapper with a composite-PK collection', () => {
    let queue: OIMEventQueue;
    beforeEach(() => {
        queue = new OIMEventQueue({
            scheduler: new OIMEventQueueSchedulerImmediate(),
        });
    });
    afterEach(() => queue.destroy());

    it('keys entities by the codec-encoded PK; ids keep the raw composite PK', () => {
        const memberships = new OIMReactiveCollection<Membership, TOIMKeyPath>(
            queue,
            {
                selectPk: m => [m.userId, m.projectId],
                store: new OIMCollectionStoreTrieDriven<Membership>(),
            }
        );
        const mapper = createDefaultCollectionMapper<Membership, TOIMKeyPath>(
            new OIMPkCodecKeyPath()
        );

        memberships.upsertMany([
            { userId: 1, projectId: 10, role: 'admin' },
            { userId: 2, projectId: 10, role: 'member' },
        ]);

        // Initial (no current state).
        const s0 = mapper(memberships, new Set(), undefined);
        expect(s0.entities['[1,10]']).toEqual({
            userId: 1,
            projectId: 10,
            role: 'admin',
        });
        expect(s0.entities['[2,10]']).toBeDefined();
        // Trie store enumerates in traversal order, not insertion — compare as a set.
        expect([...s0.ids].sort()).toEqual(
            [
                [1, 10],
                [2, 10],
            ].sort()
        );

        // Incremental update: change [1,10], remove [2,10].
        memberships.upsertOneByPk([1, 10], { role: 'owner' });
        memberships.removeOneByPk([2, 10]);
        const s1 = mapper(
            memberships,
            new Set<TOIMKeyPath>([
                [1, 10],
                [2, 10],
            ]),
            s0
        );
        expect(s1.entities['[1,10]']).toEqual({
            userId: 1,
            projectId: 10,
            role: 'owner',
        });
        expect(s1.entities['[2,10]']).toBeUndefined();
        expect(s1.ids).toEqual([[1, 10]]);

        memberships.destroy();
    });

    it('child write-back decodes the string key back to the composite PK', () => {
        const memberships = new OIMReactiveCollection<Membership, TOIMKeyPath>(
            queue,
            {
                selectPk: m => [m.userId, m.projectId],
                store: new OIMCollectionStoreTrieDriven<Membership>(),
            }
        );
        const adapter = new OIMDBReduxAdapter(queue);

        // Child reducer adds an entity to Redux state keyed by the encoded PK.
        const childReducer = (
            state:
                | TOIMDBReduxDefaultCollectionState<Membership, TOIMKeyPath>
                | undefined,
            action: Action
        ): TOIMDBReduxDefaultCollectionState<Membership, TOIMKeyPath> => {
            if (state === undefined) return { entities: {}, ids: [] };
            if (action.type === 'ADD') {
                return {
                    entities: {
                        ...state.entities,
                        '[7,70]': { userId: 7, projectId: 70, role: 'admin' },
                    },
                    ids: [...state.ids, [7, 70]],
                };
            }
            return state;
        };

        const reducer = adapter.createCollectionReducer(
            memberships,
            { reducer: childReducer },
            undefined,
            new OIMPkCodecKeyPath()
        );
        const store = createStore(
            reducer,
            applyMiddleware(adapter.createMiddleware())
        );
        adapter.setStore(store);
        queue.flush();

        store.dispatch({ type: 'ADD' });
        queue.flush();

        // The entity must be synced back into OIMDB under the decoded composite PK.
        expect(memberships.getOneByPk([7, 70])).toEqual({
            userId: 7,
            projectId: 70,
            role: 'admin',
        });

        memberships.destroy();
    });
});
