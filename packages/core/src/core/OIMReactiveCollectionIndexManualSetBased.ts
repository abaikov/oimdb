import { TOIMKey } from '../types/TOIMKey';
import { OIMReactiveIndexManualSetBased } from './OIMReactiveIndexManualSetBased';
import { OIMEventQueue } from './OIMEventQueue';
import {
    TOIMAnyEntitySlot,
    TOIMEntitySlotGetter,
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
    private readonly getSlot: TOIMEntitySlotGetter<TPk>;
    // Bound once so the hot pk-write path passes a stable function (no per-call
    // closure allocation).
    private readonly getSlotOrTransient = (
        pk: TPk
    ): TOIMAnyEntitySlot<TPk> => {
        const slot = this.getSlot(pk);
        // A custom getter may not have a slot for this pk yet. Hold a transient
        // empty slot so the pk stays indexed and the entity materializes once it
        // exists (the collection-bound getter returns a reserved slot).
        if (!slot) return { pk, item: undefined };
        return slot;
    };

    constructor(
        queue: OIMEventQueue,
        opts: TOIMCollectionIndexSetBasedOptions<TEntity, TKey, TPk>
    ) {
        const getSlot =
            opts.collection !== undefined
                ? (pk: TPk) => opts.collection.getOrReserveSlotByPk(pk)
                : opts.getSlot;

        super(queue, {
            indexOptions: opts.indexOptions,
        });
        this.getSlot = getSlot;
        this.findSlotForRemoval =
            opts.collection !== undefined
                ? (pk: TPk) => opts.collection.findSlotByPk(pk)
                : opts.getSlot;
    }

    // Non-reserving resolve used by `removePks` to canonicalize a raw pk to its
    // `slot.pk` (the membership key) without creating a slot for an absent pk.
    private readonly findSlotForRemoval: (
        pk: TPk
    ) => TOIMAnyEntitySlot<TPk> | undefined;

    public setPks(key: TKey, pks: readonly TPk[]): void {
        this.index.setPks(key, pks, this.getSlotOrTransient);
    }

    public addPks(key: TKey, pks: readonly TPk[]): void {
        this.index.addPks(key, pks, this.getSlotOrTransient);
    }

    public removePks(key: TKey, pks: readonly TPk[]): void {
        // Membership is keyed by the canonical `slot.pk`. Map each raw pk to it
        // via the collection; if the slot is already gone (entity removed), fall
        // back to the pk itself — for the removal event the collection emits the
        // canonical pk, so it still matches.
        const canonical: TPk[] = [];
        for (let i = 0; i < pks.length; i++) {
            const slot = this.findSlotForRemoval(pks[i]);
            canonical.push(slot ? slot.pk : pks[i]);
        }
        this.index.removePks(key, canonical);
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
