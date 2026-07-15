import { Reducer, Action } from 'redux';
import {
    OIMReactiveCollection,
    OIMReactiveIndexSetBased,
    OIMReactiveIndexArrayBased,
    OIMIndexSetBased,
    OIMIndexArrayBased,
    TOIMPk,
} from '@oimdb/core';
import { EOIMDBReduxReducerActionType } from '../enums/EOIMDBReduxReducerActionType';
import { TOIMDBReduxCollectionMapper } from '../types/TOIMDBReduxCollectionMapper';
import { TOIMDBReduxIndexMapper } from '../types/TOIMDBReduxIndexMapper';
import { TOIMDBReduxCollectionReducerChildOptions } from '../types/TOIMDBReduxCollectionReducerChildOptions';
import { TOIMDBReduxIndexReducerChildOptions } from '../types/TOIMDBReduxIndexReducerChildOptions';
import { TOIMDBReduxGlobalIndex } from '../types/TOIMDBReduxGlobalIndex';
import { TOIMDBReduxGlobalIndexMapper } from '../types/TOIMDBReduxGlobalIndexMapper';
import { TOIMDBReduxGlobalIndexReducerChildOptions } from '../types/TOIMDBReduxGlobalIndexReducerChildOptions';
import { TOIMDBReduxDefaultGlobalIndexState } from '../types/TOIMDBReduxDefaultGlobalIndexState';
import { findUpdatedInRecord } from '../utils/findUpdatedEntities';
import { TOIMDBReduxDefaultCollectionState } from '../types/TOIMDBReduxDefaultCollectionState';
import { TOIMDBReduxDefaultIndexState } from '../types/TOIMDBReduxDefaultIndexState';
import { OIMDBReduxLinkedIndexesUpdater } from './OIMDBReduxLinkedIndexesUpdater';

/**
 * Factory for creating Redux reducers from OIMDB collections and indexes.
 */
export class OIMDBReduxReducerFactory {
    private isReduxInitAction(action: Action): boolean {
        const type = (action as unknown as { type?: unknown }).type;
        return typeof type === 'string' && type.startsWith('@@redux/');
    }

