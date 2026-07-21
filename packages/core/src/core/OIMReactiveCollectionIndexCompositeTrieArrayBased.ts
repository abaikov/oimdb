import { TOIMKey } from '../types/TOIMKey';
import { OIMReactiveIndexManualArrayBased } from './OIMReactiveIndexManualArrayBased';
import { OIMEventQueue } from './OIMEventQueue';
import {
    TOIMAnyEntitySlot,
    TOIMEntitySlotResolver,
} from '../types/TOIMEntitySlot';
import { TOIMCollectionIndexCompositeArrayBasedOptions } from '../types/TOIMCollectionIndexOptions';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMKeyPath } from '../types/TOIMKeyPath';
import { OIMIndexStoreTrieDrivenArrayBased } from './OIMIndexStoreTrieDrivenArrayBased';
import { OIMTrieMap } from './OIMTrieMap';

/**
 * Collection-bound reactive Array-based (ordered) index keyed by a composite key
 * path (`TOIMKeyPath`). The array counterpart of
 * `OIMReactiveCollectionIndexCompositeTrieSetBased`: same manual
 * `setPks`/`addPks`/`removePks` surface and collection slot resolution, but keys
 * are ordered slot arrays and each key is a path matched by content in O(arity).
 *
 * Primitive-keyed indexes keep their native-`Map` fast path — the trie cost is
 * paid only by this opt-in index.
 */
export class OIMReactiveCollectionIndexCompositeTrieArrayBased<
    TPk extends TOIMKey,
    TEntity extends object = object,
> extends OIMReactiveIndexManualArrayBased<TOIMKeyPath, TPk> {
    private readonly resolveSlot: TOIMEntitySlotResolver<TPk>;
    // Persistent per-key-path pk membership for O(1) `addPks` dedup. Trie-keyed
    // so a rebuilt key path matches by content.
    private readonly pksByKey = new OIMTrieMap<TOIMPk, Set<TPk>>();

    constructor(
        queue: OIMEventQueue,
        opts: TOIMCollectionIndexCompositeArrayBasedOptions<TEntity, TPk>
    ) {
        const resolveSlot =
            opts.collection !== undefined
                ? (pk: TPk) => opts.collection.getOrReserveSlotByPk(pk)
                : opts.resolveSlot;

        super(queue, {
            indexOptions: {
                comparePks: opts.indexOptions?.comparePks,
                store:
                    opts.indexOptions?.store ??
                    new OIMIndexStoreTrieDrivenArrayBased<TPk>(),
            },
        });
        this.resolveSlot = resolveSlot;
    }

    public setPks(key: TOIMKeyPath, pks: readonly TPk[]): void {
        const pkSet = new Set<TPk>();
        for (let i = 0; i < pks.length; i++) pkSet.add(pks[i]);
        this.pksByKey.set(key, pkSet);
        super.setSlots(key, this.resolveSlots(pks));
    }

    public addPks(key: TOIMKeyPath, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        const pkSet = this.membershipOf(key);
        const newSlots: TOIMAnyEntitySlot<TPk>[] = [];
        for (const pk of pks) {
            if (pkSet.has(pk)) continue;
            pkSet.add(pk);
            newSlots.push(this.resolveRequiredSlot(pk));
        }
        if (newSlots.length > 0) this.appendSlots(key, newSlots);
    }

    public removePks(key: TOIMKeyPath, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        const pksToRemove = new Set(pks);
        const existingSlots = this.index.getSlotsByKey(key);
        const nextSlots = existingSlots.filter(
            slot => !pksToRemove.has(slot.pk)
        );

        if (nextSlots.length === existingSlots.length) return;
        const pkSet = this.pksByKey.get(key);
        if (pkSet) {
            for (let i = 0; i < pks.length; i++) pkSet.delete(pks[i]);
        }
        if (nextSlots.length === 0) this.clear(key);
        else super.setSlots(key, nextSlots);
    }

    public override clear(key?: TOIMKeyPath): void {
        if (key === undefined) this.pksByKey.clear();
        else this.pksByKey.delete(key);
        super.clear(key);
    }

    /**
     * The membership set for a key path, lazily seeded from the current bucket so
     * it stays correct even if slots were set through a lower-level path.
     */
    private membershipOf(key: TOIMKeyPath): Set<TPk> {
        let pkSet = this.pksByKey.get(key);
        if (!pkSet) {
            pkSet = new Set();
            const existing = this.index.getSlotsByKey(key);
            for (let i = 0; i < existing.length; i++) {
                pkSet.add(existing[i].pk);
            }
            this.pksByKey.set(key, pkSet);
        }
        return pkSet;
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
        // A custom resolver may not have a slot for this pk yet. Hold a transient
        // empty slot so the pk stays indexed and the entity materializes once it
        // exists (the collection-bound resolver returns a reserved slot).
        if (!slot) return { pk, item: undefined };
        return slot;
    }
}
