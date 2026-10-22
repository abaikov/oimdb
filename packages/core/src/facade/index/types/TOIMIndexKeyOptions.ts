import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMIndexKey } from './TOIMIndexKey';

export type TOIMIndexKeyOptions<
    TKey, TEntity extends object,
    TColumns extends readonly TOIMEntityColumnName<TEntity>[] = readonly TOIMEntityColumnName<TEntity>[],
> = {
    keyOf: (entity: TEntity) => TKey;
    columns?: TColumns;
} | {
    keyOf?: undefined;
    columns: [TKey] extends [never] ? never : [TKey] extends [TOIMIndexKey<TEntity, TColumns>] ? TColumns : never;
};
