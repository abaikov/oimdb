import { TOIMKey } from '../types/TOIMKey';
import { TOIMPk } from '../types/TOIMPk';
import { IOIMKeyDomain } from '../interfaces/IOIMKeyDomain';
import { IOIMKeyedMap } from '../interfaces/IOIMKeyedMap';
import { IOIMKeyedSet } from '../interfaces/IOIMKeyedSet';

/**
 * Default key domain for primitive keys (`string | number`): plain native
 * `Map`/`Set` and identity `canonicalize`. A native `Map`/`Set` structurally
 * satisfies `IOIMKeyedMap`/`IOIMKeyedSet`, so there is no wrapper and no
 * indirection — the hot path is byte-for-byte what it was before the seam.
 */
export class OIMKeyDomainNative<TKey extends TOIMKey>
    implements IOIMKeyDomain<TKey>
{
    public createMap<TValue>(): IOIMKeyedMap<TKey, TValue> {
        return new Map<TKey, TValue>();
    }

    public createSet(): IOIMKeyedSet<TKey> {
        return new Set<TKey>();
    }

    public canonicalize(key: TKey): TKey {
        return key;
    }
}
