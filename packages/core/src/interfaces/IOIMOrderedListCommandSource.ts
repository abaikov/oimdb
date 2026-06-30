import { TOIMPk } from '../types/TOIMPk';
import { TOIMOrderedListCommand } from '../modules/wrapper/index/TOIMOrderedListCommand';

/**
 * Read/consume side of an ordered-list command stream, generic over the element
 * type it carries.
 *
 * The concrete stream stores entity slots (`TItem = TOIMEntitySlot<...>`); a
 * mapped source ({@link OIMOrderedListMappedCommandStream}) carries whatever the
 * mapping produces. A consumer that depends on this interface works unchanged
 * against either — raw or mapped.
 *
 * Consumption is pull-based and synchronous: the notification carries no
 * payload, so `consumeCommands(key)` must be called inside the `handler`, before
 * the buffer for that key is cleared.
 */
export interface IOIMOrderedListCommandSource<TKey extends TOIMPk, TItem> {
    /**
     * Subscribe to per-key command notifications. The handler receives no
     * payload — pull the commands with {@link consumeCommands} synchronously.
     * Returns an unsubscribe function.
     */
    subscribeCommands(key: TKey, handler: () => void): () => void;

    /** Drain the commands buffered for `key` this delivery (a copy). */
    consumeCommands(key: TKey): TOIMOrderedListCommand<TItem>[];

    /** Current ordered items for `key` — the initial state before any command. */
    getItemsByKey(key: TKey): readonly TItem[];
}
