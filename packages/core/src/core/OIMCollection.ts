import { TOIMKey } from '../types/TOIMKey';
import { TOIMCollectionOptions } from '../types/TOIMCollectionOptions';
import { TOIMPkSelector } from '../types/TOIMPkSelector';
import { OIMPkSelectorFactory } from './OIMPkSelectorFactory';
import { OIMCollectionStoreMapDriven } from './OIMCollectionStoreMapDriven';
import { OIMCollectionStore } from '../abstract/OIMCollectionStore';
import { TOIMEntityUpdater } from '../types/TOIMEntityUpdater';
import { OIMSlotWriter } from './OIMSlotWriter';
import { OIMFieldMaskRegistry } from './OIMFieldMaskRegistry';
import { OIMEntityUpdaterFactory } from './OIMEntityUpdaterFactory';
import { OIMEventEmitter } from './OIMEventEmitter';
import { EOIMCollectionEventType } from '../enums/EOIMCollectionEventType';
import { TOIMCollectionUpdatePayload } from '../types/TOIMCollectionUpdatePayload';
import { TOIMEntitySlot } from '../types/TOIMEntitySlot';

/** It's like a store - but with event emitter */
export class OIMCollection<TEntity extends object, TPk extends TOIMKey> {
    public readonly batchEmitter = new OIMEventEmitter<{
        [EOIMCollectionEventType.UPDATE]: TOIMCollectionUpdatePayload<TPk>;
    }>();
    public readonly selectPk: TOIMPkSelector<TEntity, TPk>;
    protected readonly store: OIMCollectionStore<TEntity, TPk>;
    protected readonly updateEntity: TOIMEntityUpdater<TEntity>;
    /**
     * How a write lands on a slot. The default merges and reports every write as
     * publishable — exactly the historical behaviour. `OIMSlotWriterFieldMasked`
     * additionally compares values, so a write that changes nothing is not
     * published at all.
     */
    protected readonly slotWriter: OIMSlotWriter<TEntity, TPk>;
    /**
     * Field identity, present only when this collection's writer tracks fields.
     * Indexes and subscribers read it to turn field NAMES into the same bits the
     * writer records, so declarations on both sides cannot drift apart. Absent on
     * a plain collection, which is what makes "you asked for field deps on a
     * collection that does not track fields" a detectable mistake rather than a
     * silent no-op.
     */
    public readonly fields?: OIMFieldMaskRegistry;

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
        this.slotWriter =
            opts?.slotWriter ??
            new OIMSlotWriter<TEntity, TPk>(this.updateEntity);
        this.fields = this.slotWriter.fields;
    }

    getOneByPk(pk: TPk): TEntity | undefined {
        return this.store.getOneByPk(pk);
    }

    /** Length-aligned with `pks`; `undefined` wherever a pk has no entity. */
    getManyByPks(pks: readonly TPk[]): (TEntity | undefined)[] {
        return this.store.getManyByPks(pks);
    }

    /** Holes filtered out — may be SHORTER than `pks`. Deliberate; see the store's docs. */
    getManyByPksCompact(pks: readonly TPk[]): TEntity[] {
        return this.store.getManyByPksCompact(pks);
    }

    getSlotByPk(pk: TPk): TOIMEntitySlot<TEntity, TPk> | undefined {
        return this.store.getSlotByPk(pk);
    }

    getOrReserveSlotByPk(pk: TPk): TOIMEntitySlot<TEntity, TPk> {
        return this.store.getOrReserveSlotByPk(pk);
    }

    /**
     * The existing slot for `pk` (live or reserved) WITHOUT creating one — used
     * by indexes to resolve a pk to its canonical slot for removal (delete by
     * reference), with no side effect for a pk that is not present.
     */
    findSlotByPk(pk: TPk): TOIMEntitySlot<TEntity, TPk> | undefined {
        return this.store.findSlotByPk(pk);
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
        this.batchEmitter.emit(EOIMCollectionEventType.UPDATE, { pks: [pk] });
        return slot;
    }

    upsertOne(entity: TEntity | Partial<TEntity>): TOIMEntitySlot<TEntity, TPk> {
        const slot = this.upsertOneWithoutNotifications(entity);
        this.batchEmitter.emit(EOIMCollectionEventType.UPDATE, { pks: [slot.pk] });
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
        this.batchEmitter.emit(EOIMCollectionEventType.UPDATE, { pks });
        return slots;
    }

    removeOne(entity: TEntity): void {
        const pk = this.selectPk(entity);
        this.store.removeOneByPk(pk);
        this.batchEmitter.emit(EOIMCollectionEventType.UPDATE, { pks: [pk] });
    }

    removeMany(entities: TEntity[]): void {
        if (entities.length === 0) return;

        const pks = entities.map(this.selectPk);
        this.store.removeManyByPks(pks);
        this.batchEmitter.emit(EOIMCollectionEventType.UPDATE, { pks });
    }

    removeOneByPk(pk: TPk): void {
        this.store.removeOneByPk(pk);
        this.batchEmitter.emit(EOIMCollectionEventType.UPDATE, { pks: [pk] });
    }

    removeManyByPks(pks: readonly TPk[]): void {
        if (pks.length === 0) return;

        this.store.removeManyByPks(pks);
        this.batchEmitter.emit(EOIMCollectionEventType.UPDATE, { pks });
    }

    clear(): void {
        // Capture the present keys BEFORE clearing so the UPDATE event reports
        // exactly which keys changed (they all get removed). The event never
        // carries an empty `pks` to mean "reset" — an empty array would mean
        // "nothing changed", which is indistinguishable to consumers that need
        // to know what was removed (snapshot/persist/derived). Clearing an
        // already-empty collection is a no-op and emits nothing.
        const pks = this.store.getAllPks();
        this.store.clear();
        if (pks.length > 0) {
            this.batchEmitter.emit(EOIMCollectionEventType.UPDATE, { pks });
        }
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
            // The writer both merges and decides whether this write is worth
            // publishing; `false` means it changed nothing, and the reactive
            // subclass skips notification entirely.
            slot.published = this.slotWriter.write(slot, entity);
            return slot;
        }
        return this.store.setOneByPk(pk, entity as TEntity);
    }

    public destroy(): void {
        this.store.destroy();
        this.batchEmitter.offAll();
    }
}
