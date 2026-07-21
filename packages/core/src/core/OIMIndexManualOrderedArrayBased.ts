import { TOIMKey } from '../types/TOIMKey';
import { OIMIndexArrayBased } from '../abstract/OIMIndexArrayBased';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';

/**
 * Manual ordered Array-based index.
 *
 * Unlike generic Array-based indexes, this class is explicitly ordered:
 * - preserves order
 * - allows O(1) append (`push`)
 * - supports `move` and `removeAt` without computing diffs
 * - stores slots directly; collection-bound variants resolve PKs before writes
 *
 * It emits UPDATE events per key on every successful mutation. It is a plain
 * data structure: it knows nothing about "commands" — turning its mutations
 * into position-addressed commands is the command stream's job. Mutations happen
 * on the store's stable carrier bucket in place (via `arrayStore`).
 */
export class OIMIndexManualOrderedArrayBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> extends OIMIndexArrayBased<TKey, TPk> {
    public clear(key?: TKey): void {
        if (key === undefined) {
            const keys = this.getKeys();
            if (keys.length > 0) {
                this.arrayStore.clear();
                this.emitUpdate(Array.from(keys));
            }
            return;
        }
        const bucket = this.arrayStore.findBucket(key);
        if (bucket && bucket.length > 0) {
            bucket.length = 0;
            this.arrayStore.releaseBucket(bucket);
            this.emitUpdate([key]);
        }
    }

    public pushSlot(key: TKey, slot: TOIMAnyEntitySlot<TPk>): number {
        const bucket = this.arrayStore.getOrReserveBucket(key);
        const index = bucket.length;
        bucket.push(slot);
        this.arrayStore.retainBucket(bucket);
        this.emitUpdate([key]);
        return index;
    }

    public insertSlotAt(
        key: TKey,
        index: number,
        slot: TOIMAnyEntitySlot<TPk>
    ): number {
        const bucket = this.arrayStore.getOrReserveBucket(key);
        const safeIndex = Math.max(0, Math.min(index, bucket.length));
        bucket.splice(safeIndex, 0, slot);
        this.arrayStore.retainBucket(bucket);
        this.emitUpdate([key]);
        return safeIndex;
    }

    public removeAt(
        key: TKey,
        index: number
    ): TOIMAnyEntitySlot<TPk> | undefined {
        const bucket = this.arrayStore.findBucket(key);
        if (!bucket) return undefined;
        if (index < 0 || index >= bucket.length) return undefined;

        const [removed] = bucket.splice(index, 1);
        if (bucket.length === 0) this.arrayStore.releaseBucket(bucket);
        this.emitUpdate([key]);
        return removed;
    }

    /**
     * Remove up to `count` consecutive slots starting at `index`.
     * Returns the number actually removed (clamped to bounds; 0 if nothing).
     */
    public removeRange(key: TKey, index: number, count: number): number {
        const bucket = this.arrayStore.findBucket(key);
        if (!bucket) return 0;
        if (index < 0 || index >= bucket.length || count <= 0) return 0;
        const actual = Math.min(count, bucket.length - index);
        bucket.splice(index, actual);
        if (bucket.length === 0) this.arrayStore.releaseBucket(bucket);
        this.emitUpdate([key]);
        return actual;
    }

    public move(
        key: TKey,
        fromIndex: number,
        toIndex: number
    ): TOIMAnyEntitySlot<TPk> | undefined {
        const bucket = this.arrayStore.findBucket(key);
        if (!bucket) return undefined;
        if (fromIndex < 0 || fromIndex >= bucket.length) return undefined;
        if (toIndex < 0 || toIndex >= bucket.length) return undefined;
        if (fromIndex === toIndex) return bucket[fromIndex];

        const [slot] = bucket.splice(fromIndex, 1);
        if (slot === undefined) return undefined;
        bucket.splice(toIndex, 0, slot);
        this.emitUpdate([key]);
        return slot;
    }

    /** Replace the slot at `index` in place. Returns the safe index, or -1. */
    public setSlotAt(
        key: TKey,
        index: number,
        slot: TOIMAnyEntitySlot<TPk>
    ): number {
        const bucket = this.arrayStore.findBucket(key);
        if (!bucket) return -1;
        if (index < 0 || index >= bucket.length) return -1;
        bucket[index] = slot;
        this.emitUpdate([key]);
        return index;
    }

    /**
     * Move up to `count` consecutive slots from `from` to `to`. `to` is in the
     * coordinate space *after* the block is extracted (same as single `move`).
     * Returns the number actually moved (0 if a no-op / out of bounds).
     */
    public moveRange(
        key: TKey,
        from: number,
        to: number,
        count: number
    ): number {
        const bucket = this.arrayStore.findBucket(key);
        if (!bucket) return 0;
        if (from < 0 || from >= bucket.length || count <= 0) return 0;
        const actual = Math.min(count, bucket.length - from);
        const insertAt = Math.max(0, Math.min(to, bucket.length - actual));
        if (insertAt === from) return 0; // no-op
        const block = bucket.splice(from, actual);
        bucket.splice(insertAt, 0, ...block);
        this.emitUpdate([key]);
        return actual;
    }

    public resetSlots(
        key: TKey,
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): void {
        if (slots.length === 0) {
            const bucket = this.arrayStore.findBucket(key);
            if (bucket && bucket.length > 0) {
                bucket.length = 0;
                this.arrayStore.releaseBucket(bucket);
                this.emitUpdate([key]);
            }
            return;
        }
        const bucket = this.arrayStore.getOrReserveBucket(key);
        bucket.length = 0;
        for (let i = 0; i < slots.length; i++) bucket.push(slots[i]);
        this.arrayStore.retainBucket(bucket);
        this.emitUpdate([key]);
    }
}
