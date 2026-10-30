export type TOIMSortableColumnName<TEntity extends object> = {
    [TColumn in keyof TEntity]-?: NonNullable<TEntity[TColumn]> extends string | number | bigint ? TColumn : never;
}[keyof TEntity] & string;
