/**
 * Incremental command for an ordered per-key list, addressed by position.
 *
 * `item` is whatever the stream stores per element — the command stream uses the
 * entity slot (`TOIMEntitySlot`), so a consumer reads `item.item` for the entity.
 *
 * - `insert` — a single element appears at `index`.
 * - `remove` — `count` elements (default 1, may be > 1) disappear from `index`.
 * - `move`   — `count` elements (default 1) move from `from` to `to`.
 * - `set`    — the element at `index` is replaced in place.
 * - `reset`  — the whole list for the key is replaced by `items`.
 */
export type TOIMOrderedListCommand<TItem> =
    | { type: 'insert'; index: number; item: TItem }
    | { type: 'remove'; index: number; count?: number }
    | { type: 'move'; from: number; to: number; count?: number }
    | { type: 'set'; index: number; item: TItem }
    | { type: 'reset'; items: readonly TItem[] };
