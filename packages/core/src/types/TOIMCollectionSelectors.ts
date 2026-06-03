import type { OIMSelector } from '../modules/selector/core/OIMSelector';

export type TOIMCollectionEntitySelector<TEntity extends object> = OIMSelector<
    TEntity | undefined
>;

export type TOIMCollectionEntitiesSelector<TEntity extends object> =
    OIMSelector<readonly (TEntity | undefined)[]>;
