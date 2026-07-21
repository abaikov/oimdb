/**
 * Structural read+subscribe surface of a set-based reactive index the low-level bridge functions
 * need. `OIMReactiveIndexSetBased` from `@oimdb/core` satisfies it.
 */
export interface IOIMExodraSetBasedIndex<TKey, TPk> {
    getPksByKey(key: TKey): ReadonlySet<TPk>;
    subscribeOnKey(key: TKey, handler: () => void): () => void;
}
