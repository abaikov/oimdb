import { TOIMKey } from '../types/TOIMKey';
import { TOIMEntitySlot } from '../types/TOIMEntitySlot';

export abstract class OIMCollectionStore<
    TEntity extends object,
    TPk extends TOIMKey,
> {
    abstract setOneByPk(
        pk: TPk,
        entity: TEntity
    ): TOIMEntitySlot<TEntity, TPk>;

    abstract getSlotByPk(
        pk: TPk
    ): TOIMEntitySlot<TEntity, TPk> | undefined;

    /**
     * Returns the canonical slot for `pk`, creating a reserved empty slot
     * (`item: undefined`) if no entity exists yet. The reserved slot is a stable
     * reference that fills in when the entity is later written, so indexes can
     * hold it ahead of the entity's arrival without crashing.
     */
    abstract getOrReserveSlotByPk(
        pk: TPk
    ): TOIMEntitySlot<TEntity, TPk>;

    /**
     * Returns the existing slot for `pk` (live or reserved) without creating
     * one. Used by the slot-based emitter to resolve a slot for delivery /
     * unsubscribe without side effects.
     */
    abstract findSlotByPk(
        pk: TPk
    ): TOIMEntitySlot<TEntity, TPk> | undefined;

    abstract getSlotsByPks(
        pks: readonly TPk[]
    ): TOIMEntitySlot<TEntity, TPk>[];

    abstract getAllSlots(): TOIMEntitySlot<TEntity, TPk>[];

    abstract removeOneByPk(pk: TPk): void;

    abstract removeManyByPks(pks: readonly TPk[]): void;

    abstract getOneByPk(pk: TPk): TEntity | undefined;

    /**
     * Length-aligned with `pks`: `undefined` wherever a pk has no entity. A missing entity is a real
     * state of the store, so the read surfaces it instead of deciding for the caller — the same
     * contract as {@link OIMIndex.getEntitiesByKey} and every selector.
     */
    abstract getManyByPks(pks: readonly TPk[]): (TEntity | undefined)[];

    /**
     * The same read with holes filtered out, so the result may be SHORTER than `pks`. Deliberate and
     * separately named: silently swallowing a missing entity is exactly what makes torn state hard to
     * find. Safe when the pks come from a derived index (dense by construction).
     */
    abstract getManyByPksCompact(pks: readonly TPk[]): TEntity[];

    abstract getAll(): TEntity[];

    abstract getAllPks(): TPk[];

    abstract countAll(): number;

    abstract clear(): void;

    abstract destroy(): void;
}
