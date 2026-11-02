export type TOIMSlotContentChangeListenerReadColumns = {
    readonly declaredColumnNames: readonly string[] | undefined;
    readonly addedColumnNames: Set<string>;
    isAnyColumnAdded: boolean;
};
