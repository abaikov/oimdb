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
            { type: 'insert', index: 0, item: u1 },
            { type: 'insert', index: 1, item: u2 },
            { type: 'move', from: 0, to: 1 },
            { type: 'remove', index: 1 },
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
                type: 'reset',
                items: [users.getSlotByPk('u2'), users.getSlotByPk('u3')],
            },
        ]);
    });

    test('setAt replaces a single element in place and emits set', () => {
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

        stream.set('doc', ['u1', 'u2']);
        queue.flush();

        const seen: unknown[] = [];
        stream.commandsEventEmitter.subscribeOnKey('doc', () => {
            seen.push(...stream.consumeCommands('doc'));
        });

        stream.setAt('doc', 1, 'u3'); // replace u2 with u3 at index 1
        queue.flush();

        expect(stream.getPksByKey('doc')).toEqual(['u1', 'u3']);
        expect(seen).toEqual([
            { type: 'set', index: 1, item: users.getSlotByPk('u3') },
        ]);
    });

    test('raw stream setSlotAt replaces in place and emits set', () => {
        const queue = new OIMEventQueue();
        const stream = new OIMOrderedListCommandStream<string, string, User>(
            queue
        );
        const u1: TOIMEntitySlot<User, string> = {
            pk: 'u1',
            item: { id: 'u1', name: 'Alice' },
        };
        const u2: TOIMEntitySlot<User, string> = {
            pk: 'u2',
            item: { id: 'u2', name: 'Bob' },
        };
        const u3: TOIMEntitySlot<User, string> = {
            pk: 'u3',
            item: { id: 'u3', name: 'Carol' },
        };

        stream.setSlots('doc', [u1, u2]);
        queue.flush();

        const seen: unknown[] = [];
        stream.commandsEventEmitter.subscribeOnKey('doc', () => {
            seen.push(...stream.consumeCommands('doc'));
        });

        stream.setSlotAt('doc', 1, u3); // replace u2 at index 1
        queue.flush();

        expect(stream.getSlotsByKey('doc')).toEqual([u1, u3]);
        expect(seen).toEqual([{ type: 'set', index: 1, item: u3 }]);

        // out-of-range is a no-op (no command)
        seen.length = 0;
        stream.setSlotAt('doc', 9, u2);
        queue.flush();
        expect(seen).toEqual([]);
    });

    test('removeRange removes a block and emits remove with count', () => {
        const queue = new OIMEventQueue();
        const stream = new OIMOrderedListCommandStream<string, string, User>(
            queue
        );
        const slots: TOIMEntitySlot<User, string>[] = ['u1', 'u2', 'u3', 'u4'].map(
            pk => ({ pk, item: { id: pk, name: pk } })
        );
        stream.setSlots('doc', slots);
        queue.flush();

        const seen: unknown[] = [];
        stream.commandsEventEmitter.subscribeOnKey('doc', () => {
            seen.push(...stream.consumeCommands('doc'));
        });

        stream.removeRange('doc', 1, 2); // remove u2, u3
        queue.flush();

        expect(stream.getPksByKey('doc')).toEqual(['u1', 'u4']);
        expect(seen).toEqual([{ type: 'remove', index: 1, count: 2 }]);

        // count is clamped to the available tail; out-of-range is a no-op
        seen.length = 0;
        stream.removeRange('doc', 1, 99); // only u4 left after index 1
        queue.flush();
        expect(stream.getPksByKey('doc')).toEqual(['u1']);
        expect(seen).toEqual([{ type: 'remove', index: 1, count: 1 }]);

        seen.length = 0;
        stream.removeRange('doc', 5, 2); // out of range
        queue.flush();
        expect(seen).toEqual([]);
    });

    test('moveRange moves a block and emits move with count', () => {
        const queue = new OIMEventQueue();
        const stream = new OIMOrderedListCommandStream<string, string, User>(
            queue
        );
        const slots: TOIMEntitySlot<User, string>[] = ['u1', 'u2', 'u3', 'u4'].map(
            pk => ({ pk, item: { id: pk, name: pk } })
        );
        stream.setSlots('doc', slots);
        queue.flush();

        const seen: unknown[] = [];
        stream.commandsEventEmitter.subscribeOnKey('doc', () => {
            seen.push(...stream.consumeCommands('doc'));
        });

        // extract [u1,u2] (count 2 from 0) → [u3,u4], insert at 1 → [u3,u1,u2,u4]
        stream.moveRange('doc', 0, 1, 2);
        queue.flush();

        expect(stream.getPksByKey('doc')).toEqual(['u3', 'u1', 'u2', 'u4']);
        expect(seen).toEqual([{ type: 'move', from: 0, to: 1, count: 2 }]);
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

    test('detects external slot writes and emits reset() to resync', () => {
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

        expect(seen).toEqual([{ type: 'reset', items: [u1, u2] }]);
    });
});
