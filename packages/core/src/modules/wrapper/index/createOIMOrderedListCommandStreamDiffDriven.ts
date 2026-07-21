import { TOIMKey } from '../../../types/TOIMKey';
import { OIMEventQueue } from '../../../core/OIMEventQueue';
import { OIMIndexArrayBased } from '../../../abstract/OIMIndexArrayBased';
import { OIMReactiveIndexArrayBased } from '../../../abstract/OIMReactiveIndexArrayBased';
import { TOIMOrderedListDiffOptions } from '../../../types/TOIMOrderedListDiffOptions';
import { TOIMPk } from '../../../types/TOIMPk';
import { OIMOrderedListCommandStreamDiffDriven } from './OIMOrderedListCommandStreamDiffDriven';

/**
 * Derive an ordered-list command stream from a reactive array-based index — the
 * index's per-key order changes become position-addressed commands.
 *
 * ```ts
 * const cardsByDeck = cards.indexFactory.derivedArrayIndex(
 *     (c) => c.deckId, { orderBy: (c) => c.position }
 * );
 * const stream = createOIMOrderedListCommandStreamDiffDriven(queue, cardsByDeck);
 * stream.subscribeCommands('deck1', () =>
 *     engine.apply(stream.consumeCommands('deck1')) // insert/move/remove
 * );
 * ```
 */
export function createOIMOrderedListCommandStreamDiffDriven<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TEntity extends object = object,
    TIndex extends OIMIndexArrayBased<TKey, TPk> = OIMIndexArrayBased<
        TKey,
        TPk
    >,
>(
    queue: OIMEventQueue,
    index: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>,
    opts?: TOIMOrderedListDiffOptions
): OIMOrderedListCommandStreamDiffDriven<TKey, TPk, TEntity, TIndex> {
    return new OIMOrderedListCommandStreamDiffDriven<
        TKey,
        TPk,
        TEntity,
        TIndex
    >(queue, index, opts);
}
