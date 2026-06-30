/**
 * Options for {@link OIMOrderedListMappedCommandStream} — how a source element
 * (`TIn`) is projected to a downstream element (`TOut`) and torn down.
 *
 * `create` runs once per element when it enters the list (an `insert`, a `set`
 * replacement, or list build / `reset`). `destroy` runs when it leaves (a
 * `remove`, the replaced half of a `set`, every element on `reset`, and on
 * stream `destroy()`). A `move` reuses the same `TOut` — it is never recreated.
 */
export type TOIMOrderedListMapOptions<TIn, TOut> = {
    create: (item: TIn) => TOut;
    destroy?: (mapped: TOut) => void;
};
