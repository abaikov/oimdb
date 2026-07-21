import type { TExoBindableList, TExoListOp } from '@exodra/reactivity';
import type {
    IOIMOrderedListCommandSource,
    TOIMKey,
    TOIMOrderedListCommand,
} from '@oimdb/core';

/**
 * O(delta) list path: bridge an OIMDB ordered-list command stream to an Exodra `bindableList`.
 * The stream's position-addressed commands (insert / remove / move / set / reset) map 1:1 onto
 * Exodra `TExoListOp`, so this forwards them with `render` applied to the carried items.
 *
 * Prefer this over `keyedChildren` / `entityRows` for large ordered lists: only the genuinely moved,
 * inserted or removed rows touch the DOM. A diff-driven stream
 * (`createOIMOrderedListCommandStreamDiffDriven` over a `derivedArrayIndex`) emits move — not
 * remove+insert — on reorders, so Exodra relocates the existing DOM node and the row keeps its
 * state; drive per-row content from a per-pk bindable so field edits need no `set` command.
 *
 * The stream carries entity slots (`{ pk, item }`), so `render` typically reads `slot.pk` for the
 * row key and binds `slot.item` reactively. Consumption is lazy: the stream is subscribed only while
 * the returned list has an ops subscriber; `snapshot()` reads the current order synchronously
 * (SSR-safe) without subscribing.
 */
export function listFromCommandStream<TKey extends TOIMKey, TItem, TSchema>(
    stream: IOIMOrderedListCommandSource<TKey, TItem>,
    key: TKey,
    render: (item: TItem) => TSchema
): TExoBindableList<TSchema> {
    const mapOp = (
        command: TOIMOrderedListCommand<TItem>
    ): TExoListOp<TSchema> => {
        switch (command.type) {
            case 'insert':
                return {
                    type: 'insert',
                    index: command.index,
                    item: render(command.item),
                };
            case 'set':
                return {
                    type: 'set',
                    index: command.index,
                    item: render(command.item),
                };
            case 'remove':
                return {
                    type: 'remove',
                    index: command.index,
                    count: command.count,
                };
            case 'move':
                return {
                    type: 'move',
                    from: command.from,
                    to: command.to,
                    count: command.count,
                };
            case 'reset':
                return { type: 'reset', items: command.items.map(render) };
        }
    };

    return {
        snapshot: () => stream.getItemsByKey(key).map(render),
        subscribeOps(update) {
            return stream.subscribeCommands(key, () => {
                const commands = stream.consumeCommands(key);
                for (const command of commands) update(mapOp(command));
            });
        },
    };
}
