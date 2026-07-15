import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMReactiveCollection } from '../src/core/OIMReactiveCollection';
import { OIMCollectionOrderedListCommandStream } from '../src/modules/wrapper/index/OIMCollectionOrderedListCommandStream';
import { OIMOrderedListCommandStream } from '../src/modules/wrapper/index/OIMOrderedListCommandStream';
import { createOIMOrderedListMappedCommandStream } from '../src/modules/wrapper/index/createOIMOrderedListMappedCommandStream';
import { TOIMEntitySlot } from '../src/types/TOIMEntitySlot';
import { TOIMOrderedListCommand } from '../src/modules/wrapper/index/TOIMOrderedListCommand';

type User = { id: string; name: string };

const slot = (id: string, name: string): TOIMEntitySlot<User, string> => ({
    pk: id,
    item: { id, name },
});

/** A mapped "node" with a stable instance id so we can prove identity. */
type Node = { instance: number; label: string };

describe('OIMOrderedListMappedCommandStream', () => {
    test('translates each command, replacing item with the mapped value', () => {
        const queue = new OIMEventQueue();
        const stream = new OIMOrderedListCommandStream<string, string, User>(
            queue
        );

        let next = 0;
        const mapped = createOIMOrderedListMappedCommandStream(
            stream,
            (s: TOIMEntitySlot<User, string>): Node => ({
                instance: next++,
                label: s.item?.name ?? '∅',
            })
        );

        const seen: TOIMOrderedListCommand<Node>[] = [];
        mapped.subscribeCommands('doc', () => {
            seen.push(...mapped.consumeCommands('doc'));
        });

        stream.pushSlot('doc', slot('u1', 'Alice'));
        stream.pushSlot('doc', slot('u2', 'Bob'));
        queue.flush();

        expect(seen.map(c => c.type)).toEqual(['insert', 'insert']);
        const firstNode = (seen[0] as { item: Node }).item;
        const secondNode = (seen[1] as { item: Node }).item;
        expect(firstNode.label).toBe('Alice');
        expect(secondNode.label).toBe('Bob');
        expect(mapped.getItemsByKey('doc')).toEqual([firstNode, secondNode]);
    });

    test('move reuses the same mapped instance, never recreates it', () => {
        const queue = new OIMEventQueue();
        const stream = new OIMOrderedListCommandStream<string, string, User>(
            queue
        );

        let next = 0;
        const mapped = createOIMOrderedListMappedCommandStream(
            stream,
            (s: TOIMEntitySlot<User, string>): Node => ({
                instance: next++,
                label: s.item?.name ?? '∅',
            })
        );

        stream.pushSlot('doc', slot('u1', 'Alice'));
        stream.pushSlot('doc', slot('u2', 'Bob'));
        queue.flush();

        const before = mapped.getItemsByKey('doc').slice();
        const alice = before[0];

        stream.move('doc', 0, 1);
        queue.flush();

        const after = mapped.getItemsByKey('doc');
        expect(after).toEqual([before[1], alice]);
        // identity preserved: same object reference, no extra create
        expect(after[1]).toBe(alice);
        expect(next).toBe(2);
    });

    test('remove / set carry the position change; mirror stays correct', () => {
        const queue = new OIMEventQueue();
        const stream = new OIMOrderedListCommandStream<string, string, User>(
            queue
        );

        const mapped = createOIMOrderedListMappedCommandStream(
            stream,
            (s: TOIMEntitySlot<User, string>) => s.item?.name ?? '∅'
        );
        const seen: TOIMOrderedListCommand<string>[] = [];
        mapped.subscribeCommands('doc', () => {
            seen.push(...mapped.consumeCommands('doc'));
        });

        stream.pushSlot('doc', slot('u1', 'Alice'));
        stream.pushSlot('doc', slot('u2', 'Bob'));
        queue.flush();
        seen.length = 0;

        stream.setSlotAt('doc', 0, slot('u3', 'Carol')); // replace Alice
        stream.removeAt('doc', 1); // remove Bob
        queue.flush();

        // The consumer learns what left from the commands + its own mirror.
        expect(seen.map(c => c.type)).toEqual(['set', 'remove']);
        expect((seen[0] as { item: string }).item).toBe('Carol');
        expect(mapped.getItemsByKey('doc')).toEqual(['Carol']);
    });

    test('reset carries the new mapped items', () => {
        const queue = new OIMEventQueue();
        const stream = new OIMOrderedListCommandStream<string, string, User>(
            queue
        );

        const mapped = createOIMOrderedListMappedCommandStream(
            stream,
            (s: TOIMEntitySlot<User, string>) => s.item?.name ?? '∅'
        );
        const seen: TOIMOrderedListCommand<string>[] = [];
        mapped.subscribeCommands('doc', () => {
            seen.push(...mapped.consumeCommands('doc'));
        });

        stream.pushSlot('doc', slot('u1', 'Alice'));
        queue.flush();
        seen.length = 0;

        stream.setSlots('doc', [slot('u2', 'Bob'), slot('u3', 'Carol')]);
        queue.flush();

        expect(seen).toHaveLength(1);
        expect(seen[0].type).toBe('reset');
        expect((seen[0] as { items: readonly string[] }).items).toEqual([
            'Bob',
            'Carol',
        ]);
        expect(mapped.getItemsByKey('doc')).toEqual(['Bob', 'Carol']);
    });

    test('maps chain: each link projects the previous element', () => {
        const queue = new OIMEventQueue();
        const stream = new OIMOrderedListCommandStream<string, string, User>(
            queue
        );

        const names = createOIMOrderedListMappedCommandStream(
            stream,
            (s: TOIMEntitySlot<User, string>) => s.item?.name ?? '∅'
        );
        const lengths = names.map((name: string) => name.length);

        stream.pushSlot('doc', slot('u1', 'Alice'));
        stream.pushSlot('doc', slot('u2', 'Bo'));
        queue.flush();

        expect(names.getItemsByKey('doc')).toEqual(['Alice', 'Bo']);
        expect(lengths.getItemsByKey('doc')).toEqual([5, 2]);
    });

    test('works over a collection-bound stream (pk writes)', () => {
        const queue = new OIMEventQueue();
        const users = new OIMReactiveCollection<User, string>(queue, {
            selectPk: (u: User) => u.id,
        });
        users.upsertMany([
            { id: 'u1', name: 'Alice' },
            { id: 'u2', name: 'Bob' },
        ]);
        const stream = new OIMCollectionOrderedListCommandStream<
            string,
            string,
            User
        >(queue, { collection: users });

        const mapped = createOIMOrderedListMappedCommandStream(
            stream,
            (s: TOIMEntitySlot<User, string>) =>
                `${s.pk}:${s.item?.name ?? '∅'}`
        );

        stream.push('doc', 'u1');
        stream.push('doc', 'u2');
        queue.flush();

        expect(mapped.getItemsByKey('doc')).toEqual(['u1:Alice', 'u2:Bob']);
    });
});
