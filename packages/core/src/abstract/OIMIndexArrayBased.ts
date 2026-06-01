import { OIMEventEmitter } from '../core/OIMEventEmitter';
import { EOIMIndexEventType } from '../enum/EOIMIndexEventType';
import { TOIMIndexUpdatePayload } from '../type/TOIMIndexUpdatePayload';
import { TOIMPk } from '../type/TOIMPk';
import { TOIMIndexComparator } from '../type/TOIMIndexComparator';
import { OIMIndexStoreArrayBased } from './OIMIndexStoreArrayBased';
import { OIMIndexStoreMapDrivenArrayBased } from '../core/OIMIndexStoreMapDrivenArrayBased';
import {
    TOIMAnyEntitySlot,
    TOIMEntitySlotResolver,
} from '../type/TOIMEntitySlot';

/**
 * Abstract base class for Array-based index types.
 * Provides common functionality and event system for key-to-PKs mappings using Array storage.
 */
export abstract class OIMIndexArrayBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> {
    protected readonly comparePks?: TOIMIndexComparator<TPk>;
    protected readonly store: OIMIndexStoreArrayBased<TKey, TPk>;
    protected resolveSlot?: TOIMEntitySlotResolver<TPk>;
    private readonly fallbackSlots = new Map<TPk, TOIMAnyEntitySlot<TPk>>();
    public readonly emitter = new OIMEventEmitter<{
        [EOIMIndexEventType.UPDATE]: TOIMIndexUpdatePayload<TKey>;
    }>();

    constructor(
        options: {
            comparePks?: TOIMIndexComparator<TPk>;
            store?: OIMIndexStoreArrayBased<TKey, TPk>;
            resolveSlot?: TOIMEntitySlotResolver<TPk>;
        } = {}
    ) {
        this.comparePks = options.comparePks;
        this.store =
            options.store ?? new OIMIndexStoreMapDrivenArrayBased<TKey, TPk>();
        this.resolveSlot = options.resolveSlot;
    }

    /**
     * Get primary keys for multiple index keys
     */
    public getPksByKeys(keys: readonly TKey[]): Map<TKey, TPk[]> {
        const result = new Map<TKey, TPk[]>();
        const slotsByKey = this.store.getManyByKeys(keys);
        for (const [key, slots] of slotsByKey) {
            result.set(key, this.slotsToPks(slots));
        }
        return result;
    }

    public setSlotResolver(resolveSlot: TOIMEntitySlotResolver<TPk>): void {
        this.resolveSlot = resolveSlot;
        const allSlots = this.store.getAll();
        for (const [key, slots] of allSlots) {
            this.store.setOneByKey(
                key,
                slots.map(slot => this.getOrCreateSlot(slot.pk))
            );
        }
    }

    /**
     * Get primary keys for a specific index key
     */
    public getPksByKey(key: TKey): TPk[] {
        const slotsArray = this.store.getOneByKey(key);
        return slotsArray ? this.slotsToPks(slotsArray) : [];
    }

    public getSlotsByKey(key: TKey): readonly TOIMAnyEntitySlot<TPk>[] {
        const slotsArray = this.store.getOneByKey(key);
        return slotsArray ? slotsArray : [];
    }

    public getSlotsByKeys(
        keys: readonly TKey[]
    ): Map<TKey, readonly TOIMAnyEntitySlot<TPk>[]> {
        return this.store.getManyByKeys(keys);
    }

    /**
     * Check if an index key exists
     */
    public hasKey(key: TKey): boolean {
        return this.store.getOneByKey(key) !== undefined;
    }

    /**
     * Get all index keys
     */
    public getKeys(): readonly TKey[] {
        return this.store.getAllKeys();
    }

    /**
     * Get the number of primary keys for a specific index key
     */
    public getKeySize(key: TKey): number {
        const slotsArray = this.store.getOneByKey(key);
        return slotsArray ? slotsArray.length : 0;
    }

    /**
     * Get total number of index keys
     */
    public get size(): number {
        return this.store.countAll();
    }

    /**
     * Check if the index is empty
     */
    public get isEmpty(): boolean {
        return this.store.countAll() === 0;
    }

    /**
     * Get performance metrics for monitoring and debugging
     */
    public getMetrics() {
        let totalPks = 0;
        let maxBucketSize = 0;
        let minBucketSize = Infinity;
        const allPks = this.store.getAll();

        for (const slotsArray of allPks.values()) {
            totalPks += slotsArray.length;
            maxBucketSize = Math.max(maxBucketSize, slotsArray.length);
            minBucketSize = Math.min(minBucketSize, slotsArray.length);
        }

        return {
            totalKeys: allPks.size,
            totalPks,
            averagePksPerKey: allPks.size > 0 ? totalPks / allPks.size : 0,
            maxBucketSize: maxBucketSize === -Infinity ? 0 : maxBucketSize,
            minBucketSize: minBucketSize === Infinity ? 0 : minBucketSize,
        };
    }

    /**
     * Clean up event listeners when index is no longer needed
     */
    public destroy(): void {
        this.emitter.offAll();
        this.store.clear();
    }

    /**
     * Set primary keys for a specific index key with optional comparison.
     * If comparator is provided and returns true (no changes), skip the update.
     */
    protected setPksWithComparison(key: TKey, newPks: TPk[]): boolean {
        return this.setSlotsWithComparison(key, this.resolveSlots(newPks));
    }

    protected setSlotsWithComparison(
        key: TKey,
        newSlots: TOIMAnyEntitySlot<TPk>[]
    ): boolean {
        // If comparator is provided, check if arrays are equal
        if (this.comparePks) {
            const existingSlotsArray = this.store.getOneByKey(key);
            // Quick size check before expensive comparison
            if (
                existingSlotsArray &&
                existingSlotsArray.length === newSlots.length
            ) {
                if (
                    this.comparePks(
                        this.slotsToPks(existingSlotsArray),
                        this.slotsToPks(newSlots)
                    )
                ) {
                    return false;
                }
            } else if (!existingSlotsArray && newSlots.length === 0) {
                // Both are empty
                return false;
            }
        }

        // Update the PKs
        this.store.setOneByKey(key, newSlots);
        return true;
    }

    protected resolveSlots(pks: readonly TPk[]): TOIMAnyEntitySlot<TPk>[] {
        const slots: TOIMAnyEntitySlot<TPk>[] = [];
        slots.length = pks.length;
        for (let i = 0; i < pks.length; i++) {
            slots[i] = this.getOrCreateSlot(pks[i]);
        }
        return slots;
    }

    protected getOrCreateSlot(pk: TPk): TOIMAnyEntitySlot<TPk> {
        const resolved = this.resolveSlot?.(pk);
        if (resolved) return resolved;

        let fallback = this.fallbackSlots.get(pk);
        if (!fallback) {
            fallback = { pk, item: undefined };
            this.fallbackSlots.set(pk, fallback);
        }
        return fallback;
    }

    protected slotsToPks(slots: readonly TOIMAnyEntitySlot<TPk>[]): TPk[] {
        const pks: TPk[] = [];
        pks.length = slots.length;
        for (let i = 0; i < slots.length; i++) pks[i] = slots[i].pk;
        return pks;
    }

    /**
     * Emit update event with changed keys
     */
    protected emitUpdate(keys: TKey[]): void {
        this.emitter.emit(EOIMIndexEventType.UPDATE, { keys });
    }

    /**
     * Emit update event for a single key (fast-path override point).
     */
    protected emitUpdateOne(key: TKey): void {
        this.emitUpdate([key]);
    }
}
