import { TOIMPk } from '../types/TOIMPk';
import { TOIMEntitySlot } from '../types/TOIMEntitySlot';

export abstract class OIMCollectionStore<
    TEntity extends object,
    TPk extends TOIMPk,
> {
    abstract setOneByPk(
        pk: TPk,
        entity: TEntity
    ): TOIMEntitySlot<TEntity, TPk>;

    abstract getSlotByPk(
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
