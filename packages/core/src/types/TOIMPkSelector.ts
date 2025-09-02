import { TOIMPk } from './TOIMPk';

export type TOIMPkSelector<TEntity extends object, TPk extends TOIMPk> = (
    entity: TEntity
) => TPk;
