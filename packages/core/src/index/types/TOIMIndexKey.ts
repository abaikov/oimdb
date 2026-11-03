import type { TOIMColumnName } from '../../column/types/TOIMColumnName';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';

export type TOIMIndexKey<TEntity extends object, TColumns extends readonly TOIMColumnName<TEntity>[]> =
    TColumns extends readonly [] ? never
        : TColumns extends readonly [infer TColumn]
            ? (TColumn extends keyof TEntity ? Extract<NonNullable<TEntity[TColumn]>, TOIMStoreKey> : TOIMStoreKey)
            : number extends TColumns['length'] ? TOIMStoreKey | readonly unknown[]
                : {
                    readonly [TPosition in keyof TColumns]:
                    TColumns[TPosition] extends keyof TEntity ? TEntity[TColumns[TPosition]] : unknown;
                };
