import type { TExoBindableList, TExoListOp } from '@exodra/reactivity-types';
import type {
    IOIMOrderedListCommandSource,
    TOIMKey,
    TOIMOrderedListCommand,
} from '@oimdb/core';

/** Cache floor: below this many live rows, pruning is not worth an O(n) sweep. */
const PRUNE_FLOOR = 64;

/**
 * O(delta) list path: bridge an OIMDB ordered-list command stream to an Exodra `bindableList`.
 * The stream's position-addressed commands (insert / remove / move / set / reset) map 1:1 onto
 * Exodra `TExoListOp`, so this forwards them with `render` applied to the carried items.
 *
 * Prefer this over `exoChildren` / `entityRows` for large ordered lists: only the genuinely moved,
 * inserted or removed rows touch the DOM. A diff-driven stream
 * (`createOIMOrderedListCommandStreamDiffDriven` over a `derivedArrayIndex`) emits move — not
 * remove+insert — on reorders, so Exodra relocates the existing DOM node and the row keeps its
 * state; drive per-row content from a per-pk bindable so field edits need no `set` command.
 *
 * The stream carries entity slots (`{ pk, item }`), so `render` typically reads `slot.pk` for the
 * row key and binds `slot.item` reactively. Consumption is lazy: the stream is subscribed only while
 * the returned list has an ops subscriber; `snapshot()` reads the current order synchronously
 * (SSR-safe) without subscribing.
 *
 * `render` is memoized per item, so a row keeps ONE schema for as long as it stays in the list —
 * repeated `snapshot()` calls hand back the same row objects instead of a fresh set. That matters
 * because Exodra reconciles by identity and the documented row pattern makes `render` mint a per-row
 * bindable: re-rendering on every read would churn every row and defeat the O(delta) path. Slots
 * from an OIMDB stream are stable carriers (a reorder emits `move` of the same object, never a
 * recreate), so item identity is the right memo key. The memo is pruned against the live order —
 * exactly on `snapshot()`, and amortized once it grows past twice the live row count — so `remove`
 * commands, which are position-addressed and carry no item, need no bookkeeping here.
 */
export function exoList<TKey extends TOIMKey, TItem, TSchema>(
    stream: IOIMOrderedListCommandSource<TKey, TItem>,
    key: TKey,
    render: (item: TItem) => TSchema
): TExoBindableList<TSchema> {
    const schemas = new Map<TItem, TSchema>();
    let pruneAt = PRUNE_FLOOR;

    const schemaFor = (item: TItem): TSchema => {
        if (schemas.has(item)) return schemas.get(item) as TSchema;
        const schema = render(item);
        schemas.set(item, schema);
        return schema;
    };

    const pruneAgainst = (live: readonly TItem[]): void => {
        const liveItems = new Set(live);
        for (const item of Array.from(schemas.keys())) {
            if (!liveItems.has(item)) schemas.delete(item);
        }
        pruneAt = Math.max(PRUNE_FLOOR, schemas.size * 2);
    };

    const mapOp = (
        command: TOIMOrderedListCommand<TItem>
    ): TExoListOp<TSchema> => {
        switch (command.type) {
            case 'insert':
                return {
                    type: 'insert',
                    index: command.index,
                    item: schemaFor(command.item),
                };
            case 'set':
                return {
                    type: 'set',
                    index: command.index,
                    item: schemaFor(command.item),
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
                return { type: 'reset', items: command.items.map(schemaFor) };
        }
    };

    return {
        snapshot: () => {
            const items = stream.getItemsByKey(key);
            // Already walking the whole order — take the exact prune while it is free.
            pruneAgainst(items);
            return items.map(schemaFor);
        },
        subscribeOps(update) {
            return stream.subscribeCommands(key, () => {
                const commands = stream.consumeCommands(key);
                for (const command of commands) update(mapOp(command));
                // Rows dropped by `remove` linger in the memo until it outgrows the live list.
                if (schemas.size >= pruneAt) {
                    pruneAgainst(stream.getItemsByKey(key));
                }
            });
        },
    };
}
