import { TOIMKey } from '../types/TOIMKey';
import { OIMReactiveIndexManualArrayBased } from './OIMReactiveIndexManualArrayBased';
import { OIMEventQueue } from './OIMEventQueue';
import { TOIMAnyEntitySlot, TOIMEntitySlotResolver } from '../types/TOIMEntitySlot';
import { TOIMCollectionIndexArrayBasedOptions } from '../types/TOIMCollectionIndexOptions';
import { TOIMPk } from '../types/TOIMPk';
import { IOIMKeyDomain } from '../interfaces/IOIMKeyDomain';
import { IOIMKeyedMap } from '../interfaces/IOIMKeyedMap';
import { IOIMKeyedSet } from '../interfaces/IOIMKeyedSet';
import { OIMKeyDomainNative } from './OIMKeyDomainNative';

/**
 * Collection-bound reactive Array-based index.
 *
 * PK writes (`setPks`/`addPks`/`removePks`) resolve canonical entity slots
 * through the collection binding supplied at construction time.
 */
export class OIMReactiveCollectionIndexManualArrayBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TEntity extends object = object,
> extends OIMReactiveIndexManualArrayBased<TKey, TPk> {
    private readonly resolveSlot: TOIMEntitySlotResolver<TPk>;
    // PK keying strategy, from the bound collection — native for primitive PKs,
    // trie for composite PK paths. Keys the per-key pk membership sets.
    private readonly pkDomain: IOIMKeyDomain<TPk>;
    // Persistent per-key pk membership for O(1) `addPks` dedup (avoids rebuilding
    // a Set from the whole bucket on every call). Kept in sync by setSlots/clear.
    private readonly pksByKey = new Map<TKey, IOIMKeyedSet<TPk>>();

    constructor(
        queue: OIMEventQueue,
        opts: TOIMCollectionIndexArrayBasedOptions<TEntity, TKey, TPk>
    ) {
        const resolveSlot =
            opts.collection !== undefined
                ? (pk: TPk) => opts.collection.getOrReserveSlotByPk(pk)
                : opts.resolveSlot;
        const pkDomain =
            opts.collection?.keyDomain ?? new OIMKeyDomainNative<TPk>();

        super(queue, {
            indexOptions: opts.indexOptions,
        });
        this.resolveSlot = resolveSlot;
        this.pkDomain = pkDomain;
    }

    public setPks(key: TKey, pks: readonly TPk[]): void {
        const pkSet = this.pkDomain.createSet();
        for (let i = 0; i < pks.length; i++) pkSet.add(pks[i]);
        this.pksByKey.set(key, pkSet);
        super.setSlots(key, this.resolveSlots(pks));
    }

    public addPks(key: TKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        // O(added), not O(bucket): dedup via the persistent membership set and
        // append in place — no whole-bucket map/Set rebuild and no slice copy.
        const pkSet = this.membershipOf(key);
        const newSlots: TOIMAnyEntitySlot<TPk>[] = [];
        for (const pk of pks) {
            if (pkSet.has(pk)) continue;
            pkSet.add(pk);
            newSlots.push(this.resolveRequiredSlot(pk));
        }
        if (newSlots.length > 0) this.appendSlots(key, newSlots);
    }

    public removePks(key: TKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        const pksToRemove = new Set(pks);
        const existingSlots = this.index.getSlotsByKey(key);
        const nextSlots = existingSlots.filter(
            slot => !pksToRemove.has(slot.pk)
        );

        if (nextSlots.length === existingSlots.length) return;
        // Update membership incrementally — do NOT rebuild it from the bucket.
        const pkSet = this.pksByKey.get(key);
        if (pkSet) {
            for (let i = 0; i < pks.length; i++) pkSet.delete(pks[i]);
        }
        if (nextSlots.length === 0) this.clear(key);
        else super.setSlots(key, nextSlots);
    }

    public override clear(key?: TKey): void {
        if (key === undefined) this.pksByKey.clear();
        else this.pksByKey.delete(key);
        super.clear(key);
    }

    /**
     * The membership set for a key, lazily seeded from the current bucket so it
     * stays correct even if slots were set through a lower-level path.
     */
    private membershipOf(key: TKey): IOIMKeyedSet<TPk> {
        let pkSet = this.pksByKey.get(key);
        if (!pkSet) {
            pkSet = this.pkDomain.createSet();
            const existing = this.index.getSlotsByKey(key);
            for (let i = 0; i < existing.length; i++) {
                pkSet.add(existing[i].pk);
            }
            this.pksByKey.set(key, pkSet);
        }
        return pkSet;
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
        // A custom resolver may not have a slot for this pk yet. Rather than
        // crashing, hold a transient empty slot so the pk stays indexed and the
        // entity simply does not materialize until it exists. (The collection-
        // bound resolver returns a reserved slot that fills in live.)
        if (!slot) return { pk, item: undefined };
        return slot;
    }
}
