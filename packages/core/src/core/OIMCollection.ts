import { TOIMKey } from '../types/TOIMKey';
import { TOIMCollectionOptions } from '../types/TOIMCollectionOptions';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMPkSelector } from '../types/TOIMPkSelector';
import { OIMPkSelectorFactory } from './OIMPkSelectorFactory';
import { OIMCollectionStoreMapDriven } from './OIMCollectionStoreMapDriven';
import { OIMCollectionStore } from '../abstract/OIMCollectionStore';
import { TOIMEntityUpdater } from '../types/TOIMEntityUpdater';
import { OIMEntityUpdaterFactory } from './OIMEntityUpdaterFactory';
import { OIMEventEmitter } from './OIMEventEmitter';
import { EOIMCollectionEventType } from '../enums/EOIMCollectionEventType';
import { TOIMCollectionUpdatePayload } from '../types/TOIMCollectionUpdatePayload';
import { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import { IOIMKeyDomain } from '../interfaces/IOIMKeyDomain';

/** It's like a store - but with event emitter */
export class OIMCollection<TEntity extends object, TPk extends TOIMKey> {
    public readonly emitter = new OIMEventEmitter<{
        [EOIMCollectionEventType.UPDATE]: TOIMCollectionUpdatePayload<TPk>;
    }>();
    public readonly selectPk: TOIMPkSelector<TEntity, TPk>;
    protected readonly store: OIMCollectionStore<TEntity, TPk>;
    protected readonly updateEntity: TOIMEntityUpdater<TEntity>;

    /** The collection's PK keying strategy — read by indexes and wrappers. */
    public get keyDomain(): IOIMKeyDomain<TPk> {
        return this.store.keyDomain;
    }

    constructor(opts?: TOIMCollectionOptions<TEntity, TPk>) {
        this.selectPk = (opts?.selectPk ??
            new OIMPkSelectorFactory<
                TEntity & { id: TPk },
                TPk
            >().createIdSelector()) as TOIMPkSelector<TEntity, TPk>;
        this.store =
            opts?.store ?? new OIMCollectionStoreMapDriven<TEntity, TPk>();
        this.updateEntity =
            opts?.updateEntity ??
            new OIMEntityUpdaterFactory<TEntity>().createMergeEntityUpdater();
    }

    getOneByPk(pk: TPk): TEntity | undefined {
        return this.store.getOneByPk(pk);
    }

    getManyByPks(pks: readonly TPk[]): TEntity[] {
        return this.store.getManyByPks(pks);
    }

    getSlotByPk(pk: TPk): TOIMEntitySlot<TEntity, TPk> | undefined {
        return this.store.getSlotByPk(pk);
    }

    getOrReserveSlotByPk(pk: TPk): TOIMEntitySlot<TEntity, TPk> {
        return this.store.getOrReserveSlotByPk(pk);
    }

    getSlotsByPks(pks: readonly TPk[]): TOIMEntitySlot<TEntity, TPk>[] {
        return this.store.getSlotsByPks(pks);
    }

    getAllSlots(): TOIMEntitySlot<TEntity, TPk>[] {
        return this.store.getAllSlots();
    }

    upsertOneByPk(
        pk: TPk,
        entity: Partial<TEntity>
    ): TOIMEntitySlot<TEntity, TPk> {
        const slot = this.upsertOneWithoutNotificationsByPk(pk, entity);
        this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks: [pk] });
        return slot;
    }

    upsertOne(entity: TEntity | Partial<TEntity>): TOIMEntitySlot<TEntity, TPk> {
        const slot = this.upsertOneWithoutNotifications(entity);
        this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks: [slot.pk] });
        return slot;
    }

    upsertMany(
        entities: (TEntity | Partial<TEntity>)[]
    ): TOIMEntitySlot<TEntity, TPk>[] {
        if (entities.length === 0) return [];

        const slots = entities.map(entity =>
            this.upsertOneWithoutNotifications(entity)
        );
        const pks = slots.map(slot => slot.pk);
        this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks });
        return slots;
    }

    removeOne(entity: TEntity): void {
        const pk = this.selectPk(entity);
        this.store.removeOneByPk(pk);
        this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks: [pk] });
    }

    removeMany(entities: TEntity[]): void {
        if (entities.length === 0) return;

        const pks = entities.map(this.selectPk);
        this.store.removeManyByPks(pks);
        this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks });
    }

    removeOneByPk(pk: TPk): void {
        this.store.removeOneByPk(pk);
        this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks: [pk] });
    }

    removeManyByPks(pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        this.store.removeManyByPks(pks);
        this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks });
    }

    clear(): void {
        this.store.clear();
        this.emitter.emit(EOIMCollectionEventType.UPDATE, { pks: [] });
    }

    countAll(): number {
        return this.store.countAll();
    }

    getAll(): TEntity[] {
        return this.store.getAll();
    }

    getAllPks(): TPk[] {
        return this.store.getAllPks();
    }

    protected upsertOneWithoutNotifications(
        entity: TEntity | Partial<TEntity>
    ): TOIMEntitySlot<TEntity, TPk> {
        const pk = this.selectPk(entity as TEntity);
        return this.upsertOneWithoutNotificationsByPk(pk, entity);
    }

    protected upsertOneWithoutNotificationsByPk(
        pk: TPk,
        entity: Partial<TEntity> | TEntity
    ): TOIMEntitySlot<TEntity, TPk> {
        if (!pk) {
            throw new Error(
                `[OIMCollection]: PK is required to upsert an entity ${JSON.stringify(entity)}`
            );
        }
        // Resolve the live slot once and merge in place on a hit. This avoids a
        // second store lookup inside `setOneByPk` — for a composite (trie) PK
        // that halves the per-upsert trie walks; for a primitive PK it drops one
        // `Map.get`. The miss/reserved path still goes through `setOneByPk`,
        // which promotes a reserved slot as before.
        const slot = this.store.getSlotByPk(pk);
        if (slot !== undefined && slot.item !== undefined) {
            slot.item = this.updateEntity(entity, slot.item);
            return slot;
        }
        return this.store.setOneByPk(pk, entity as TEntity);
    }

    public destroy(): void {
        this.store.destroy();
        this.emitter.offAll();
    }
}
