export type TOIMEntityColumnName<TEntity extends object> =
    [TEntity] extends [never] ? never
        : object extends TEntity ? string : keyof TEntity & string;