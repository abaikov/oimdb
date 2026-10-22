export type TOIMFactoryOptions<TClassOptions, TFilledByDb extends PropertyKey, TDefaulted extends PropertyKey> =
    Omit<TClassOptions, TFilledByDb | TDefaulted>
    & { [TName in TDefaulted & keyof TClassOptions]?: TClassOptions[TName] | undefined };
