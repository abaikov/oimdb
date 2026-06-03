import { OIMReactiveIndexManualArrayBased } from './OIMReactiveIndexManualArrayBased';
import { OIMEventQueue } from './OIMEventQueue';
import { TOIMAnyEntitySlot, TOIMEntitySlotResolver } from '../types/TOIMEntitySlot';
import { TOIMCollectionIndexArrayBasedOptions } from '../types/TOIMCollectionIndexOptions';
import { TOIMPk } from '../types/TOIMPk';

/**
 * Collection-bound reactive Array-based index.
 *
 * PK writes (`setPks`/`addPks`/`removePks`) resolve canonical entity slots
 * through the collection binding supplied at construction time.
 */
export class OIMReactiveCollectionIndexManualArrayBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
    TEntity extends object = object,
> extends OIMReactiveIndexManualArrayBased<TKey, TPk> {
    private readonly resolveSlot: TOIMEntitySlotResolver<TPk>;

    constructor(
        queue: OIMEventQueue,
        opts: TOIMCollectionIndexArrayBasedOptions<TEntity, TKey, TPk>
    ) {
        const resolveSlot =
            opts.collection !== undefined
                ? (pk: TPk) => opts.collection.getSlotByPk(pk)
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
        const existingPks = new Set(existingSlots.map(slot => slot.pk));
        const nextSlots = existingSlots.slice();
        let hasChanges = false;

        for (const pk of pks) {
            if (existingPks.has(pk)) continue;
            nextSlots.push(this.resolveRequiredSlot(pk));
            existingPks.add(pk);
            hasChanges = true;
        }

        if (hasChanges) this.setSlots(key, nextSlots);
    }

    public removePks(key: TKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        const pksToRemove = new Set(pks);
        const existingSlots = this.index.getSlotsByKey(key);
        const nextSlots = existingSlots.filter(
            slot => !pksToRemove.has(slot.pk)
        );

        if (nextSlots.length === existingSlots.length) return;
        if (nextSlots.length === 0) this.clear(key);
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

    private resolveSlots(pks: readonly TPk[]): TOIMAnyEntitySlot<TPk>[] {
        const slots: TOIMAnyEntitySlot<TPk>[] = [];
        slots.length = pks.length;
        for (let i = 0; i < pks.length; i++) {
            slots[i] = this.resolveRequiredSlot(pks[i]);
        }
        return slots;
    }

    private resolveRequiredSlot(pk: TPk): TOIMAnyEntitySlot<TPk> {
        const slot = this.resolveSlot(pk);
        if (!slot) {
            throw new Error(
                `[OIMReactiveCollectionIndexManualArrayBased]: Unable to resolve slot for PK "${String(pk)}".`
            );
        }
        return slot;
    }
}
