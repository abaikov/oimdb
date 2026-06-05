export interface IOIMDevIndexLike {
    // Accept readonly arrays so oimdb's own indexes (`getKeys(): readonly TKey[]`)
    // satisfy this directly, without forcing adapter wrappers at the call site.
    getKeys(): readonly unknown[];
}
