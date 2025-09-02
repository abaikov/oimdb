import { TOIMPk } from '../types/TOIMPk';

export abstract class OIMCollectionStore<TEntity extends object, TPk extends TOIMPk> {
    abstract setOneByPk(pk: TPk, entity: TEntity): void;

    abstract removeOneByPk(pk: TPk): void;

    abstract removeManyByPks(pks: readonly TPk[]): void;

    abstract getOneByPk(pk: TPk): TEntity | undefined;

    abstract getManyByPks(pks: readonly TPk[]): Map<TPk, TEntity | undefined>;
}
