import type { IOIMExodraSetBasedIndex } from './interfaces/IOIMExodraSetBasedIndex';

/** Read the primary keys of a set-based index for one key, as an array. */
export function readPksByIndexKey<TKey, TPk>(
    index: IOIMExodraSetBasedIndex<TKey, TPk>,
    key: TKey
): TPk[] {
    return Array.from(index.getPksByKey(key));
}
