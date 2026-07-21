import type { IOIMExodraSetBasedIndex } from './interfaces/IOIMExodraSetBasedIndex';

/** Subscribe to the membership of a set-based index for one key. Re-read via `readPksByIndexKey`. */
export function subscribePksByIndexKey<TKey, TPk>(
    index: IOIMExodraSetBasedIndex<TKey, TPk>,
    key: TKey,
    onChange: () => void
): () => void {
    return index.subscribeOnKey(key, onChange);
}
