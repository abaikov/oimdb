import {
    createOIMCollectionContext,
    OIMEventQueue,
    OIMReactiveCollectionIndexManualArrayBased,
} from '../src';

type User = {
    id: string;
    name: string;
    teamId: string;
};

describe('DX collection selectors', () => {
    test('byPk reads immediately and coalesces watched updates', () => {
        const queue = new OIMEventQueue();
        const users = createOIMCollectionContext<User, string>(queue, {
            selectPk: user => user.id,
        });

        users.collection.upsertOne({
            id: 'u1',
            name: 'Alice',
            teamId: 'team1',
        });
        queue.flush();

        const selector = users.select.byPk('u1');
        const seen: Array<User | undefined> = [];
        selector.watch(value => seen.push(value));

        expect(seen).toEqual([
            { id: 'u1', name: 'Alice', teamId: 'team1' },
        ]);

        users.collection.upsertOneByPk('u1', { name: 'Alicia' });
        users.collection.upsertOneByPk('u1', { name: 'Ally' });
        queue.flush();

        expect(seen).toEqual([
            { id: 'u1', name: 'Alice', teamId: 'team1' },
            { id: 'u1', name: 'Ally', teamId: 'team1' },
        ]);

        users.collection.destroy();
        users.queue.destroy();
    });

    test('byPks returns entities in requested order', () => {
        const queue = new OIMEventQueue();
        const users = createOIMCollectionContext<User, string>(queue, {
            selectPk: user => user.id,
        });

        users.collection.upsertMany([
            { id: 'u1', name: 'Alice', teamId: 'team1' },
            { id: 'u2', name: 'Bob', teamId: 'team1' },
        ]);

        expect(users.select.byPks(['u2', 'missing', 'u1']).getValue()).toEqual(
            [
                { id: 'u2', name: 'Bob', teamId: 'team1' },
                undefined,
                { id: 'u1', name: 'Alice', teamId: 'team1' },
            ]
        );

        users.collection.destroy();
        users.queue.destroy();
    });

    test('entitiesBySetIndexKey reacts to index membership and entity updates', () => {
        const queue = new OIMEventQueue();
        const users = createOIMCollectionContext<User, string>(queue, {
            selectPk: user => user.id,
        });
        const usersByTeam = users.indexFactory.derivedSetIndex(
            user => user.teamId
        );

        users.collection.upsertMany([
            { id: 'u1', name: 'Alice', teamId: 'team1' },
            { id: 'u2', name: 'Bob', teamId: 'team2' },
        ]);
        queue.flush();

        const selector = users.select.entitiesBySetIndexKey(
            usersByTeam,
            'team1'
        );
        const seen: Array<readonly (User | undefined)[]> = [];
        selector.watch(value => seen.push(value));

        expect(seen[0].map(user => user?.id)).toEqual(['u1']);

        users.collection.upsertOneByPk('u2', { teamId: 'team1' });
        queue.flush();
        expect(seen[seen.length - 1].map(user => user?.id).sort()).toEqual([
            'u1',
            'u2',
        ]);

        users.collection.upsertOneByPk('u2', { name: 'Bobby' });
        queue.flush();
        expect(
            seen[seen.length - 1].find(user => user?.id === 'u2')?.name
        ).toBe('Bobby');

        usersByTeam.destroy();
        users.collection.destroy();
        users.queue.destroy();
    });

    test('entitiesByArrayIndexKey reads collection-bound array indexes', () => {
        const queue = new OIMEventQueue();
        const users = createOIMCollectionContext<User, string>(queue, {
            selectPk: user => user.id,
        });
        const usersByTeam = new OIMReactiveCollectionIndexManualArrayBased<
            string,
            string,
            User
        >(queue, { collection: users.collection });

        users.collection.upsertMany([
            { id: 'u1', name: 'Alice', teamId: 'team1' },
            { id: 'u2', name: 'Bob', teamId: 'team1' },
        ]);
        usersByTeam.setPks('team1', ['u2', 'u1']);
        queue.flush();

        const selector = users.select.entitiesByArrayIndexKey(
            usersByTeam,
            'team1'
        );

        expect(selector.getValue().map(user => user?.id)).toEqual([
            'u2',
            'u1',
        ]);

        usersByTeam.destroy();
        users.collection.destroy();
        users.queue.destroy();
    });
});
