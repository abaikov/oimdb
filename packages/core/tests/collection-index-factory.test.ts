import {
    createOIMCollectionIndexFactory,
    OIMEventQueue,
    OIMReactiveCollection,
} from '../src';

type User = { id: string; name: string };

describe('OIMCollectionIndexFactory', () => {
    function createUsers() {
        const queue = new OIMEventQueue();
        const users = new OIMReactiveCollection<User, string>(queue, {
            selectPk: user => user.id,
        });
        users.upsertMany([
            { id: 'u1', name: 'Alice' },
            { id: 'u2', name: 'Bob' },
            { id: 'u3', name: 'Carol' },
        ]);
        const indexFactory = createOIMCollectionIndexFactory(queue, users);
        return { queue, users, indexFactory };
    }

    test('creates collection-bound set and array indexes', () => {
        const { queue, users, indexFactory } = createUsers();
        const usersByTeam = indexFactory.setBasedIndex<'team1' | 'team2'>();
        const orderedUsersByTeam = indexFactory.arrayBasedIndex<'team1'>();

        usersByTeam.setPks('team1', ['u1', 'u2']);
        usersByTeam.addPks('team1', ['u3']);
        orderedUsersByTeam.setPks('team1', ['u2', 'u1']);

        expect(usersByTeam.getPksByKey('team1')).toEqual(
            new Set(['u1', 'u2', 'u3'])
        );
        expect(usersByTeam.getEntitiesByKey('team1')).toEqual([
            { id: 'u1', name: 'Alice' },
            { id: 'u2', name: 'Bob' },
            { id: 'u3', name: 'Carol' },
        ]);
        expect(orderedUsersByTeam.getEntitiesByKey('team1')).toEqual([
            { id: 'u2', name: 'Bob' },
            { id: 'u1', name: 'Alice' },
        ]);

        usersByTeam.destroy();
        orderedUsersByTeam.destroy();
        users.destroy();
        queue.destroy();
    });

    test('creates collection-bound ordered indexes and command streams', () => {
        const { queue, users, indexFactory } = createUsers();
        const orderedIndex = indexFactory.orderedIndex<'list'>();
        const orderedList = indexFactory.orderedList<'list'>({ index: orderedIndex });
        const seen: unknown[] = [];

        orderedList.commandsEventEmitter.subscribeOnKey('list', () => {
            seen.push(...orderedList.consumeCommands('list'));
        });

        orderedList.set('list', ['u1', 'u2']);
        orderedList.insertAt('list', 1, 'u3');
        queue.flush();

        expect(orderedIndex.getPksByKey('list')).toEqual(['u1', 'u3', 'u2']);
        expect(orderedList.getEntitiesByKey('list')).toEqual([
            { id: 'u1', name: 'Alice' },
            { id: 'u3', name: 'Carol' },
            { id: 'u2', name: 'Bob' },
        ]);
        expect(seen).toEqual([
            {
                type: 'reset',
                items: [
                    users.getSlotByPk('u1'),
                    users.getSlotByPk('u3'),
                    users.getSlotByPk('u2'),
                ],
            },
        ]);

        orderedList.destroy();
        users.destroy();
        queue.destroy();
    });
});
