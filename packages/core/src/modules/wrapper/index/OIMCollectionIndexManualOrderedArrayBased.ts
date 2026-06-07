import { TOIMAnyEntitySlot, TOIMEntitySlotResolver } from '../../../types/TOIMEntitySlot';
import { TOIMCollectionOrderedIndexOptions } from '../../../types/TOIMCollectionIndexOptions';
import { TOIMPk } from '../../../types/TOIMPk';
import { OIMIndexManualOrderedArrayBased } from './OIMIndexManualOrderedArrayBased';

/**
 * Collection-bound ordered Array-based index.
 *
 * Raw ordered indexes store slots. This variant provides PK writes and resolves
 * them to canonical collection slots at construction-bound write time.
 */
export class OIMCollectionIndexManualOrderedArrayBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
    TEntity extends object = object,
> extends OIMIndexManualOrderedArrayBased<TKey, TPk> {
    private readonly resolveSlot: TOIMEntitySlotResolver<TPk>;

    constructor(opts: TOIMCollectionOrderedIndexOptions<TEntity, TPk>) {
        super();
        this.resolveSlot =
            opts.collection !== undefined
                ? (pk: TPk) => opts.collection.getSlotByPk(pk)
                : opts.resolveSlot;
    }

    public push(key: TKey, pk: TPk): number {
        return this.pushSlot(key, this.resolveRequiredSlot(pk));
    }

    public insertAt(key: TKey, index: number, pk: TPk): number {
        return this.insertSlotAt(key, index, this.resolveRequiredSlot(pk));
    }

    public reset(key: TKey, pks: readonly TPk[]): void {
        this.resetSlots(key, this.resolveSlots(pks));
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

    public resolvePk(pk: TPk): TOIMAnyEntitySlot<TPk> {
        return this.resolveRequiredSlot(pk);
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
                `[OIMCollectionIndexManualOrderedArrayBased]: Unable to resolve slot for PK "${String(pk)}".`
            );
        }
        return slot;
    }
}
