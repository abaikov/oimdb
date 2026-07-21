import type { IOIMExodraReadableCollection } from './interfaces/IOIMExodraReadableCollection';
import type { IOIMExodraSetBasedIndex } from './interfaces/IOIMExodraSetBasedIndex';

/** Read the entities of a set-based index for one key. Missing entities are dropped (compact). */
export function readEntitiesByIndexKey<TEntity, TPk, TKey>(
    collection: IOIMExodraReadableCollection<TEntity, TPk>,
    index: IOIMExodraSetBasedIndex<TKey, TPk>,
    key: TKey
): TEntity[] {
    return collection.getManyByPks(Array.from(index.getPksByKey(key)));
}
