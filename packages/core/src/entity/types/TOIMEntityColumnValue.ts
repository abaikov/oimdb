export type TOIMEntityColumnValue<TEntity extends object, TColumnName> =
    object extends TEntity
        ? unknown
        : TColumnName extends keyof TEntity ? TEntity[TColumnName] : never;