import { TOIMKey } from '../types/TOIMKey';
import { TOIMAnyEntitySlot, TOIMEntitySlotGetter } from '../types/TOIMEntitySlot';
import { TOIMCollectionOrderedIndexOptions } from '../types/TOIMCollectionIndexOptions';
import { TOIMPk } from '../types/TOIMPk';
import { OIMIndexManualOrderedArrayBased } from './OIMIndexManualOrderedArrayBased';

/**
 * Collection-bound ordered Array-based index.
 *
 * Raw ordered indexes store slots. This variant provides PK writes and resolves
 * them to canonical collection slots at construction-bound write time.
 */
export class OIMCollectionIndexManualOrderedArrayBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TEntity extends object = object,
> extends OIMIndexManualOrderedArrayBased<TKey, TPk> {
    private readonly getSlot: TOIMEntitySlotGetter<TPk>;

    constructor(opts: TOIMCollectionOrderedIndexOptions<TEntity, TPk>) {
        super();
        this.getSlot =
            opts.collection !== undefined
                ? (pk: TPk) => opts.collection.getSlotByPk(pk)
                : opts.getSlot;
    }

    public push(key: TKey, pk: TPk): number {
        return this.pushSlot(key, this.getRequiredSlot(pk));
    }

    public insertAt(key: TKey, index: number, pk: TPk): number {
        return this.insertSlotAt(key, index, this.getRequiredSlot(pk));
    }

    public reset(key: TKey, pks: readonly TPk[]): void {
        this.resetSlots(key, this.getRequiredSlots(pks));
    }

    public override getEntitiesByKey<TItem extends object = TEntity>(
        key: TKey
    ): (TItem | undefined)[] {
        return super.getEntitiesByKey<TItem>(key);
    }

    public override getEntitiesByKeys<TItem extends object = TEntity>(
        keys: readonly TKey[]
    ): Map<TKey, (TItem | undefined)[]> {
        return super.getEntitiesByKeys<TItem>(keys);
    }

    // Gets the slot for a pk, throwing if the (custom) getter has none — this
    // ordered index requires a real slot to place in order.
    public getRequiredSlot(pk: TPk): TOIMAnyEntitySlot<TPk> {
        const slot = this.getSlot(pk);
        if (!slot) {
            throw new Error(
                `[OIMCollectionIndexManualOrderedArrayBased]: no slot for PK "${String(pk)}".`
            );
        }
        return slot;
    }

    private getRequiredSlots(pks: readonly TPk[]): TOIMAnyEntitySlot<TPk>[] {
        const slots: TOIMAnyEntitySlot<TPk>[] = [];
        slots.length = pks.length;
        for (let i = 0; i < pks.length; i++) {
            slots[i] = this.getRequiredSlot(pks[i]);
        }
        return slots;
    }
}
