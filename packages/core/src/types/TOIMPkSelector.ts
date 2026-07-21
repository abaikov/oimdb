import { TOIMKey } from './TOIMKey';

export type TOIMPkSelector<TEntity extends object, TPk extends TOIMKey> = (
    entity: TEntity
) => TPk;
