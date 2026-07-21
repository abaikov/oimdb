import { TOIMKey } from '../types/TOIMKey';
import { OIMReactiveIndexManualArrayBased } from './OIMReactiveIndexManualArrayBased';
import { OIMEventQueue } from './OIMEventQueue';
import { TOIMAnyEntitySlot, TOIMEntitySlotGetter } from '../types/TOIMEntitySlot';
import { TOIMCollectionIndexArrayBasedOptions } from '../types/TOIMCollectionIndexOptions';
import { TOIMPk } from '../types/TOIMPk';

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
    private readonly getSlot: TOIMEntitySlotGetter<TPk>;
    // Non-reserving resolve used by `removePks` to find a raw pk's canonical slot
    // without creating one for an absent pk.
    private readonly findSlotForRemoval: (
        pk: TPk
    ) => TOIMAnyEntitySlot<TPk> | undefined;
    // Persistent per-key membership for O(1) `addPks` dedup, keyed by the
    // canonical slot reference (correct for composite pks with a native Set — no
    // content-addressing needed, since slots are one reference per logical key).
    private readonly slotsByKey = new Map<
        TKey,
        Set<TOIMAnyEntitySlot<TPk>>
    >();

    constructor(
        queue: OIMEventQueue,
        opts: TOIMCollectionIndexArrayBasedOptions<TEntity, TKey, TPk>
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

    public setPks(key: TKey, pks: readonly TPk[]): void {
        const slots = this.getSlotsOrTransient(pks);
        this.slotsByKey.set(key, new Set(slots));
        super.setSlots(key, slots);
    }

    public addPks(key: TKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        // O(added), not O(bucket): dedup via the persistent slot set and append
        // in place — no whole-bucket rebuild and no slice copy.
        const slotSet = this.membershipOf(key);
        const newSlots: TOIMAnyEntitySlot<TPk>[] = [];
        for (const pk of pks) {
            const slot = this.getSlotOrTransient(pk);
            if (slotSet.has(slot)) continue;
            slotSet.add(slot);
            newSlots.push(slot);
        }
        if (newSlots.length > 0) this.appendSlots(key, newSlots);
    }

    public removePks(key: TKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        // Map raw pks to their canonical slots (remove by reference). If a slot
        // is already gone, fall back to matching the bucket slot by its `pk` —
        // the removal event carries the canonical pk, so it still matches.
        const slotsToRemove = new Set<TOIMAnyEntitySlot<TPk>>();
        const pksToRemove = new Set<TPk>();
        for (let i = 0; i < pks.length; i++) {
            const slot = this.findSlotForRemoval(pks[i]);
            if (slot) slotsToRemove.add(slot);
            else pksToRemove.add(pks[i]);
        }

        const existingSlots = this.index.getSlotsByKey(key);
        const slotSet = this.slotsByKey.get(key);
        const nextSlots: TOIMAnyEntitySlot<TPk>[] = [];
        for (let i = 0; i < existingSlots.length; i++) {
            const slot = existingSlots[i];
            if (slotsToRemove.has(slot) || pksToRemove.has(slot.pk)) {
                // O(removed) membership sync — no whole-bucket rescan.
                slotSet?.delete(slot);
            } else {
                nextSlots.push(slot);
            }
        }
        if (nextSlots.length === existingSlots.length) return;
        if (nextSlots.length === 0) this.clear(key);
        else super.setSlots(key, nextSlots);
    }

    public override clear(key?: TKey): void {
        if (key === undefined) this.slotsByKey.clear();
        else this.slotsByKey.delete(key);
        super.clear(key);
    }

    /**
     * The membership set for a key, lazily seeded from the current bucket so it
     * stays correct even if slots were set through a lower-level path.
     */
    private membershipOf(key: TKey): Set<TOIMAnyEntitySlot<TPk>> {
        let slotSet = this.slotsByKey.get(key);
        if (!slotSet) {
            slotSet = new Set(this.index.getSlotsByKey(key));
            this.slotsByKey.set(key, slotSet);
        }
        return slotSet;
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

    private getSlotsOrTransient(pks: readonly TPk[]): TOIMAnyEntitySlot<TPk>[] {
        const slots: TOIMAnyEntitySlot<TPk>[] = [];
        slots.length = pks.length;
        for (let i = 0; i < pks.length; i++) {
            slots[i] = this.getSlotOrTransient(pks[i]);
        }
        return slots;
    }

    private getSlotOrTransient(pk: TPk): TOIMAnyEntitySlot<TPk> {
        const slot = this.getSlot(pk);
        // A custom getter may not have a slot for this pk yet. Rather than
        // crashing, hold a transient empty slot so the pk stays indexed and the
        // entity simply does not materialize until it exists. (The collection-
        // bound getter returns a reserved slot that fills in live.)
        if (!slot) return { pk, item: undefined };
        return slot;
    }
}
