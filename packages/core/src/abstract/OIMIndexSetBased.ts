import { OIMEventEmitter } from '../core/OIMEventEmitter';
import { EOIMIndexEventType } from '../enum/EOIMIndexEventType';
import { TOIMIndexUpdatePayload } from '../type/TOIMIndexUpdatePayload';
import { TOIMPk } from '../type/TOIMPk';
import { TOIMIndexComparator } from '../type/TOIMIndexComparator';
import { OIMIndexStoreSetBased } from './OIMIndexStoreSetBased';
import { OIMIndexStoreMapDrivenSetBased } from '../core/OIMIndexStoreMapDrivenSetBased';
import {
    TOIMAnyEntitySlot,
    TOIMEntitySlotResolver,
} from '../type/TOIMEntitySlot';

/**
 * Abstract base class for Set-based index types.
 * Provides common functionality and event system for key-to-PKs mappings using Set storage.
 */
export abstract class OIMIndexSetBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> {
    protected readonly comparePks?: TOIMIndexComparator<TPk>;
    protected readonly store: OIMIndexStoreSetBased<TKey, TPk>;
    protected resolveSlot?: TOIMEntitySlotResolver<TPk>;
    private readonly fallbackSlots = new Map<TPk, TOIMAnyEntitySlot<TPk>>();
    public readonly emitter = new OIMEventEmitter<{
        [EOIMIndexEventType.UPDATE]: TOIMIndexUpdatePayload<TKey>;
    }>();

    constructor(
        options: {
            comparePks?: TOIMIndexComparator<TPk>;
            store?: OIMIndexStoreSetBased<TKey, TPk>;
            resolveSlot?: TOIMEntitySlotResolver<TPk>;
        } = {}
    ) {
        this.comparePks = options.comparePks;
        this.store =
            options.store ?? new OIMIndexStoreMapDrivenSetBased<TKey, TPk>();
        this.resolveSlot = options.resolveSlot;
    }

    /**
     * Get primary keys for multiple index keys
     */
    public getPksByKeys(keys: readonly TKey[]): Map<TKey, Set<TPk>> {
        const result = new Map<TKey, Set<TPk>>();
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
                this.resolveSlots(this.slotsToPks(slots))
            );
        }
    }

    /**
     * @deprecated Use getPksByKey instead
     * Get primary keys for a specific index key
     */
    public getPks(key: TKey): Set<TPk> {
        return this.getPksByKey(key);
    }

    /**
     * Get primary keys for a specific index key
     */
    public getPksByKey(key: TKey): Set<TPk> {
        const slotsSet = this.store.getOneByKey(key);
        return slotsSet ? this.slotsToPks(slotsSet) : new Set();
    }

    public getSlotsByKey(key: TKey): ReadonlySet<TOIMAnyEntitySlot<TPk>> {
        const slotsSet = this.store.getOneByKey(key);
        return slotsSet ? slotsSet : new Set();
    }

    public getSlotsByKeys(
        keys: readonly TKey[]
    ): Map<TKey, ReadonlySet<TOIMAnyEntitySlot<TPk>>> {
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
        const slotsSet = this.store.getOneByKey(key);
        return slotsSet ? slotsSet.size : 0;
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

        for (const slotsSet of allPks.values()) {
            totalPks += slotsSet.size;
            maxBucketSize = Math.max(maxBucketSize, slotsSet.size);
            minBucketSize = Math.min(minBucketSize, slotsSet.size);
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
    protected setPksWithComparison(key: TKey, newPks: Set<TPk>): boolean {
        return this.setSlotsWithComparison(key, this.resolveSlots(newPks));
    }

    protected setSlotsWithComparison(
        key: TKey,
        newSlots: Set<TOIMAnyEntitySlot<TPk>>
    ): boolean {
        // If comparator is provided, check if arrays are equal
        if (this.comparePks) {
            const existingSlotsSet = this.store.getOneByKey(key);
            // Quick size check before expensive comparison
            if (existingSlotsSet && existingSlotsSet.size === newSlots.size) {
                // Convert Sets to arrays for comparator
                const existingPksArray = Array.from(
                    this.slotsToPks(existingSlotsSet)
                );
                const newPksArray = Array.from(this.slotsToPks(newSlots));

                if (this.comparePks(existingPksArray, newPksArray)) {
                    return false;
                }
            } else if (!existingSlotsSet && newSlots.size === 0) {
                // Both are empty
                return false;
            }
        }

        // Update the PKs
        this.store.setOneByKey(key, newSlots);
        return true;
    }

    protected resolveSlots(
        pks: Iterable<TPk>
    ): Set<TOIMAnyEntitySlot<TPk>> {
        const slots = new Set<TOIMAnyEntitySlot<TPk>>();
        for (const pk of pks) slots.add(this.getOrCreateSlot(pk));
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

    protected slotsToPks(slots: Iterable<TOIMAnyEntitySlot<TPk>>): Set<TPk> {
        const pks = new Set<TPk>();
        for (const slot of slots) pks.add(slot.pk);
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
