import { TOIMKey } from '../types/TOIMKey';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { IOIMSubscribable } from '../types/IOIMSubscribable';

/**
 * An array-based (ordered) index bucket that is ALSO its own subscription
 * carrier — the array counterpart of `OIMKeyedBucketSetBased`.
 *
 * It extends `Array<slot>`, so every reader that treats a bucket as an ordered
 * slot array (iteration, `length`, index access, `push`, `filter`) is unchanged.
 * On top of that it carries `subscribers` + `dirty` (`IOIMSubscribable`) and its
 * own `key`, so the keyed emitter delivers straight off the bucket the writer
 * already holds (O(1), no key→carrier lookup).
 *
 * `Symbol.species` is `Array`, so derived arrays (`filter`/`slice`/`map`) are
 * plain arrays — never stray carrier buckets.
 */
export class OIMKeyedBucketArrayBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> extends Array<TOIMAnyEntitySlot<TPk>> implements IOIMSubscribable {
    public subscribers?: Set<() => void>;
    public dirty?: boolean;

    static get [Symbol.species](): ArrayConstructor {
        return Array;
    }

    constructor(public readonly key: TKey) {
        super();
    }

    public hasSubscribers(): boolean {
        return this.subscribers !== undefined && this.subscribers.size > 0;
    }

    /** Empty the bucket in place (Array has no `clear`). */
    public clear(): void {
        this.length = 0;
    }
}
