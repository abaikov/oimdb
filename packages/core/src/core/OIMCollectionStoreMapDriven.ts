import { TOIMPk } from '../types/TOIMPk';
import { OIMCollectionStore } from '../abstract/OIMCollectionStore';
import { TOIMEntitySlot } from '../types/TOIMEntitySlot';

export class OIMCollectionStoreMapDriven<
    TEntity extends object,
    TPk extends TOIMPk,
> extends OIMCollectionStore<TEntity, TPk> {
    protected readonly slots = new Map<TPk, TOIMEntitySlot<TEntity, TPk>>();
    // Slots reserved by indexes for PKs whose entity has not arrived yet.
    // They carry `item: undefined` and live apart from `slots` so they do not
    // leak into entity enumeration (getAll/getAllPks/countAll). When the entity
    // is finally written, the reserved slot is promoted into `slots` — keeping
    // the reference that indexes already hold, so it fills in live.
    protected readonly reservedSlots = new Map<TPk, TOIMEntitySlot<TEntity, TPk>>();

    setOneByPk(pk: TPk, entity: TEntity): TOIMEntitySlot<TEntity, TPk> {
        const slot = this.slots.get(pk);
        if (slot) {
            slot.item = entity;
            return slot;
        }
        const reserved = this.reservedSlots.get(pk);
        if (reserved) {
            reserved.item = entity;
            this.reservedSlots.delete(pk);
            this.slots.set(pk, reserved);
            return reserved;
        }
        const nextSlot = { pk, item: entity };
        this.slots.set(pk, nextSlot);
        return nextSlot;
    }

    getOrReserveSlotByPk(pk: TPk): TOIMEntitySlot<TEntity, TPk> {
        const slot = this.slots.get(pk);
        if (slot) return slot;
        let reserved = this.reservedSlots.get(pk);
        if (!reserved) {
            reserved = { pk, item: undefined };
            this.reservedSlots.set(pk, reserved);
        }
        return reserved;
    }

    setManyByPks(
        pks: readonly TPk[],
        entities: TEntity[]
    ): TOIMEntitySlot<TEntity, TPk>[] {
        const slots: TOIMEntitySlot<TEntity, TPk>[] = [];
        slots.length = pks.length;
        for (let i = 0; i < pks.length; i++) {
            slots[i] = this.setOneByPk(pks[i], entities[i]);
        }
        return slots;
    }

    getSlotByPk(pk: TPk): TOIMEntitySlot<TEntity, TPk> | undefined {
        return this.slots.get(pk);
    }

    getSlotsByPks(pks: readonly TPk[]): TOIMEntitySlot<TEntity, TPk>[] {
        const result: TOIMEntitySlot<TEntity, TPk>[] = [];
        result.length = pks.length;
        let writeIndex = 0;
        for (let i = 0; i < pks.length; i++) {
            const slot = this.slots.get(pks[i]);
            if (slot !== undefined) {
                result[writeIndex++] = slot;
            }
        }
        result.length = writeIndex;
        return result;
    }

    getAllSlots(): TOIMEntitySlot<TEntity, TPk>[] {
        return Array.from(this.slots.values());
    }

    removeOneByPk(pk: TPk): void {
        const slot = this.slots.get(pk);
        if (slot) slot.item = undefined;
        this.slots.delete(pk);
        const reserved = this.reservedSlots.get(pk);
        if (reserved) {
            reserved.item = undefined;
            this.reservedSlots.delete(pk);
        }
    }

    removeManyByPks(pks: readonly TPk[]): void {
        // Direct delete instead of method call for better performance
        for (const pk of pks) {
            this.removeOneByPk(pk);
        }
    }

    getOneByPk(pk: TPk): TEntity | undefined {
        return this.slots.get(pk)?.item;
    }

    getManyByPks(pks: readonly TPk[]): TEntity[] {
        // Single pass instead of map + filter to avoid intermediate arrays
        const result: TEntity[] = [];
        result.length = pks.length; // Pre-size for better performance
        let writeIndex = 0;
        for (let i = 0; i < pks.length; i++) {
            const entity = this.getOneByPk(pks[i]);
            if (entity !== undefined) {
                result[writeIndex++] = entity;
            }
        }
        result.length = writeIndex; // Trim to actual size
        return result;
    }

    getAll(): TEntity[] {
        const result: TEntity[] = [];
        for (const slot of this.slots.values()) {
            if (slot.item !== undefined) result.push(slot.item);
        }
        return result;
    }

    countAll(): number {
        return this.slots.size;
    }

    clear(): void {
        for (const slot of this.slots.values()) {
            slot.item = undefined;
        }
        this.slots.clear();
        for (const slot of this.reservedSlots.values()) {
            slot.item = undefined;
        }
        this.reservedSlots.clear();
    }

    getAllPks(): TPk[] {
        return Array.from(this.slots.keys());
    }

    destroy(): void {
        this.clear();
    }
}
