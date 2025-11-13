import {
    OIMReactiveCollection,
    OIMReactiveIndexSetBased,
    OIMReactiveIndexArrayBased,
    OIMIndexSetBased,
    OIMIndexArrayBased,
    TOIMPk,
} from '@oimdb/core';
import { TOIMDefaultCollectionState } from '../types/TOIMDefaultCollectionState';
import { TOIMDefaultIndexState } from '../types/TOIMDefaultIndexState';

/**
 * Default mapper for collections (RTK Entity Adapter style)
 * Creates state with entities and ids arrays
 */
export function defaultCollectionMapper<
    TEntity extends object,
    TPk extends TOIMPk,
>(
    collection: OIMReactiveCollection<TEntity, TPk>,
    updatedKeys: Set<TPk>,
    currentState?: TOIMDefaultCollectionState<TEntity, TPk>
): TOIMDefaultCollectionState<TEntity, TPk> {
    // If no current state, initialize from all entities
    if (!currentState) {
        const allPks = collection.getAllPks();
        const pkCount = allPks.length;
        const entities: Record<TPk, TEntity> = Object.create(null) as Record<
            TPk,
            TEntity
        >;
        const ids: TPk[] = [];
        ids.length = pkCount; // Pre-size array

        let writeIndex = 0;
        for (let i = 0; i < pkCount; i++) {
            const pk = allPks[i];
            const entity = collection.getOneByPk(pk);
            if (entity) {
                entities[pk] = entity;
                ids[writeIndex++] = pk;
            }
        }
        ids.length = writeIndex; // Trim to actual size

        return { entities, ids };
    }

    // Update only changed entities
    // Use Object.assign for better performance on large objects
    const newEntities = Object.assign({}, currentState.entities);
    const updatedKeysArray = Array.from(updatedKeys);
    const updatedKeysLength = updatedKeysArray.length;

    // Track which ids to add/remove efficiently
    const idsToAdd = new Set<TPk>();
    const idsToRemove = new Set<TPk>();

    for (let i = 0; i < updatedKeysLength; i++) {
        const pk = updatedKeysArray[i];
        const entity = collection.getOneByPk(pk);
        if (entity) {
            newEntities[pk] = entity;
            // Only add if it wasn't in the original state
            if (!currentState.entities[pk]) {
                idsToAdd.add(pk);
            }
        } else {
            // Entity was deleted - mark for removal
            delete newEntities[pk];
            if (currentState.entities[pk]) {
                idsToRemove.add(pk);
            }
        }
    }

    // Build new ids array efficiently - single pass
    const currentIds = currentState.ids;
    const currentIdsLength = currentIds.length;
    const newIds: TPk[] = [];
    // Pre-size: current length + additions (worst case, removals handled in loop)
    newIds.length = currentIdsLength + idsToAdd.size;

    let writeIndex = 0;
    // Copy existing ids, skipping removed ones
    for (let i = 0; i < currentIdsLength; i++) {
        const id = currentIds[i];
        if (!idsToRemove.has(id)) {
            newIds[writeIndex++] = id;
        }
    }
    // Add new ids
    const idsToAddArray = Array.from(idsToAdd);
    const idsToAddLength = idsToAddArray.length;
    for (let i = 0; i < idsToAddLength; i++) {
        newIds[writeIndex++] = idsToAddArray[i];
    }
    newIds.length = writeIndex; // Trim to actual size

    return {
        entities: newEntities,
        ids: newIds,
    };
}

/**
 * Default mapper for indexes
 * Creates state with entities containing id and ids arrays
 */
export function defaultIndexMapper<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
>(
    index:
        | OIMReactiveIndexSetBased<
              TIndexKey,
              TPk,
              OIMIndexSetBased<TIndexKey, TPk>
          >
        | OIMReactiveIndexArrayBased<
              TIndexKey,
              TPk,
              OIMIndexArrayBased<TIndexKey, TPk>
          >,
    updatedKeys: Set<TIndexKey>,
    currentState?: TOIMDefaultIndexState<TIndexKey, TPk>
): TOIMDefaultIndexState<TIndexKey, TPk> {
    // If no current state, initialize from all keys
    if (!currentState) {
        const allKeys = index.getKeys();
        const keysLength = allKeys.length;
        const entities: Record<TIndexKey, { id: TIndexKey; ids: TPk[] }> =
            Object.create(null) as Record<
                TIndexKey,
                { id: TIndexKey; ids: TPk[] }
            >;

        for (let i = 0; i < keysLength; i++) {
            const key = allKeys[i];
            const pks = index.getPksByKey(key);
            const ids = pks instanceof Set ? Array.from(pks) : pks;
            entities[key] = { id: key, ids };
        }

        return { entities };
    }

    // Update only changed keys
    // Use Object.assign for better performance on large objects
    const newEntities = Object.assign({}, currentState.entities);
    const updatedKeysArray = Array.from(updatedKeys);
    const updatedKeysLength = updatedKeysArray.length;

    for (let i = 0; i < updatedKeysLength; i++) {
        const key = updatedKeysArray[i];
        const pks = index.getPksByKey(key);
        const ids = pks instanceof Set ? Array.from(pks) : pks;
        newEntities[key] = { id: key, ids };
    }

    return { entities: newEntities };
}
