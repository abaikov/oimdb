import type { IOIMExodraReadableCollection } from './interfaces/IOIMExodraReadableCollection';

/** Subscribe to one entity by primary key. The handler re-reads via `readEntityByPk`. */
export function subscribeEntityByPk<TEntity, TPk>(
    collection: IOIMExodraReadableCollection<TEntity, TPk>,
    pk: TPk,
    onChange: () => void
): () => void {
    return collection.subscribeOnKey(pk, onChange);
}