    /**
     * Create Redux reducer for a collection
     */
    public createCollectionReducer<
        TEntity extends object,
        TPk extends TOIMPk,
        TState,
    >(
        collection: OIMReactiveCollection<TEntity, TPk>,
        reducerData: {
            updatedKeys: Set<TPk> | null;
            forceRecompute?: boolean;
            mapper: TOIMDBReduxCollectionMapper<TEntity, TPk, TState>;
        },
        child?: TOIMDBReduxCollectionReducerChildOptions<TEntity, TPk, TState>
    ): Reducer<TState | undefined, Action> {
        const actualMapper = reducerData.mapper;

        // Track if we're syncing from child reducer to prevent loops
        let isSyncingFromChild = false;

        // Create reducer function
        const reducer: Reducer<TState | undefined, Action> = (
            state: TState | undefined,
            action: Action
        ) => {
            // Redux requires reducers to return a non-undefined initial state for @@redux/* actions.
            // Also, our child reducer should not be able to wipe initial state during store init.
            if (state === undefined) {
                const allPks = new Set(collection.getAllPks());
                const initialState = actualMapper(
                    collection,
                    allPks,
                    undefined
                );

                if (action.type === EOIMDBReduxReducerActionType.UPDATE) {
                    reducerData.updatedKeys = null;
                    if (reducerData.forceRecompute !== undefined) {
                        reducerData.forceRecompute = false;
                    }
                    return initialState;
                }

                if (this.isReduxInitAction(action)) {
                    return initialState;
                }

                // For non-Redux-init actions, keep behavior compatible with RTK reducers:
                // do not auto-initialize state when called with undefined.
                return undefined;
            }

            // Handle OIMDB_UPDATE action (from OIMDB to Redux)
            if (action.type === EOIMDBReduxReducerActionType.UPDATE) {
                // If we're syncing from child, skip to prevent loops
                if (isSyncingFromChild) {
                    return state;
                }

                // If force recompute was requested (e.g. collection.clear()),
                // rebuild state from scratch by calling the mapper with undefined current state.
                if (reducerData.forceRecompute) {
                    const newState = actualMapper(
                        collection,
                        new Set<TPk>(),
                        undefined
                    );
                    reducerData.updatedKeys = null;
                    reducerData.forceRecompute = false;
                    return newState;
                }

                // If no updates, return state unchanged
                if (reducerData.updatedKeys === null) return state;

                // Create new state using mapper
                const updatedKeys = reducerData.updatedKeys;
                const newState = actualMapper(
                    collection,
                    updatedKeys,
                    state as TState | undefined
                );

                // Clear updated keys
                reducerData.updatedKeys = null;
                if (reducerData.forceRecompute !== undefined) {
                    reducerData.forceRecompute = false;
                }

                // Update linked indexes if child reducer is provided
                if (
                    child &&
                    child.linkedIndexes &&
                    child.linkedIndexes.length > 0
                ) {
                    // Check if state has TOIMDBReduxDefaultCollectionState structure
                    const oldState = state as unknown as
                        | TOIMDBReduxDefaultCollectionState<TEntity, TPk>
                        | undefined;
                    const newStateTyped = newState as unknown as
                        | TOIMDBReduxDefaultCollectionState<TEntity, TPk>
                        | undefined;

                    if (
                        oldState &&
                        newStateTyped &&
                        typeof oldState === 'object' &&
                        typeof newStateTyped === 'object' &&
                        'entities' in oldState &&
                        'entities' in newStateTyped
                    ) {
                        // Find differences between old and new state
                        const diff = findUpdatedInRecord(
                            oldState.entities,
                            newStateTyped.entities
                        );

                        // Convert Sets to arrays once and combine directly (avoid Set iteration)
                        const addedArray = Array.from(diff.added);
                        const updatedArray = Array.from(diff.updated);
                        const removedArray = Array.from(diff.removed);

                        // Combine arrays directly (added and updated don't overlap)
                        const allUpdatedPksArray: TPk[] = [];
                        allUpdatedPksArray.length =
                            addedArray.length + updatedArray.length;
                        let writeIndex = 0;
                        for (let i = 0; i < addedArray.length; i++) {
                            allUpdatedPksArray[writeIndex++] = addedArray[i];
                        }
                        for (let i = 0; i < updatedArray.length; i++) {
                            allUpdatedPksArray[writeIndex++] = updatedArray[i];
                        }

                        // Update linked indexes using helper class
                        const linkedIndexesUpdater =
                            new OIMDBReduxLinkedIndexesUpdater<TEntity, TPk>();
                        linkedIndexesUpdater.updateLinkedIndexesForEntities(
                            child.linkedIndexes,
                            allUpdatedPksArray,
                            oldState.entities,
                            newStateTyped.entities
                        );
                        linkedIndexesUpdater.removeLinkedIndexesForEntities(
                            child.linkedIndexes,
                            removedArray
                        );
                    }
                }

                return newState;
            }

            // Handle other actions with child reducer (if provided)
            if (child) {
                // If state is undefined, don't call child reducer (RTK reducers don't accept undefined)
                // Return undefined to let Redux handle initialization
                if (state === undefined) {
                    return undefined;
                }
                // Pass action to child reducer
                const childState = child.reducer(state, action);

                // If state changed, sync back to OIMDB
                if (childState !== state && childState !== undefined) {
                    // Get PK extractor
                    const getPk =
                        child.getPk ??
                        ((entity: TEntity): TPk => {
                            // Try to get PK from entity (assuming it has id or similar)
                            const entityAny = entity as unknown as Record<
                                string,
                                unknown
                            >;
                            if ('id' in entityAny) {
                                return entityAny.id as TPk;
                            }
                            throw new Error(
                                'Cannot determine primary key. Provide getPk in child options'
                            );
                        });

                    // Use custom extractEntities or default implementation
                    if (child.extractEntities) {
                        // Custom extraction function - user handles everything
                        isSyncingFromChild = true;
                        child.extractEntities(
                            state as TState | undefined,
                            childState as TState,
                            collection,
                            getPk
                        );
                        isSyncingFromChild = false;
                    } else {
                        // Default implementation for TOIMDBReduxDefaultCollectionState
                        const defaultState =
                            childState as unknown as TOIMDBReduxDefaultCollectionState<
                                TEntity,
                                TPk
                            >;
                        if (
                            defaultState &&
                            typeof defaultState === 'object' &&
                            'entities' in defaultState &&
                            'ids' in defaultState
                        ) {
                            // Get current entities from OIMDB for comparison
                            const currentPks = collection.getAllPks();
                            const oldEntities: Record<TPk, TEntity> =
                                Object.create(null) as Record<TPk, TEntity>;
                            for (let i = 0; i < currentPks.length; i++) {
                                const pk = currentPks[i];
                                const entity = collection.getOneByPk(pk);
                                if (entity) {
                                    oldEntities[pk] = entity;
                                }
                            }

                            // Find differences
                            const diff = findUpdatedInRecord(
                                oldEntities,
                                defaultState.entities
                            );

                            // Sync changes to OIMDB
                            isSyncingFromChild = true;
                            // Upsert added and updated entities
                            const addedArray = Array.from(diff.added);
                            const updatedArray = Array.from(diff.updated);
                            const entitiesToUpsert: TEntity[] = [];
                            const addedLength = addedArray.length;
                            const updatedLength = updatedArray.length;

                            for (let i = 0; i < addedLength; i++) {
                                const pk = addedArray[i];
                                if (defaultState.entities[pk]) {
                                    entitiesToUpsert.push(
                                        defaultState.entities[pk]
                                    );
                                }
                            }
                            for (let i = 0; i < updatedLength; i++) {
                                const pk = updatedArray[i];
                                if (defaultState.entities[pk]) {
                                    entitiesToUpsert.push(
                                        defaultState.entities[pk]
                                    );
                                }
                            }
                            if (entitiesToUpsert.length > 0) {
                                // Prefer a single batched upsertMany(...) when entities already carry a PK
                                // (so collection.selectPk(...) works). Otherwise, fall back to upsertOneByPk(...)
                                // using the record PK.
                                let canUseUpsertMany = true;
                                for (let i = 0; i < entitiesToUpsert.length; i++) {
                                    try {
                                        const pk = collection.selectPk(
                                            entitiesToUpsert[i] as unknown as TEntity
                                        );
                                        if (pk === undefined || pk === null) {
                                            canUseUpsertMany = false;
                                            break;
                                        }
                                    } catch {
                                        canUseUpsertMany = false;
                                        break;
                                    }
                                }

                                if (canUseUpsertMany) {
                                    collection.upsertMany(entitiesToUpsert);
                                } else {
                                    // Default Redux entity maps often store PKs as record keys, and entities may omit `id`.
                                    // Use upsertOneByPk(pk, ...) where `pk` comes from the record key.
                                    for (let i = 0; i < addedLength; i++) {
                                        const pk = addedArray[i];
                                        const entity = defaultState.entities[pk];
                                        if (entity) collection.upsertOneByPk(pk, entity);
                                    }
                                    for (let i = 0; i < updatedLength; i++) {
                                        const pk = updatedArray[i];
                                        const entity = defaultState.entities[pk];
                                        if (entity) collection.upsertOneByPk(pk, entity);
                                    }
                                }
                            }

                            // Remove deleted entities
                            const removedArray = Array.from(diff.removed);
                            const removedLength = removedArray.length;
                            if (removedLength > 0) {
                                const entitiesToRemove: TEntity[] = [];
                                for (let i = 0; i < removedLength; i++) {
                                    const pk = removedArray[i];
                                    const entity = oldEntities[pk];
                                    if (entity) {
                                        entitiesToRemove.push(entity);
                                    }
                                }
                                if (entitiesToRemove.length > 0) {
                                    collection.removeMany(entitiesToRemove);
                                }
                            }

                            // Update linked indexes
                            if (
                                child.linkedIndexes &&
                                child.linkedIndexes.length > 0
                            ) {
                                // Process updated entities (added + updated)
                                // Combine arrays directly (avoid Set iteration)
                                const allUpdatedPksArray: TPk[] = [];
                                allUpdatedPksArray.length =
                                    addedArray.length + updatedArray.length;
                                let writeIndex = 0;
                                for (let i = 0; i < addedArray.length; i++) {
                                    allUpdatedPksArray[writeIndex++] =
                                        addedArray[i];
                                }
                                for (let i = 0; i < updatedArray.length; i++) {
                                    allUpdatedPksArray[writeIndex++] =
                                        updatedArray[i];
                                }

                                // Update linked indexes using helper class
                                const linkedIndexesUpdater =
                                    new OIMDBReduxLinkedIndexesUpdater<
                                        TEntity,
                                        TPk
                                    >();
                                linkedIndexesUpdater.updateLinkedIndexesForEntities(
                                    child.linkedIndexes,
                                    allUpdatedPksArray,
                                    oldEntities,
                                    defaultState.entities
                                );
                                linkedIndexesUpdater.removeLinkedIndexesForEntities(
                                    child.linkedIndexes,
                                    removedArray
                                );
                            }
                            isSyncingFromChild = false;
                        }
                    }

                    return childState;
                }

                return childState;
            }

            // No child reducer and not OIMDB_UPDATE
            // If state is undefined, initialize it (for backward compatibility)
            if (state === undefined) {
                const allPks = new Set(collection.getAllPks());
                return actualMapper(collection, allPks, undefined);
            }
            // Return state unchanged
            return state;
        };

        return reducer;
    }

