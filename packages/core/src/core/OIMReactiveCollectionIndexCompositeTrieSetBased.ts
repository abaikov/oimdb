import { TOIMKey } from '../types/TOIMKey';
import { OIMReactiveIndexManualSetBased } from './OIMReactiveIndexManualSetBased';
import { OIMEventQueue } from './OIMEventQueue';
import {
    TOIMAnyEntitySlot,
    TOIMEntitySlotGetter,
} from '../types/TOIMEntitySlot';
import { TOIMCollectionIndexCompositeSetBasedOptions } from '../types/TOIMCollectionIndexOptions';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMKeyPath } from '../types/TOIMKeyPath';
import { OIMIndexStoreTrieDrivenSetBased } from './OIMIndexStoreTrieDrivenSetBased';

/**
 * Collection-bound reactive Set-based index keyed by a composite key path
 * (`TOIMKeyPath`) — an arbitrary-length tuple of primitive segments, e.g.
 * `[userId, projectId, role]`.
 *
 * Composite counterpart of `OIMReactiveCollectionIndexManualSetBased`: same
 * manual `setPks`/`addPks`/`removePks` surface and collection slot resolution,
 * but every key is a path matched by content in O(arity). Because the pk→slot
 * membership lives ON the store bucket (not a separate key-indexed structure), a
 * pk-write walks the key-path trie exactly once — for both the bucket and its
 * membership. The full path is the lookup unit (no partial/prefix queries);
 * subscriptions deliver per full path off the bucket carrier.
 *
 * The primitive-keyed indexes are untouched and keep their native-`Map` fast
 * path — the trie cost is paid only by this opt-in index.
 */
export class OIMReactiveCollectionIndexCompositeTrieSetBased<
    TPk extends TOIMKey,
    TEntity extends object = object,
> extends OIMReactiveIndexManualSetBased<TOIMKeyPath, TPk> {
    private readonly getSlot: TOIMEntitySlotGetter<TPk>;
    private readonly getSlotOrTransient = (
        pk: TPk
    ): TOIMAnyEntitySlot<TPk> => {
        const slot = this.getSlot(pk);
        if (!slot) return { pk, item: undefined };
        return slot;
    };

    constructor(
        queue: OIMEventQueue,
        opts: TOIMCollectionIndexCompositeSetBasedOptions<TEntity, TPk>
    ) {
        const getSlot =
            opts.collection !== undefined
                ? (pk: TPk) => opts.collection.getOrReserveSlotByPk(pk)
                : opts.getSlot;

        super(queue, {
            indexOptions: {
                comparePks: opts.indexOptions?.comparePks,
                store:
                    opts.indexOptions?.store ??
                    new OIMIndexStoreTrieDrivenSetBased<TPk>(),
            },
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

    public setPks(key: TOIMKeyPath, pks: readonly TPk[]): void {
        this.index.setPks(key, pks, this.getSlotOrTransient);
    }

    public addPks(key: TOIMKeyPath, pks: readonly TPk[]): void {
        this.index.addPks(key, pks, this.getSlotOrTransient);
    }

    public removePks(key: TOIMKeyPath, pks: readonly TPk[]): void {
        // Canonicalize raw pks to their `slot.pk` (the membership key), then
        // remove by that. A pk with no slot (already gone) is skipped.
        const canonical: TPk[] = [];
        for (let i = 0; i < pks.length; i++) {
            const slot = this.findSlotForRemoval(pks[i]);
            canonical.push(slot ? slot.pk : pks[i]);
        }
        this.index.removePks(key, canonical);
    }

    public override getEntitiesByKey<TItem extends object = TEntity>(
        key: TOIMKeyPath
    ): (TItem | undefined)[] {
        return super.getEntitiesByKey<TItem>(key);
    }

    public override getEntitiesByKeys<TItem extends object = TEntity>(
        keys: readonly TOIMKeyPath[]
    ): Map<TOIMKeyPath, (TItem | undefined)[]> {
        return super.getEntitiesByKeys<TItem>(keys);
    }
}
