/**
 * Structural read+subscribe surface of a reactive collection the low-level bridge functions need.
 * `OIMReactiveCollection` from `@oimdb/core` satisfies it; keeping it structural means the
 * find-replace migration helpers do not force a hard class dependency at the call site.
 */
export interface IOIMExodraReadableCollection<TEntity, TPk> {
    getOneByPk(pk: TPk): TEntity | undefined;
    getManyByPks(pks: readonly TPk[]): TEntity[];
    subscribeOnKey(pk: TPk, handler: () => void): () => void;
    subscribeOnKeys(pks: readonly TPk[], handler: () => void): () => void;
}
