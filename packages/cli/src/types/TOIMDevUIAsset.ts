/** `fileName` is a literal from the catalog's table, never from a request. */
export type TOIMDevUIAsset = {
    readonly fileName: string;
    readonly contentType: string;
};
