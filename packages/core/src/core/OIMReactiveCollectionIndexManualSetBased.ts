import { TOIMKey } from '../types/TOIMKey';
import { OIMReactiveIndexManualSetBased } from './OIMReactiveIndexManualSetBased';
import { OIMEventQueue } from './OIMEventQueue';
import {
    TOIMAnyEntitySlot,
    TOIMEntitySlotResolver,
} from '../types/TOIMEntitySlot';
import { TOIMCollectionIndexSetBasedOptions } from '../types/TOIMCollectionIndexOptions';
import { TOIMPk } from '../types/TOIMPk';

/**
 * Collection-bound reactive Set-based index.
 *
 * PK writes (`setPks`/`addPks`/`removePks`) resolve canonical entity slots
 * through the collection binding and delegate to the underlying index, which
 * keeps each key's pk→slot membership ON the bucket itself — so a write touches
 * the key's store bucket exactly once (no separate membership map/trie).
 */
export class OIMReactiveCollectionIndexManualSetBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TEntity extends object = object,
> extends OIMReactiveIndexManualSetBased<TKey, TPk> {
    private readonly resolveSlot: TOIMEntitySlotResolver<TPk>;
    // Bound once so the hot pk-write path passes a stable function (no per-call
    // closure allocation).
    private readonly resolveRequiredSlot = (
        pk: TPk
    ): TOIMAnyEntitySlot<TPk> => {
        const slot = this.resolveSlot(pk);
        // A custom resolver may not have a slot for this pk yet. Hold a transient
        // empty slot so the pk stays indexed and the entity materializes once it
        // exists (the collection-bound resolver returns a reserved slot).
        if (!slot) return { pk, item: undefined };
        return slot;
    };

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
            pkDomain: opts.collection?.keyDomain,
        });
        this.resolveSlot = resolveSlot;
    }

    public setPks(key: TKey, pks: readonly TPk[]): void {
        this.index.setPks(key, pks, this.resolveRequiredSlot);
    }

    public addPks(key: TKey, pks: readonly TPk[]): void {
        this.index.addPks(key, pks, this.resolveRequiredSlot);
    }

    public removePks(key: TKey, pks: readonly TPk[]): void {
        this.index.removePks(key, pks);
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
}
