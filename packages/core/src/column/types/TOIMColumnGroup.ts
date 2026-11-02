export type TOIMColumnGroup<TColumnName extends string = string> = {
    readonly key: string;
    readonly columnNames: readonly TColumnName[];
};
