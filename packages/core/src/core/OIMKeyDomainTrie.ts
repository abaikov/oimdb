import { TOIMPk } from '../types/TOIMPk';
import { TOIMKeyPath } from '../types/TOIMKeyPath';
import { IOIMKeyDomain } from '../interfaces/IOIMKeyDomain';
import { IOIMKeyedMap } from '../interfaces/IOIMKeyedMap';
import { IOIMKeyedSet } from '../interfaces/IOIMKeyedSet';
import { OIMTrieMap } from './OIMTrieMap';
import { OIMTrieSet } from './OIMTrieSet';

/**
 * Key domain for composite key paths (`TOIMKeyPath`) — the trie counterpart of
 * `OIMKeyDomainNative`. Maps/Sets are trie-backed (match array keys by content),
 * and `canonicalize` interns each logical key into one stable reference via a
 * shared pool, so a collection's `slot.pk` is a single reference per logical key
 * and every downstream native `Set<slot.pk>`/`Map<slot.pk>` stays correct.
 *
 * Object-key support later: swap in a `keyToSegments` that sorts object entries;
 * nothing else here or at the call sites changes.
 */
export class OIMKeyDomainTrie implements IOIMKeyDomain<TOIMKeyPath> {
    // Interning pool: logical key (by content) → the one canonical reference.
    private readonly pool = new OIMTrieMap<TOIMPk, TOIMKeyPath>();

    public createMap<TValue>(): IOIMKeyedMap<TOIMKeyPath, TValue> {
        return new OIMTrieMap<TOIMPk, TValue>();
    }

    public createSet(): IOIMKeyedSet<TOIMKeyPath> {
        return new OIMTrieSet();
    }

    public canonicalize(key: TOIMKeyPath): TOIMKeyPath {
        const existing = this.pool.get(key);
        if (existing !== undefined) return existing;
        // Freeze an own copy so the canonical reference is immutable and not
        // aliased to a caller's array they might later mutate.
        const canonical = Object.freeze(key.slice()) as TOIMKeyPath;
        this.pool.set(canonical, canonical);
        return canonical;
    }
}
