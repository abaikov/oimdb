export type TOIMComparator<TEntity extends object> = (
    a: TEntity,
    b: TEntity
) => boolean;
