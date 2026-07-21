import { TOIMKey } from '../types/TOIMKey';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { IOIMSubscribable } from '../types/IOIMSubscribable';
import { IOIMKeyedMap } from '../interfaces/IOIMKeyedMap';

/**
 * A set-based index bucket that is ALSO its own subscription carrier AND holds
 * its own pk→slot membership.
 *
 * It extends `Set<slot>`, so every reader that treats a bucket as a `Set`
 * (iteration, `size`, `has`, `add`, `delete`) is unchanged — a `Set` subclass is
 * a `Set`. On top of that:
 *  - it carries `subscribers` + `dirty` (`IOIMSubscribable`) and its own `key`,
 *    so the keyed emitter delivers straight off the bucket the writer already
 *    holds — O(1), no key→carrier map/trie (bucket-as-carrier);
 *  - it carries an optional `membership` (pk → slot) so pk-oriented writes
 *    (`setPks`/`addPks`/`removePks`) dedup and remove by pk WITHOUT a second
 *    key-indexed structure. One `getOrReserveBucket` walk now serves both the
 *    slots and the membership — halving the trie walks for a composite key.
 */
export class OIMKeyedBucketSetBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> extends Set<TOIMAnyEntitySlot<TPk>> implements IOIMSubscribable {
    public subscribers?: Set<() => void>;
    public dirty?: boolean;
    // pk → slot. Content-safe for composite PKs (the owning index creates it via
    // the collection's pk key domain — native `Map` for primitives, trie for
    // composite key paths).
    public membership?: IOIMKeyedMap<TPk, TOIMAnyEntitySlot<TPk>>;

    constructor(public readonly key: TKey) {
        super();
    }

    public hasSubscribers(): boolean {
        return this.subscribers !== undefined && this.subscribers.size > 0;
    }

    /** Clearing the slot set also clears the pk membership — they stay in sync. */
    public override clear(): void {
        super.clear();
        this.membership?.clear();
    }
}
