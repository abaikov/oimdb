import { TOIMKey } from '../types/TOIMKey';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import { IOIMKeyDomain } from '../interfaces/IOIMKeyDomain';

export abstract class OIMCollectionStore<
    TEntity extends object,
    TPk extends TOIMKey,
> {
    /**
     * The keying strategy for this store's PKs. Every PK-keyed structure built
     * off a collection (indexes, wrappers) reads it so the whole engine keys PKs
     * the same way — native `Map` for primitives, trie for composite paths.
     */
    abstract get keyDomain(): IOIMKeyDomain<TPk>;

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

    abstract getManyByPks(pks: readonly TPk[]): TEntity[];

    abstract getAll(): TEntity[];

    abstract getAllPks(): TPk[];

    abstract countAll(): number;

    abstract clear(): void;

    abstract destroy(): void;
}
