import { TOIMKey } from '../types/TOIMKey';
import { OIMReactiveGlobalIndexManualSetBased } from './OIMReactiveGlobalIndexManualSetBased';
import { OIMEventQueue } from './OIMEventQueue';
import {
    TOIMAnyEntitySlot,
    TOIMEntitySlotGetter,
} from '../types/TOIMEntitySlot';
import { TOIMCollectionGlobalIndexSetBasedOptions } from '../types/TOIMCollectionGlobalIndexOptions';
import { TOIMPk } from '../types/TOIMPk';

/**
 * Collection-bound reactive set-based keyless index.
 *
 * PK writes (`setPks`/`addPks`/`removePks`) resolve canonical entity slots
 * through the collection binding. A single pk→slot `membership` map gives O(1)
 * add (dedup) and O(1) remove. Mirrors
 * {@link OIMReactiveCollectionIndexManualSetBased} minus the key.
 */
export class OIMReactiveCollectionGlobalIndexManualSetBased<
    TPk extends TOIMKey,
    TEntity extends object = object,
> extends OIMReactiveGlobalIndexManualSetBased<TPk> {
    private readonly getSlot: TOIMEntitySlotGetter<TPk>;
    private readonly membership = new Map<TPk, TOIMAnyEntitySlot<TPk>>();
    private membershipSeeded = false;

    constructor(
        queue: OIMEventQueue,
        opts: TOIMCollectionGlobalIndexSetBasedOptions<TEntity, TPk>
    ) {
        const getSlot =
            opts.collection !== undefined
                ? (pk: TPk) => opts.collection.getOrReserveSlotByPk(pk)
                : opts.getSlot;

        super(queue, { indexOptions: opts.indexOptions });
        this.getSlot = getSlot;
    }

    public setPks(pks: readonly TPk[]): void {
        this.membership.clear();
        const slots: TOIMAnyEntitySlot<TPk>[] = [];
        for (let i = 0; i < pks.length; i++) {
            const pk = pks[i];
            const slot = this.getSlotOrTransient(pk);
            if (!this.membership.has(pk)) this.membership.set(pk, slot);
            slots.push(slot);
        }
        this.membershipSeeded = true;
        super.setSlots(slots);
    }

    public addPks(pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        const membership = this.membershipOf();
        const newSlots: TOIMAnyEntitySlot<TPk>[] = [];
        for (const pk of pks) {
            if (membership.has(pk)) continue;
            const slot = this.getSlotOrTransient(pk);
            membership.set(pk, slot);
            newSlots.push(slot);
        }
        if (newSlots.length > 0) super.addSlots(newSlots);
    }

    public removePks(pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        const membership = this.membershipOf();
        if (membership.size === 0) return;
        const removed: TOIMAnyEntitySlot<TPk>[] = [];
        for (const pk of pks) {
            const slot = membership.get(pk);
            if (slot) {
                membership.delete(pk);
                removed.push(slot);
            }
        }
        if (removed.length === 0) return;
        super.removeSlots(removed);
    }

    public override clear(): void {
        this.membership.clear();
        this.membershipSeeded = false;
        super.clear();
    }

    private membershipOf(): Map<TPk, TOIMAnyEntitySlot<TPk>> {
        if (!this.membershipSeeded) {
            this.membership.clear();
            for (const slot of this.index.getSlots()) {
                this.membership.set(slot.pk, slot);
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

    private getSlotOrTransient(pk: TPk): TOIMAnyEntitySlot<TPk> {
        const slot = this.getSlot(pk);
        if (!slot) return { pk, item: undefined };
        return slot;
    }
}
