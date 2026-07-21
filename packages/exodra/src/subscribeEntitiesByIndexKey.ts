import type { IOIMExodraReadableCollection } from './interfaces/IOIMExodraReadableCollection';
import type { IOIMExodraSetBasedIndex } from './interfaces/IOIMExodraSetBasedIndex';

/**
 * Fine-grained subscription for the entities of a set-based index key. It subscribes to the index
 * key (membership) AND to every pk currently in the set (per-entity), re-subscribing to the pks
 * whenever membership changes — so only the genuinely affected list re-reads, not the whole
 * collection (this replaces the `subscribeOnAnyUpdate` firehose of the inline bridge).
 */
export function subscribeEntitiesByIndexKey<TEntity, TPk, TKey>(
    collection: IOIMExodraReadableCollection<TEntity, TPk>,
    index: IOIMExodraSetBasedIndex<TKey, TPk>,
    key: TKey,
    onChange: () => void
): () => void {
    const readPks = () => Array.from(index.getPksByKey(key));

    let unsubscribeFromCollection = collection.subscribeOnKeys(readPks(), onChange);

    const unsubscribeFromIndex = index.subscribeOnKey(key, () => {
        unsubscribeFromCollection();
        unsubscribeFromCollection = collection.subscribeOnKeys(readPks(), onChange);
        onChange();
    });

    return () => {
        unsubscribeFromIndex();
        unsubscribeFromCollection();
    };
}
