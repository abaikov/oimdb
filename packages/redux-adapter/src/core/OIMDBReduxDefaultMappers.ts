import {
    OIMReactiveCollection,
    OIMReactiveIndexSetBased,
    OIMReactiveIndexArrayBased,
    OIMIndexSetBased,
    OIMIndexArrayBased,
    TOIMKey,
    IOIMPkCodec,
} from '@oimdb/core';
import { TOIMDBReduxDefaultCollectionState } from '../types/TOIMDBReduxDefaultCollectionState';
import { TOIMDBReduxDefaultIndexState } from '../types/TOIMDBReduxDefaultIndexState';
import { TOIMDBReduxDefaultGlobalIndexState } from '../types/TOIMDBReduxDefaultGlobalIndexState';
import { TOIMDBReduxGlobalIndex } from '../types/TOIMDBReduxGlobalIndex';
import { TOIMReduxKey } from '../types/TOIMReduxKey';
import { TOIMDBReduxCollectionMapper } from '../types/TOIMDBReduxCollectionMapper';
import { TOIMDBReduxIndexMapper } from '../types/TOIMDBReduxIndexMapper';

/**
 * Redux state object key for an OIMDB key/PK: the primitive value as-is, or the
 * `IOIMPkCodec`-encoded string for a composite key path.
 */
function toReduxKey<T extends TOIMKey>(
    key: T,
    codec?: IOIMPkCodec<T>
): TOIMReduxKey<T> {
    return (codec ? codec.encode(key) : key) as TOIMReduxKey<T>;
}

/** Reads a Global index's pks as a fresh array regardless of its shape. */
export function globalIndexPksToArray<TPk extends TOIMKey>(
    index: TOIMDBReduxGlobalIndex<TPk>
): TPk[] {
    const pks = index.getPks();
    return pks instanceof Set ? Array.from(pks) : pks;
}

/**
 * Default mapper for collections (RTK Entity Adapter style)
 * Creates state with entities and ids arrays
 */
export function defaultCollectionMapper<
    TEntity extends object,
    TPk extends TOIMKey,
