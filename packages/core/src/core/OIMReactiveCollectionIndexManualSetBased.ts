import { OIMReactiveIndexManualSetBased } from './OIMReactiveIndexManualSetBased';
import { OIMEventQueue } from './OIMEventQueue';
import { TOIMAnyEntitySlot, TOIMEntitySlotResolver } from '../types/TOIMEntitySlot';
import { TOIMCollectionIndexSetBasedOptions } from '../types/TOIMCollectionIndexOptions';
import { TOIMPk } from '../types/TOIMPk';

/**
 * Collection-bound reactive Set-based index.
 *
 * PK writes (`setPks`/`addPks`/`removePks`) resolve canonical entity slots
 * through the collection binding supplied at construction time.
 */
export class OIMReactiveCollectionIndexManualSetBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
    TEntity extends object = object,
> extends OIMReactiveIndexManualSetBased<TKey, TPk> {
    private readonly resolveSlot: TOIMEntitySlotResolver<TPk>;

    constructor(
        queue: OIMEventQueue,
        opts: TOIMCollectionIndexSetBasedOptions<TEntity, TKey, TPk>
    ) {
        const resolveSlot =
            opts.collection !== undefined
                ? (pk: TPk) => opts.collection.getOrReserveSlotByPk(pk)
                : opts.resolveSlot;

        super(queue, {
            indexOptions: opts.indexOptions,
        });
        this.resolveSlot = resolveSlot;
    }

    public setPks(key: TKey, pks: readonly TPk[]): void {
        this.setSlots(key, this.resolveSlots(pks));
    }

    public addPks(key: TKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        const existingSlots = this.index.getSlotsByKey(key);
        const existingPks = this.index.getPksByKey(key);
        const nextSlots = new Set(existingSlots);
        let hasChanges = false;

        for (const pk of pks) {
            if (existingPks.has(pk)) continue;
            const slot = this.resolveRequiredSlot(pk);
            nextSlots.add(slot);
            existingPks.add(pk);
            hasChanges = true;
        }

        if (hasChanges) this.setSlots(key, nextSlots);
    }

    public removePks(key: TKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        const pksToRemove = new Set(pks);
        const existingSlots = this.index.getSlotsByKey(key);
        const nextSlots = new Set<TOIMAnyEntitySlot<TPk>>();
        let hasChanges = false;

        for (const slot of existingSlots) {
            if (pksToRemove.has(slot.pk)) {
                hasChanges = true;
            } else {
                nextSlots.add(slot);
            }
        }

        if (!hasChanges) return;
        if (nextSlots.size === 0) this.clear(key);
        else this.setSlots(key, nextSlots);
    }

    public override getEntitiesByKey<TItem extends object = TEntity>(
        key: TKey
    ): TItem[] {
        return super.getEntitiesByKey<TItem>(key);
    }

    public override getEntitiesByKeys<TItem extends object = TEntity>(
        keys: readonly TKey[]
    ): Map<TKey, TItem[]> {
        return super.getEntitiesByKeys<TItem>(keys);
    }

    private resolveSlots(pks: readonly TPk[]): Set<TOIMAnyEntitySlot<TPk>> {
        const slots = new Set<TOIMAnyEntitySlot<TPk>>();
        for (const pk of pks) slots.add(this.resolveRequiredSlot(pk));
        return slots;
    }

    private resolveRequiredSlot(pk: TPk): TOIMAnyEntitySlot<TPk> {
        const slot = this.resolveSlot(pk);
        // A custom resolver may not have a slot for this pk yet. Rather than
        // crashing, hold a transient empty slot so the pk stays indexed and the
        // entity simply does not materialize until it exists. (The collection-
        // bound resolver returns a reserved slot that fills in live.)
        if (!slot) return { pk, item: undefined };
        return slot;
    }
}