    /**
     * Create Redux reducer for an index
     */
    public createIndexReducer<
        TIndexKey extends TOIMPk,
        TPk extends TOIMPk,
        TState,
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
        reducerData: {
            updatedKeys: Set<TIndexKey> | null;
            forceRecompute?: boolean;
            mapper: TOIMDBReduxIndexMapper<TIndexKey, TPk, TState>;
        },
        child?: TOIMDBReduxIndexReducerChildOptions<TIndexKey, TPk, TState>
    ): Reducer<TState | undefined, Action> {
        const actualMapper = reducerData.mapper;

        // Track if we're syncing from child reducer to prevent loops
        let isSyncingFromChild = false;

        // Create reducer function
        const reducer: Reducer<TState | undefined, Action> = (
            state: TState | undefined,
            action: Action
        ) => {
            // Initialize state if undefined (required by Redux combineReducers)
            if (state === undefined) {
                // Get all keys for initialization
                const allKeys = new Set(index.getKeys());
                return actualMapper(index, allKeys, undefined);
            }

            // Handle OIMDB_UPDATE action (from OIMDB to Redux)
            if (action.type === EOIMDBReduxReducerActionType.UPDATE) {
                // If we're syncing from child, skip to prevent loops
                if (isSyncingFromChild) {
                    return state;
                }

                if (reducerData.forceRecompute) {
                    const newState = actualMapper(
                        index,
                        new Set<TIndexKey>(),
                        undefined
                    );
                    reducerData.updatedKeys = null;
                    reducerData.forceRecompute = false;
                    return newState;
                }

                // If no updates, return state unchanged
                if (reducerData.updatedKeys === null) {
                    return state;
                }

                // Create new state using mapper
                const updatedKeys = reducerData.updatedKeys;
                const newState = actualMapper(
                    index,
                    updatedKeys,
                    state as TState | undefined
                );

                // Clear updated keys
                reducerData.updatedKeys = null;
                if (reducerData.forceRecompute !== undefined) {
                    reducerData.forceRecompute = false;
                }

                return newState;
            }

            // Handle other actions with child reducer (if provided)
            if (child) {
                // If state is undefined, don't call child reducer (RTK reducers don't accept undefined)
                // Return undefined to let Redux handle initialization
                if (state === undefined) {
                    return undefined;
                }
                // Pass action to child reducer
                const childState = child.reducer(state, action);

                // If state changed, sync back to OIMDB
                if (childState !== state && childState !== undefined) {
                    // Use custom extractIndexState or default implementation
                    if (child.extractIndexState) {
                        // Custom extraction function - user handles everything
                        isSyncingFromChild = true;
                        child.extractIndexState(
                            state as TState | undefined,
                            childState as TState,
                            index
                        );
                        isSyncingFromChild = false;
                    } else {
                        // Default implementation for TOIMDBReduxDefaultIndexState
                        const defaultState =
                            childState as unknown as TOIMDBReduxDefaultIndexState<
                                TIndexKey,
                                TPk
                            >;
                        if (
                            defaultState &&
                            typeof defaultState === 'object' &&
                            'entities' in defaultState
                        ) {
                            // Get current state from OIMDB for comparison
                            const currentKeys = index.getKeys();
                            const oldEntities: Record<
                                TIndexKey,
                                { id: TIndexKey; ids: TPk[] }
                            > = Object.create(null) as Record<
                                TIndexKey,
                                { id: TIndexKey; ids: TPk[] }
                            >;
                            for (let i = 0; i < currentKeys.length; i++) {
                                const key = currentKeys[i];
                                const pks = index.getPksByKey(key);
                                const ids =
                                    pks instanceof Set ? Array.from(pks) : pks;
                                oldEntities[key] = { id: key, ids };
                            }

                            // Find differences
                            const newEntities = defaultState.entities;
                            const allKeys = new Set<TIndexKey>([
                                ...(Object.keys(oldEntities) as TIndexKey[]),
                                ...(Object.keys(newEntities) as TIndexKey[]),
                            ]);

                            // Sync changes to OIMDB
                            isSyncingFromChild = true;
                            // Check if index supports collection-bound PK writes.
                            const indexManual = index as unknown as {
                                addPks?: (
                                    key: TIndexKey,
                                    pks: readonly TPk[]
                                ) => void;
                                removePks?: (
                                    key: TIndexKey,
                                    pks: readonly TPk[]
                                ) => void;
                                setPks?: (key: TIndexKey, pks: TPk[]) => void;
                            };

                            const allKeysArray = Array.from(allKeys);
                            for (let i = 0; i < allKeysArray.length; i++) {
                                const key = allKeysArray[i];
                                const oldEntry = oldEntities[key];
                                const newEntry = newEntities[key];

                                if (!oldEntry && newEntry) {
                                    // Added: add all PKs for this key
                                    if (newEntry.ids.length > 0) {
                                        if (indexManual.addPks) {
                                            indexManual.addPks(
                                                key,
                                                newEntry.ids
                                            );
                                        } else if (indexManual.setPks) {
                                            indexManual.setPks(
                                                key,
                                                newEntry.ids
                                            );
                                        }
                                    }
                                } else if (oldEntry && !newEntry) {
                                    // Removed: remove all PKs for this key
                                    const oldPks = oldEntry.ids;
                                    if (oldPks.length > 0) {
                                        if (indexManual.removePks) {
                                            indexManual.removePks(key, oldPks);
                                        } else if (indexManual.setPks) {
                                            // For non-manual indexes, set empty array
                                            indexManual.setPks(key, []);
                                        }
                                    }
                                } else if (oldEntry && newEntry) {
                                    // Updated: find diff and update
                                    const oldPks = new Set(oldEntry.ids);
                                    const newPks = new Set(newEntry.ids);

                                    // Find PKs to add
                                    const toAdd: TPk[] = [];
                                    const newPksArray = Array.from(newPks);
                                    for (
                                        let i = 0;
                                        i < newPksArray.length;
                                        i++
                                    ) {
                                        const pk = newPksArray[i];
                                        if (!oldPks.has(pk)) {
                                            toAdd.push(pk);
                                        }
                                    }

                                    // Find PKs to remove
                                    const toRemove: TPk[] = [];
                                    const oldPksArray = Array.from(oldPks);
                                    for (
                                        let i = 0;
                                        i < oldPksArray.length;
                                        i++
                                    ) {
                                        const pk = oldPksArray[i];
                                        if (!newPks.has(pk)) {
                                            toRemove.push(pk);
                                        }
                                    }

                                    // Apply changes
                                    if (
                                        indexManual.addPks &&
                                        indexManual.removePks
                                    ) {
                                        // Use addPks/removePks if available.
                                        if (toRemove.length > 0) {
                                            indexManual.removePks(
                                                key,
                                                toRemove
                                            );
                                        }
                                        if (toAdd.length > 0) {
                                            indexManual.addPks(key, toAdd);
                                        }
                                    } else if (indexManual.setPks) {
                                        // Use setPks for full replacement
                                        indexManual.setPks(key, newEntry.ids);
                                    }
                                }
                            }
                            isSyncingFromChild = false;
                        }
                    }

                    return childState;
                }

                return childState;
            }

            // No child reducer and not OIMDB_UPDATE - return state unchanged
            return state;
        };

        return reducer;
    }

    /**
     * Create Redux reducer for a keyless "Global" (whole-collection) index.
     * State is the single pk list; dirtiness is tracked by the adapter via the
     * index's keyless `subscribe()` (works for manual and derived alike).
     */
    public createGlobalIndexReducer<TPk extends TOIMPk, TState>(
        index: TOIMDBReduxGlobalIndex<TPk>,
        reducerData: {
            dirty: boolean;
            mapper: TOIMDBReduxGlobalIndexMapper<TPk, TState>;
        },
        child?: TOIMDBReduxGlobalIndexReducerChildOptions<TPk, TState>
    ): Reducer<TState | undefined, Action> {
        const actualMapper = reducerData.mapper;
        let isSyncingFromChild = false;

        const reducer: Reducer<TState | undefined, Action> = (
            state: TState | undefined,
            action: Action
        ) => {
            if (state === undefined) {
                // Initialization already captures the whole current list, so any
                // pending dirtiness is consumed — no redundant immediate recompute.
                reducerData.dirty = false;
                return actualMapper(index, undefined);
            }

            if (action.type === EOIMDBReduxReducerActionType.UPDATE) {
                if (isSyncingFromChild) return state;
                if (!reducerData.dirty) return state;
                const newState = actualMapper(index, state as TState);
                reducerData.dirty = false;
                return newState;
            }

            if (child) {
                const childState = child.reducer(state, action);
                if (childState !== state && childState !== undefined) {
                    if (child.extractGlobalIndexState) {
                        isSyncingFromChild = true;
                        child.extractGlobalIndexState(
                            state as TState | undefined,
                            childState as TState,
                            index
                        );
                        isSyncingFromChild = false;
                    } else {
                        const defaultState =
                            childState as unknown as TOIMDBReduxDefaultGlobalIndexState<TPk>;
                        if (
                            defaultState &&
                            typeof defaultState === 'object' &&
                            'ids' in defaultState
                        ) {
                            isSyncingFromChild = true;
                            this.syncGlobalIndexIds(index, defaultState.ids);
                            isSyncingFromChild = false;
                        }
                    }
                }
                return childState;
            }

            return state;
        };

        return reducer;
    }

    /** Sync a pk list from Redux back into a manual Global index. */
    private syncGlobalIndexIds<TPk extends TOIMPk>(
        index: TOIMDBReduxGlobalIndex<TPk>,
        nextIds: readonly TPk[]
    ): void {
        const indexManual = index as unknown as {
            setPks?: (pks: readonly TPk[]) => void;
            addPks?: (pks: readonly TPk[]) => void;
            removePks?: (pks: readonly TPk[]) => void;
        };

        // A full replacement respects order (Global lists are single + small).
        if (indexManual.setPks) {
            indexManual.setPks(nextIds.slice());
            return;
        }
        if (!indexManual.addPks || !indexManual.removePks) return;

        const current = index.getPks();
        const oldPks = current instanceof Set ? current : new Set(current);
        const newPks = new Set(nextIds);
        const toAdd: TPk[] = [];
        for (const pk of newPks) if (!oldPks.has(pk)) toAdd.push(pk);
        const toRemove: TPk[] = [];
        for (const pk of oldPks) if (!newPks.has(pk)) toRemove.push(pk);
        if (toRemove.length > 0) indexManual.removePks(toRemove);
        if (toAdd.length > 0) indexManual.addPks(toAdd);
    }
}
