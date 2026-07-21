import { TOIMPk } from './TOIMPk';

/**
 * A composite index key: an ordered, arbitrary-length tuple of primitive
 * segments. Unlike a stringified `"a|b|c"` key it keeps each segment's own
 * type and identity (so `1` and `"1"` stay distinct and no separator can
 * collide), and unlike a native object/array Map key it is matched by content,
 * not reference — a freshly built `[a, b, c]` resolves to the same bucket as a
 * previously stored `[a, b, c]`.
 *
 * Backed at runtime by a trie (`OIMTrieMap`): lookup walks one native-Map level
 * per segment, so it is O(arity) — effectively O(1) for a fixed arity — and
 * never allocates or hashes a string key.
 */
export type TOIMKeyPath = readonly TOIMPk[];
