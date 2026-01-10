import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMOrderedListIndexCommandStreamWrapper } from '../src/modules/wrapper/index/OIMOrderedListIndexCommandStreamWrapper';

describe('OIMOrderedListIndexCommandStreamWrapper', () => {
    test('buffers commands per key and preserves order', () => {
        const queue = new OIMEventQueue();
        const wrapper = new OIMOrderedListIndexCommandStreamWrapper<
            string,
            number
        >(queue);

        const seen: unknown[] = [];
        let bufferedAfterHandler: unknown[] = [];
        wrapper.commandsEventEmitter.subscribeOnKey('doc', () => {
            const cmds = wrapper.consumeCommands('doc');
            for (const c of cmds) seen.push(c);
            bufferedAfterHandler = wrapper.getBufferedCommands('doc').slice();
        });

        wrapper.push('doc', 1);
        wrapper.push('doc', 2);
        wrapper.move('doc', 0, 1);
        wrapper.removeAt('doc', 1);

        queue.flush();

        // Final list state should match applied operations:
        // [] -> push(1) -> [1] -> push(2) -> [1,2] -> setAt(0,3) -> [3,2] -> move(0->1) -> [2,3] -> removeAt(1) -> [2]
        expect(Array.from(wrapper.getPksByKey('doc'))).toEqual([2]);
        // Underlying index should match as well (wrapper delegates list storage to it).
        expect(Array.from(wrapper.index.getPksByKey('doc'))).toEqual([2]);

        expect(seen).toEqual([
            { type: 'add', key: 1, index: 0 },
            { type: 'add', key: 2, index: 1 },
            { type: 'move', key: 1, fromIndex: 0, toIndex: 1 },
            { type: 'remove', key: 1, index: 1 },
        ]);

        // Commands are flush-scoped: after flush completes buffer must be empty.
        expect(bufferedAfterHandler).toEqual([
            { type: 'add', key: 1, index: 0 },
            { type: 'add', key: 2, index: 1 },
            { type: 'move', key: 1, fromIndex: 0, toIndex: 1 },
            { type: 'remove', key: 1, index: 1 },
        ]);
        expect(wrapper.getBufferedCommands('doc')).toEqual([]);
    });

    test('after set() collapses following commands into the set payload', () => {
        const queue = new OIMEventQueue();
        const wrapper = new OIMOrderedListIndexCommandStreamWrapper<
            string,
            number
        >(queue);

        const seen: unknown[] = [];
        wrapper.commandsEventEmitter.subscribeOnKey('doc', () => {
            seen.push(...wrapper.consumeCommands('doc'));
        });

        wrapper.set('doc', [1, 2]);
        wrapper.move('doc', 0, 1);
        wrapper.push('doc', 3);
        wrapper.removeAt('doc', 1);

        queue.flush();

        // Only a single `set` should remain, reflecting the final list state.
        expect(seen).toEqual([{ type: 'set', keys: [2, 3] }]);
        expect(Array.from(wrapper.getPksByKey('doc'))).toEqual([2, 3]);
    });

    test('detects external index writes and emits set() to resync', () => {
        const queue = new OIMEventQueue();
        const wrapper = new OIMOrderedListIndexCommandStreamWrapper<
            string,
            number
        >(queue);

        const seen: unknown[] = [];
        wrapper.commandsEventEmitter.subscribeOnKey('doc', () => {
            seen.push(...wrapper.consumeCommands('doc'));
        });

        // Bypass wrapper and mutate the index directly.
        wrapper.index.push('doc', 10);
        wrapper.index.push('doc', 20);

        queue.flush();

        expect(seen).toEqual([{ type: 'set', keys: [10, 20] }]);
    });
});
