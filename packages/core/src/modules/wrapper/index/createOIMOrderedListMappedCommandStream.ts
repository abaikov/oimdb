import { TOIMPk } from '../../../types/TOIMPk';
import { IOIMOrderedListCommandSource } from '../../../interfaces/IOIMOrderedListCommandSource';
import { OIMOrderedListMappedCommandStream } from './OIMOrderedListMappedCommandStream';

/**
 * Map an ordered-list command source element-wise. The result is itself a
 * source, so it can be mapped again (or via its `.map()` method).
 *
 * ```ts
 * const nodes = createOIMOrderedListMappedCommandStream(stream, (slot) =>
 *     engine.makeNode(slot.item)
 * );
 * nodes.subscribeCommands(key, () => {
 *     for (const cmd of nodes.consumeCommands(key)) {
 *         // cmd.item is your node; tear it down on `remove` / `set` / `reset`
 *     }
 * });
 * ```
 */
export function createOIMOrderedListMappedCommandStream<
    TKey extends TOIMPk,
    TIn,
    TOut,
>(
    source: IOIMOrderedListCommandSource<TKey, TIn>,
    create: (item: TIn) => TOut
): OIMOrderedListMappedCommandStream<TKey, TOut, TIn> {
    return new OIMOrderedListMappedCommandStream<TKey, TOut, TIn>(
        source,
        create
    );
}
