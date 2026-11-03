export type TOIMColumnName<TValue> =
    [TValue] extends [never] ? never
        : TValue extends object ? object extends TValue ? string : keyof TValue & string
            : never;
