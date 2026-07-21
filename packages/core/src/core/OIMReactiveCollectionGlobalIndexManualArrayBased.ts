import { TOIMKey } from '../types/TOIMKey';
import { OIMReactiveGlobalIndexManualArrayBased } from './OIMReactiveGlobalIndexManualArrayBased';
import { OIMEventQueue } from './OIMEventQueue';
import {
    TOIMAnyEntitySlot,
    TOIMEntitySlotResolver,
} from '../types/TOIMEntitySlot';
import { TOIMCollectionGlobalIndexArrayBasedOptions } from '../types/TOIMCollectionGlobalIndexOptions';
import { TOIMPk } from '../types/TOIMPk';

/**
 * Collection-bound reactive array-based keyless index.
 *
 * PK writes (`setPks`/`addPks`/`removePks`) resolve canonical entity slots
 * through the collection binding. A single `membership` set gives O(1) `addPks`
 * dedup. Mirrors {@link OIMReactiveCollectionIndexManualArrayBased} minus the
 * key (one bucket instead of a per-key map).
 */
export class OIMReactiveCollectionGlobalIndexManualArrayBased<
    TPk extends TOIMKey,
    TEntity extends object = object,
> extends OIMReactiveGlobalIndexManualArrayBased<TPk> {
    private readonly resolveSlot: TOIMEntitySlotResolver<TPk>;
    // Single pk membership set for O(1) `addPks` dedup. Lazily seeded from the
    // bucket so it stays correct even after a raw `setSlots` (e.g. derived
    // rebuild), matching the keyed index's `membershipOf`.
    private readonly membership = new Set<TPk>();
    private membershipSeeded = false;

    constructor(
        queue: OIMEventQueue,
        opts: TOIMCollectionGlobalIndexArrayBasedOptions<TEntity, TPk>
    ) {
        const resolveSlot =
            opts.collection !== undefined
                ? (pk: TPk) => opts.collection.getOrReserveSlotByPk(pk)
                : opts.resolveSlot;

        super(queue, { indexOptions: opts.indexOptions });
        this.resolveSlot = resolveSlot;
    }

    public setPks(pks: readonly TPk[]): void {
        this.membership.clear();
        for (let i = 0; i < pks.length; i++) this.membership.add(pks[i]);
        this.membershipSeeded = true;
        super.setSlots(this.resolveSlots(pks));
    }

    public addPks(pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        // O(added): dedup via the persistent membership set and append in place.
        const membership = this.membershipOf();
        const newSlots: TOIMAnyEntitySlot<TPk>[] = [];
        for (const pk of pks) {
            if (membership.has(pk)) continue;
            membership.add(pk);
            newSlots.push(this.resolveRequiredSlot(pk));
        }
        if (newSlots.length > 0) super.appendSlots(newSlots);
    }

    public removePks(pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        const membership = this.membershipOf();
        if (membership.size === 0) return;

        const pksToRemove = new Set(pks);
        const existingSlots = this.index.getSlots();
        const nextSlots = existingSlots.filter(
            slot => !pksToRemove.has(slot.pk)
        );
        if (nextSlots.length === existingSlots.length) return;

        for (let i = 0; i < pks.length; i++) membership.delete(pks[i]);
        if (nextSlots.length === 0) this.clear();
        else super.setSlots(nextSlots);
    }

    public override clear(): void {
        this.membership.clear();
        this.membershipSeeded = false;
        super.clear();
    }

    private membershipOf(): Set<TPk> {
        if (!this.membershipSeeded) {
            this.membership.clear();
            const existing = this.index.getSlots();
            for (let i = 0; i < existing.length; i++) {
                this.membership.add(existing[i].pk);
            }
            this.membershipSeeded = true;
        }
        return this.membership;
    }

    public override getEntities<TItem extends object = TEntity>(): (
        | TItem
        | undefined
    )[] {
        return super.getEntities<TItem>();
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
        // A custom resolver may not have a slot for this pk yet — hold a
        // transient empty slot so the pk stays indexed and the entity simply
        // does not materialize until it exists.
        if (!slot) return { pk, item: undefined };
        return slot;
    }
}
