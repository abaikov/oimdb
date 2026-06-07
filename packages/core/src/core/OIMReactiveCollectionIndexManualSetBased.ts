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
    // Persistent per-key pk → slot map for O(1) add (dedup) and O(1) remove
    // (slot lookup by pk). Kept in sync by setPks/addPks/removePks/clear.
    private readonly slotByPk = new Map<TKey, Map<TPk, TOIMAnyEntitySlot<TPk>>>();

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
        const map = new Map<TPk, TOIMAnyEntitySlot<TPk>>();
        const slots: TOIMAnyEntitySlot<TPk>[] = [];
        for (let i = 0; i < pks.length; i++) {
            const pk = pks[i];
            const slot = this.resolveRequiredSlot(pk);
            if (!map.has(pk)) map.set(pk, slot);
            slots.push(slot);
        }
        this.slotByPk.set(key, map);
        super.setSlots(key, slots);
    }

    public addPks(key: TKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        // O(added): dedup via the persistent pk→slot map and add in place —
        // no whole-bucket Set copy.
        const map = this.membershipOf(key);
        const newSlots: TOIMAnyEntitySlot<TPk>[] = [];
        for (const pk of pks) {
            if (map.has(pk)) continue;
            const slot = this.resolveRequiredSlot(pk);
            map.set(pk, slot);
            newSlots.push(slot);
        }
        if (newSlots.length > 0) this.addSlots(key, newSlots);
    }

    public removePks(key: TKey, pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        // O(removed): look up each slot by pk and delete it from the bucket
        // in place — no whole-bucket rebuild. Lazily seed the map so it is
        // correct even when slots were set via a lower-level path (setSlots).
        const map = this.membershipOf(key);
        if (map.size === 0) return;
        const removed: TOIMAnyEntitySlot<TPk>[] = [];
        for (const pk of pks) {
            const slot = map.get(pk);
            if (slot) {
                map.delete(pk);
                removed.push(slot);
            }
        }
        if (removed.length === 0) return;
        if (map.size === 0) this.slotByPk.delete(key);
        this.removeSlots(key, removed);
    }

    public override clear(key?: TKey): void {
        if (key === undefined) this.slotByPk.clear();
        else this.slotByPk.delete(key);
        super.clear(key);
    }

    /**
     * The pk→slot map for a key, lazily seeded from the current bucket so it
     * stays correct even if slots were set through a lower-level path.
     */
    private membershipOf(key: TKey): Map<TPk, TOIMAnyEntitySlot<TPk>> {
        let map = this.slotByPk.get(key);
        if (!map) {
            map = new Map();
            const existing = this.index.getSlotsByKey(key);
            for (const slot of existing) map.set(slot.pk, slot);
            this.slotByPk.set(key, map);
        }
        return map;
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
