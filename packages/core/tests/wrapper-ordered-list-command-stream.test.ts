import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMReactiveCollection } from '../src/core/OIMReactiveCollection';
import { OIMCollectionOrderedListCommandStream } from '../src/modules/wrapper/index/OIMCollectionOrderedListCommandStream';
import { OIMOrderedListCommandStream } from '../src/modules/wrapper/index/OIMOrderedListCommandStream';
import { TOIMEntitySlot } from '../src/types/TOIMEntitySlot';

type User = { id: string; name: string };

describe('OIMOrderedListCommandStream', () => {
    test('raw stream writes slots and emits slot commands', () => {
        const queue = new OIMEventQueue();
        const stream = new OIMOrderedListCommandStream<
            string,
            string,
            User
        >(queue);
        const u1: TOIMEntitySlot<User, string> = {
            pk: 'u1',
            item: { id: 'u1', name: 'Alice' },
        };
        const u2: TOIMEntitySlot<User, string> = {
            pk: 'u2',
            item: { id: 'u2', name: 'Bob' },
        };

        const seen: unknown[] = [];
        stream.commandsEventEmitter.subscribeOnKey('doc', () => {
            seen.push(...stream.consumeCommands('doc'));
        });

        stream.pushSlot('doc', u1);
        stream.pushSlot('doc', u2);
        stream.move('doc', 0, 1);
        stream.removeAt('doc', 1);

        queue.flush();

        expect(stream.getPksByKey('doc')).toEqual(['u2']);
        expect(stream.getSlotsByKey('doc')).toEqual([u2]);
        expect(stream.getEntitiesByKey('doc')).toEqual([
            { id: 'u2', name: 'Bob' },
        ]);
        expect(seen).toEqual([
            { type: 'insert', pk: 'u1', slot: u1, index: 0 },
            { type: 'insert', pk: 'u2', slot: u2, index: 1 },
            { type: 'move', pk: 'u1', slot: u1, fromIndex: 0, toIndex: 1 },
            { type: 'remove', pk: 'u1', slot: u1, index: 1 },
        ]);
        expect(stream.getBufferedCommands('doc')).toEqual([]);
    });

    test('collection-bound stream writes PKs as canonical slots', () => {
        const queue = new OIMEventQueue();
        const users = new OIMReactiveCollection<User, string>(queue, {
            selectPk: user => user.id,
        });
        users.upsertMany([
            { id: 'u1', name: 'Alice' },
            { id: 'u2', name: 'Bob' },
            { id: 'u3', name: 'Carol' },
        ]);

        const stream = new OIMCollectionOrderedListCommandStream<
            string,
            string,
            User
        >(queue, { collection: users });

        const seen: unknown[] = [];
        stream.commandsEventEmitter.subscribeOnKey('doc', () => {
            seen.push(...stream.consumeCommands('doc'));
        });

        stream.set('doc', ['u1', 'u2']);
        stream.move('doc', 0, 1);
        stream.push('doc', 'u3');
        stream.removeAt('doc', 1);

        queue.flush();

        expect(stream.getPksByKey('doc')).toEqual(['u2', 'u3']);
        expect(stream.getEntitiesByKey('doc')).toEqual([
            { id: 'u2', name: 'Bob' },
            { id: 'u3', name: 'Carol' },
        ]);
        expect(seen).toEqual([
            {
                type: 'set',
                pks: ['u2', 'u3'],
                slots: [users.getSlotByPk('u2'), users.getSlotByPk('u3')],
            },
        ]);
    });

    test('collection-bound stream fails when PK has no slot', () => {
        const queue = new OIMEventQueue();
        const users = new OIMReactiveCollection<User, string>(queue, {
            selectPk: user => user.id,
        });
        const stream = new OIMCollectionOrderedListCommandStream<
            string,
            string,
            User
        >(queue, { collection: users });

        expect(() => stream.push('doc', 'missing')).toThrow(
            'Unable to resolve slot'
        );
    });

    test('detects external slot writes and emits set() to resync', () => {
        const queue = new OIMEventQueue();
        const stream = new OIMOrderedListCommandStream<
            string,
            string,
            User
        >(queue);
        const u1: TOIMEntitySlot<User, string> = {
            pk: 'u1',
            item: { id: 'u1', name: 'Alice' },
        };
        const u2: TOIMEntitySlot<User, string> = {
            pk: 'u2',
            item: { id: 'u2', name: 'Bob' },
        };

        const seen: unknown[] = [];
        stream.commandsEventEmitter.subscribeOnKey('doc', () => {
            seen.push(...stream.consumeCommands('doc'));
        });

        stream.index.pushSlot('doc', u1);
        stream.index.pushSlot('doc', u2);

        queue.flush();

        expect(seen).toEqual([
            { type: 'set', pks: ['u1', 'u2'], slots: [u1, u2] },
        ]);
    });
});
