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
        wrapper.commandsEventEmitter.subscribeOnKey('doc', () => {
            const cmds = wrapper.consumeCommands('doc');
            for (const c of cmds) seen.push(c);
        });

        wrapper.push('doc', 1);
        wrapper.push('doc', 2);
        wrapper.move('doc', 0, 1);
        wrapper.removeAt('doc', 1);

        queue.flush();

        // Final list state should match applied operations:
        // [] -> push(1) -> [1] -> push(2) -> [1,2] -> move(0->1) -> [2,1] -> removeAt(1) -> [2]
        expect(Array.from(wrapper.getPksByKey('doc'))).toEqual([2]);
        // Underlying index should match as well (wrapper delegates list storage to it).
        expect(Array.from(wrapper.index.getPksByKey('doc'))).toEqual([2]);

        expect(seen).toEqual([
            { type: 'add', key: 1, index: 0 },
            { type: 'add', key: 2, index: 1 },
            { type: 'move', key: 1, fromIndex: 0, toIndex: 1 },
            { type: 'remove', key: 1, index: 1 },
        ]);
    });
});
