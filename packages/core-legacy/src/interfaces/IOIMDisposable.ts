/**
 * Anything with a `destroy()` teardown. `destroy(): void` is the de-facto
 * convention across oimdb (collections, indexes, objects, emitters, effects,
 * computed, streams); this interface just names it so a dispose scope can hold
 * them uniformly.
 */
export interface IOIMDisposable {
    destroy(): void;
}
