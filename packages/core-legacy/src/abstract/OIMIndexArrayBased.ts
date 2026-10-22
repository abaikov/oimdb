import type { TOIMKey } from '../types/TOIMKey';
import type { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import type { OIMIndexStoreArrayBased } from './OIMIndexStoreArrayBased';
import { OIMIndexStoreMapDrivenArrayBased } from '../core/OIMIndexStoreMapDrivenArrayBased';
import type { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMIndex } from './OIMIndex';

/** Shared empty result for a missing key — never handed out mutable. */
const EMPTY_SLOTS: readonly never[] = Object.freeze([]);

export abstract class OIMIndexArrayBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> extends OIMIndex<
    TKey,
    TPk,
    TOIMAnyEntitySlot<TPk>[],
    TPk[],
    readonly TOIMAnyEntitySlot<TPk>[]
> {
    /** The same store as `store`, narrowed to expose the carrier-bucket lifecycle. */
    protected readonly arrayStore: OIMIndexStoreArrayBased<TKey, TPk>;

    constructor(
        options: {
            comparePks?: TOIMIndexComparator<TPk>;
            store?: OIMIndexStoreArrayBased<TKey, TPk>;
        } = {}
    ) {
        const store =
            options.store ?? new OIMIndexStoreMapDrivenArrayBased<TKey, TPk>();
        super(store, options.comparePks);
        this.arrayStore = store;
    }

    protected getBucketSize(bucket: TOIMAnyEntitySlot<TPk>[]): number {
        return bucket.length;
    }

    public getPksByKey(key: TKey): TPk[] {
        const slotsArray = this.store.getOneByKey(key);
        return slotsArray ? this.slotsToPks(slotsArray) : [];
    }

    public getPksByKeys(keys: readonly TKey[]): Map<TKey, TPk[]> {
        const result = new Map<TKey, TPk[]>();
        const slotsByKey = this.store.getManyByKeys(keys);
        for (const [key, slots] of slotsByKey) {
            result.set(key, this.slotsToPks(slots));
        }
        return result;
    }

    /**
     * A LIVE view of the bucket — no defensive copy.
     *
     * The bucket is a stable carrier (it is also the subscription target), so a
     * write edits it in place rather than replacing it: whatever you hold here
     * changes under you at the next write. **Valid until the next write.** Read
     * it, or copy it yourself if you intend to keep or diff it.
     *
     * It used to slice on every call. Nothing needed that: every caller either
     * walks the result once and drops it, or immediately builds its own array
     * anyway — the diff-driven stream sliced the slice, and the derived index
     * sorted a copy of the copy. The one place where an array genuinely
     * outlives the read is a `reset` command, and that copies at its own
     * boundary (`OIMOrderedListCommandBuffer.createResetCommand`).
     *
     * This also aligns the contract with {@link OIMIndexSetBased.getSlotsByKey},
     * which has always handed back its live bucket.
     */
    public getSlotsByKey(key: TKey): readonly TOIMAnyEntitySlot<TPk>[] {
        return this.store.getOneByKey(key) ?? EMPTY_SLOTS;
    }

    /** Live views, one per key — same ownership rules as {@link getSlotsByKey}. */
    public getSlotsByKeys(
        keys: readonly TKey[]
    ): Map<TKey, readonly TOIMAnyEntitySlot<TPk>[]> {
        return this.store.getManyByKeys(keys);
    }

    protected slotsToPks(
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): TPk[] {
        const pks: TPk[] = [];
        pks.length = slots.length;
        for (let i = 0; i < slots.length; i++) pks[i] = slots[i].pk;
        return pks;
    }

    /**
     * True if a comparator is set and considers `bucket`'s pks equal to
     * `newSlots` — i.e. a `setSlots` would be a no-op and should not emit.
     */
    protected bucketMatchesComparator(
        bucket: readonly TOIMAnyEntitySlot<TPk>[],
        newSlots: readonly TOIMAnyEntitySlot<TPk>[]
    ): boolean {
        if (!this.comparePks) return false;
        if (bucket.length !== newSlots.length) return false;
        if (bucket.length === 0) return true;
        return this.comparePks(
            this.slotsToPks(bucket),
            this.slotsToPks(newSlots)
        );
    }
}
