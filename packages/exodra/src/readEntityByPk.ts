import type { IOIMExodraReadableCollection } from './interfaces/IOIMExodraReadableCollection';

/** Read one entity by primary key. Low-level, drop-in for the app's `oimdb-bind.ts` reader. */
export function readEntityByPk<TEntity, TPk>(
    collection: IOIMExodraReadableCollection<TEntity, TPk>,
    pk: TPk
): TEntity | undefined {
    return collection.getOneByPk(pk);
}
