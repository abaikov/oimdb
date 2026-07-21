import { TOIMKeyPath } from '../types/TOIMKeyPath';
import { TOIMPk } from '../types/TOIMPk';
import { OIMCollectionStore } from '../abstract/OIMCollectionStore';
import { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import { IOIMKeyDomain } from '../interfaces/IOIMKeyDomain';
import { OIMKeyDomainTrie } from './OIMKeyDomainTrie';
import { OIMTrieMap } from './OIMTrieMap';

/**
 * Composite-PK collection store: keys slots by a `TOIMKeyPath` via a trie, so a
 * freshly built `[a, b]` resolves to the same slot as one stored earlier, and
 * `slot.pk` is interned to one canonical reference per logical key (downstream
 * native `Set<slot.pk>` stay correct).
 *
 * It is a SEPARATE class from `OIMCollectionStoreMapDriven` on purpose: each
 * store's `.get`/`.set` call sites see exactly one container shape (all-`Map`
 * there, all-trie here), so a process running both primitive and composite
 * collections keeps both hot paths monomorphic — no shared-class inline-cache
 * pollution. Method bodies mirror the Map store.
 */
export class OIMCollectionStoreTrieDriven<
    TEntity extends object,
> extends OIMCollectionStore<TEntity, TOIMKeyPath> {
    public readonly keyDomain: IOIMKeyDomain<TOIMKeyPath>;
    protected readonly slots: OIMTrieMap<
        TOIMPk,
        TOIMEntitySlot<TEntity, TOIMKeyPath>
    >;
    protected readonly reservedSlots: OIMTrieMap<
        TOIMPk,
        TOIMEntitySlot<TEntity, TOIMKeyPath>
    >;

    constructor(keyDomain: OIMKeyDomainTrie = new OIMKeyDomainTrie()) {
        super();
        this.keyDomain = keyDomain;
        this.slots = new OIMTrieMap();
        this.reservedSlots = new OIMTrieMap();
    }

    setOneByPk(
        pk: TOIMKeyPath,
        entity: TEntity
    ): TOIMEntitySlot<TEntity, TOIMKeyPath> {
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
        // Intern the PK so `slot.pk` is one canonical reference per logical key.
        const nextSlot = {
            pk: this.keyDomain.canonicalize(pk),
            item: entity,
        };
        this.slots.set(pk, nextSlot);
        return nextSlot;
    }

    getOrReserveSlotByPk(
        pk: TOIMKeyPath
    ): TOIMEntitySlot<TEntity, TOIMKeyPath> {
        const slot = this.slots.get(pk);
        if (slot) return slot;
        let reserved = this.reservedSlots.get(pk);
        if (!reserved) {
            reserved = { pk: this.keyDomain.canonicalize(pk), item: undefined };
            this.reservedSlots.set(pk, reserved);
        }
        return reserved;
    }

    setManyByPks(
        pks: readonly TOIMKeyPath[],
        entities: TEntity[]
    ): TOIMEntitySlot<TEntity, TOIMKeyPath>[] {
        const slots: TOIMEntitySlot<TEntity, TOIMKeyPath>[] = [];
        slots.length = pks.length;
        for (let i = 0; i < pks.length; i++) {
            slots[i] = this.setOneByPk(pks[i], entities[i]);
        }
        return slots;
    }

    getSlotByPk(
        pk: TOIMKeyPath
    ): TOIMEntitySlot<TEntity, TOIMKeyPath> | undefined {
        return this.slots.get(pk);
    }

    findSlotByPk(
        pk: TOIMKeyPath
    ): TOIMEntitySlot<TEntity, TOIMKeyPath> | undefined {
        return this.slots.get(pk) ?? this.reservedSlots.get(pk);
    }

    private hasSubscribers(
        slot: TOIMEntitySlot<TEntity, TOIMKeyPath>
    ): boolean {
        return slot.subscribers !== undefined && slot.subscribers.size > 0;
    }

    getSlotsByPks(
        pks: readonly TOIMKeyPath[]
    ): TOIMEntitySlot<TEntity, TOIMKeyPath>[] {
        const result: TOIMEntitySlot<TEntity, TOIMKeyPath>[] = [];
        result.length = pks.length;
        let writeIndex = 0;
        for (let i = 0; i < pks.length; i++) {
            const slot = this.slots.get(pks[i]);
            if (slot !== undefined) result[writeIndex++] = slot;
        }
        result.length = writeIndex;
        return result;
    }

    getAllSlots(): TOIMEntitySlot<TEntity, TOIMKeyPath>[] {
        return Array.from(this.slots.values());
    }

    removeOneByPk(pk: TOIMKeyPath): void {
        const slot = this.slots.get(pk);
        if (slot) {
            slot.item = undefined;
            this.slots.delete(pk);
            if (this.hasSubscribers(slot)) {
                this.reservedSlots.set(pk, slot);
            }
            return;
        }
        const reserved = this.reservedSlots.get(pk);
        if (reserved) {
            reserved.item = undefined;
            if (!this.hasSubscribers(reserved)) {
                this.reservedSlots.delete(pk);
            }
        }
    }

    removeManyByPks(pks: readonly TOIMKeyPath[]): void {
        for (const pk of pks) this.removeOneByPk(pk);
    }

    getOneByPk(pk: TOIMKeyPath): TEntity | undefined {
        return this.slots.get(pk)?.item;
    }

    getManyByPks(pks: readonly TOIMKeyPath[]): TEntity[] {
        const result: TEntity[] = [];
        result.length = pks.length;
        let writeIndex = 0;
        for (let i = 0; i < pks.length; i++) {
            const entity = this.getOneByPk(pks[i]);
            if (entity !== undefined) result[writeIndex++] = entity;
        }
        result.length = writeIndex;
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
        const retained: TOIMEntitySlot<TEntity, TOIMKeyPath>[] = [];
        for (const slot of this.slots.values()) {
            slot.item = undefined;
            if (this.hasSubscribers(slot)) retained.push(slot);
        }
        this.slots.clear();
        for (const slot of this.reservedSlots.values()) {
            slot.item = undefined;
            if (this.hasSubscribers(slot)) retained.push(slot);
        }
        this.reservedSlots.clear();
        for (const slot of retained) {
            this.reservedSlots.set(slot.pk, slot);
        }
    }

    getAllPks(): TOIMKeyPath[] {
        return Array.from(this.slots.keys());
    }

    destroy(): void {
        this.clear();
        for (const slot of this.reservedSlots.values()) {
            slot.subscribers?.clear();
            slot.subscribers = undefined;
        }
        this.reservedSlots.clear();
    }
}
