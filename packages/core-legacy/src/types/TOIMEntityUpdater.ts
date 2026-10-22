export type TOIMEntityUpdater<TEntity extends object> = (
    draft: Partial<TEntity>,
    prevEntity: TEntity
) => TEntity;
