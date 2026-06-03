import { TOIMPk } from '../types/TOIMPk';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { OIMIndexStoreSetBased } from './OIMIndexStoreSetBased';
import { OIMIndexStoreMapDrivenSetBased } from '../core/OIMIndexStoreMapDrivenSetBased';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMIndex } from './OIMIndex';

export abstract class OIMIndexSetBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMIndex<TKey, TPk, Set<TOIMAnyEntitySlot<TPk>>> {
    constructor(
        options: {
            comparePks?: TOIMIndexComparator<TPk>;
            store?: OIMIndexStoreSetBased<TKey, TPk>;
        } = {}
    ) {
        super(
            options.store ?? new OIMIndexStoreMapDrivenSetBased<TKey, TPk>(),
            options.comparePks
        );
    }

    protected getBucketSize(bucket: Set<TOIMAnyEntitySlot<TPk>>): number {
        return bucket.size;
    }

    public getPksByKey(key: TKey): Set<TPk> {
        const slotsSet = this.store.getOneByKey(key);
        return slotsSet ? this.slotsToPks(slotsSet) : new Set();
    }

    public getPksByKeys(keys: readonly TKey[]): Map<TKey, Set<TPk>> {
        const result = new Map<TKey, Set<TPk>>();
        const slotsByKey = this.store.getManyByKeys(keys);
        for (const [key, slots] of slotsByKey) {
            result.set(key, this.slotsToPks(slots));
        }
        return result;
    }

    public getSlotsByKey(key: TKey): ReadonlySet<TOIMAnyEntitySlot<TPk>> {
        return this.store.getOneByKey(key) ?? new Set();
    }

    public getSlotsByKeys(
        keys: readonly TKey[]
    ): Map<TKey, ReadonlySet<TOIMAnyEntitySlot<TPk>>> {
        return this.store.getManyByKeys(keys);
    }

    protected slotsToPks(
        slots: Iterable<TOIMAnyEntitySlot<TPk>>
    ): Set<TPk> {
        const pks = new Set<TPk>();
        for (const slot of slots) pks.add(slot.pk);
        return pks;
    }

    protected setSlotsWithComparison(
        key: TKey,
        newSlots: Set<TOIMAnyEntitySlot<TPk>>
    ): boolean {
        if (this.comparePks) {
            const existingSlotsSet = this.store.getOneByKey(key);
            if (existingSlotsSet && existingSlotsSet.size === newSlots.size) {
                if (
                    this.comparePks(
                        Array.from(this.slotsToPks(existingSlotsSet)),
                        Array.from(this.slotsToPks(newSlots))
                    )
                ) {
                    return false;
                }
            } else if (!existingSlotsSet && newSlots.size === 0) {
                return false;
            }
        }
        this.store.setOneByKey(key, newSlots);
        return true;
    }
}
