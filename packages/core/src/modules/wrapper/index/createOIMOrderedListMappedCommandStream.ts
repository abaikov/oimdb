import { TOIMPk } from '../../../types/TOIMPk';
import { TOIMOrderedListMapOptions } from '../../../types/TOIMOrderedListMapOptions';
import { IOIMOrderedListCommandSource } from '../../../interfaces/IOIMOrderedListCommandSource';
import { OIMOrderedListMappedCommandStream } from './OIMOrderedListMappedCommandStream';

/**
 * Map an ordered-list command source element-wise. The result is itself a
 * source, so it can be mapped again (or via its `.map()` method).
 *
 * ```ts
 * const nodes = createOIMOrderedListMappedCommandStream(stream, {
 *     create: (slot) => engine.makeNode(slot.item),
 *     destroy: (node) => engine.dropNode(node),
 * });
 * nodes.subscribeCommands(key, () =>
 *     engine.apply(nodes.consumeCommands(key))
 * );
 * ```
 */
export function createOIMOrderedListMappedCommandStream<
    TKey extends TOIMPk,
    TIn,
    TOut,
>(
    source: IOIMOrderedListCommandSource<TKey, TIn>,
    opts: TOIMOrderedListMapOptions<TIn, TOut>
): OIMOrderedListMappedCommandStream<TKey, TOut, TIn> {
    return new OIMOrderedListMappedCommandStream<TKey, TOut, TIn>(source, opts);
}