>(
    collection: OIMReactiveCollection<TEntity, TPk>,
    updatedKeys: Set<TPk>,
    currentState?: TOIMDBReduxDefaultCollectionState<TEntity, TPk>,
    // For a composite PK: encodes each PK to the string `entities` key. Omit for
    // primitive PKs (used directly, byte-identical to before).
    pkCodec?: IOIMPkCodec<TPk>
): TOIMDBReduxDefaultCollectionState<TEntity, TPk> {
    type TKey = TOIMReduxKey<TPk>;
    // If no current state, initialize from all entities
    if (!currentState) {
        const allPks = collection.getAllPks();
        const pkCount = allPks.length;
        const entities: Record<TKey, TEntity> = Object.create(
            null
        ) as Record<TKey, TEntity>;
        const ids: TPk[] = [];

        for (let i = 0; i < pkCount; i++) {
            const pk = allPks[i];
            const entity = collection.getOneByPk(pk);
            if (entity) {
                entities[toReduxKey(pk, pkCodec)] = entity;
                ids.push(pk);
            }
        }

        return { entities, ids };
    }

    // Update only changed entities
    const newEntities = Object.assign({}, currentState.entities) as Record<
        TKey,
        TEntity
    >;
    // Track removed/added by the string key so composite PKs diff by content.
    const removedKeys = new Set<TKey>();
    const addedPks: TPk[] = [];

    for (const pk of updatedKeys) {
        const key = toReduxKey(pk, pkCodec);
        const entity = collection.getOneByPk(pk);
        if (entity) {
            // Add to ids only if it wasn't already present.
            if (!(key in newEntities)) addedPks.push(pk);
            newEntities[key] = entity;
        } else if (key in newEntities) {
            delete newEntities[key];
            removedKeys.add(key);
        }
    }

    const currentIds = currentState.ids;
    const newIds: TPk[] = [];
    for (let i = 0; i < currentIds.length; i++) {
        const id = currentIds[i];
        if (!removedKeys.has(toReduxKey(id, pkCodec))) newIds.push(id);
    }
    for (let i = 0; i < addedPks.length; i++) newIds.push(addedPks[i]);

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
    TIndexKey extends TOIMKey,
    TPk extends TOIMKey,
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
    currentState?: TOIMDBReduxDefaultIndexState<TIndexKey, TPk>,
    // For a composite INDEX key: encodes each key to the string `entities` key.
    // Member `ids` are stored raw (arrays for a composite PK — no encoding).
    keyCodec?: IOIMPkCodec<TIndexKey>
): TOIMDBReduxDefaultIndexState<TIndexKey, TPk> {
    type TKey = TOIMReduxKey<TIndexKey>;
    // If no current state, initialize from all keys
    if (!currentState) {
        const allKeys = index.getKeys();
        const keysLength = allKeys.length;
        const entities: Record<TKey, { id: TIndexKey; ids: TPk[] }> =
            Object.create(null) as Record<
                TKey,
                { id: TIndexKey; ids: TPk[] }
            >;

        for (let i = 0; i < keysLength; i++) {
            const key = allKeys[i];
            const pks = index.getPksByKey(key);
            const ids = pks instanceof Set ? Array.from(pks) : pks;
            entities[toReduxKey(key, keyCodec)] = { id: key, ids };
        }

        return { entities };
    }

    // Update only changed keys
    const newEntities = Object.assign({}, currentState.entities) as Record<
        TKey,
        { id: TIndexKey; ids: TPk[] }
    >;

    for (const key of updatedKeys) {
        const pks = index.getPksByKey(key);
        const ids = pks instanceof Set ? Array.from(pks) : pks;
        newEntities[toReduxKey(key, keyCodec)] = { id: key, ids };
    }

    return { entities: newEntities };
}

/**
 * Default mapper for a keyless "Global" (whole-collection) index. Produces the
 * single ordered/deduped pk list. There are no keys, so a change recomputes the
 * whole (small) list from `getPks()`.
 */
export function defaultGlobalIndexMapper<TPk extends TOIMKey>(
    index: TOIMDBReduxGlobalIndex<TPk>,
    _currentState?: TOIMDBReduxDefaultGlobalIndexState<TPk>
): TOIMDBReduxDefaultGlobalIndexState<TPk> {
    return { ids: globalIndexPksToArray(index) };
}

/**
 * Codec-bound collection mapper for a composite-PK collection. Pass the returned
 * mapper as `mapper` when registering the collection with the adapter — it keys
 * Redux `entities` by `pkCodec.encode(pk)` (a string), which a raw composite PK
 * path cannot be. `OIMPkCodecKeyPath` is the ready codec.
 */
export function createDefaultCollectionMapper<
    TEntity extends object,
    TPk extends TOIMKey,
>(
    pkCodec: IOIMPkCodec<TPk>
): TOIMDBReduxCollectionMapper<
    TEntity,
    TPk,
    TOIMDBReduxDefaultCollectionState<TEntity, TPk>
> {
    return (collection, updatedKeys, currentState) =>
        defaultCollectionMapper(
            collection,
            updatedKeys,
            currentState,
            pkCodec
        );
}

/**
 * Codec-bound index mapper for an index with a composite INDEX key. Member `ids`
 * (which may be composite PKs) are stored raw; only the index key is encoded.
 */
export function createDefaultIndexMapper<
    TIndexKey extends TOIMKey,
    TPk extends TOIMKey,
>(
    keyCodec: IOIMPkCodec<TIndexKey>
): TOIMDBReduxIndexMapper<
    TIndexKey,
    TPk,
    TOIMDBReduxDefaultIndexState<TIndexKey, TPk>
> {
    return (index, updatedKeys, currentState) =>
        defaultIndexMapper(index, updatedKeys, currentState, keyCodec);
}
