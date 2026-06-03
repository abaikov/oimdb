import {
    createOIMCollectionContext,
    OIMEventQueue,
    OIMReactiveCollection,
    TOIMCollectionContext,
} from '../src';

type User = {
    id: string;
    name: string;
    teamId: string;
};

describe('DX collection model factories', () => {
    test('OIMReactiveCollection creates a typed reactive collection', () => {
        const queue = new OIMEventQueue();
        const users = new OIMReactiveCollection<User, string>(queue, {
            selectPk: user => user.id,
        });

        const slot = users.upsertOne({
            id: 'u1',
            name: 'Alice',
            teamId: 'team1',
        });

        expect(slot).toBe(users.getSlotByPk('u1'));
        expect(users.getOneByPk('u1')).toEqual({
            id: 'u1',
            name: 'Alice',
            teamId: 'team1',
        });

        users.destroy();
        queue.destroy();
    });

    test('createOIMCollectionContext returns collection and relations together', () => {
        const queue = new OIMEventQueue();
        const users: TOIMCollectionContext<User, string> =
            createOIMCollectionContext<User, string>(queue, {
                selectPk: user => user.id,
            });

        const usersByTeam = users.indexFactory.derivedSetIndex(
            user => user.teamId
        );

        users.collection.upsertMany([
            { id: 'u1', name: 'Alice', teamId: 'team1' },
            { id: 'u2', name: 'Bob', teamId: 'team1' },
        ]);

        expect(usersByTeam.getPksByKey('team1')).toEqual(
            new Set(['u1', 'u2'])
        );

        usersByTeam.destroy();
        users.collection.destroy();
        users.queue.destroy();
    });
});
