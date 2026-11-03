import type { TOIMColumnName } from '../../column/types/TOIMColumnName';
import type { TOIMIndexKey } from './TOIMIndexKey';

export type TOIMIndexKeyOptions<
    TKey, TEntity extends object,
    TColumns extends readonly TOIMColumnName<TEntity>[] = readonly TOIMColumnName<TEntity>[],
> = {
    selectKey: (entity: TEntity) => TKey;
    columns?: TColumns;
} | {
    selectKey?: undefined;
    columns: [TKey] extends [never] ? never : [TKey] extends [TOIMIndexKey<TEntity, TColumns>] ? TColumns : never;
};
