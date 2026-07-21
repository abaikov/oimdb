import { TOIMKey } from '../types/TOIMKey';
import { IOIMKeyedMap } from './IOIMKeyedMap';
import { IOIMKeyedSet } from './IOIMKeyedSet';

/**
 * Owns "how a key is stored, compared, and identified" for one keying axis
 * (a collection's PK, or an index's key). It is the single seam every PK-keyed
 * `Map`/`Set` on the hot path goes through, so the whole engine is agnostic to
 * whether the key is a primitive or a composite path.
 *
 * - `OIMKeyDomainNative` (default): native `Map`/`Set`, `canonicalize` is
 *   identity — byte-for-byte the current behavior and cost for primitive keys.
 * - `OIMKeyDomainTrie`: trie-backed `Map`/`Set` matching array keys by content,
 *   and `canonicalize` interns each logical key to one stable reference so that
 *   downstream native `Set<slot.pk>` keep working by reference.
 */
export interface IOIMKeyDomain<TKey extends TOIMKey> {
    createMap<TValue>(): IOIMKeyedMap<TKey, TValue>;
    createSet(): IOIMKeyedSet<TKey>;
    /**
     * Returns the canonical reference for a logical key. Native domain returns
     * the key unchanged; a composite domain interns it so equal-content keys
     * share one reference (making reference-keyed structures downstream correct).
     */
    canonicalize(key: TKey): TKey;
}
