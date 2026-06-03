import { TOIMPk } from '../types/TOIMPk';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { OIMIndexStoreArrayBased } from './OIMIndexStoreArrayBased';
import { OIMIndexStoreMapDrivenArrayBased } from '../core/OIMIndexStoreMapDrivenArrayBased';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMIndex } from './OIMIndex';

export abstract class OIMIndexArrayBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> extends OIMIndex<TKey, TPk, TOIMAnyEntitySlot<TPk>[]> {
    constructor(
        options: {
            comparePks?: TOIMIndexComparator<TPk>;
            store?: OIMIndexStoreArrayBased<TKey, TPk>;
        } = {}
    ) {
        super(
            options.store ?? new OIMIndexStoreMapDrivenArrayBased<TKey, TPk>(),
            options.comparePks
        );
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

    public getSlotsByKey(key: TKey): readonly TOIMAnyEntitySlot<TPk>[] {
        return this.store.getOneByKey(key) ?? [];
    }

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

    protected setSlotsWithComparison(
        key: TKey,
        newSlots: TOIMAnyEntitySlot<TPk>[]
    ): boolean {
        if (this.comparePks) {
            const existingSlotsArray = this.store.getOneByKey(key);
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
                return false;
            }
        }
        this.store.setOneByKey(key, newSlots);
        return true;
    }
}
