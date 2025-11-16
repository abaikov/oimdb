import { Reducer, Action } from 'redux';
import {
    OIMReactiveCollection,
    OIMReactiveIndexSetBased,
    OIMReactiveIndexArrayBased,
    OIMIndexSetBased,
    OIMIndexArrayBased,
    TOIMPk,
} from '@oimdb/core';
import { EOIMDBReduxReducerActionType } from '../enum/EOIMDBReduxReducerActionType';
import { TOIMDBReduxCollectionMapper } from '../types/TOIMDBReduxCollectionMapper';
import { TOIMDBReduxIndexMapper } from '../types/TOIMDBReduxIndexMapper';
import { TOIMDBReduxCollectionReducerChildOptions } from '../types/TOIMDBReduxCollectionReducerChildOptions';
import { TOIMDBReduxIndexReducerChildOptions } from '../types/TOIMDBReduxIndexReducerChildOptions';
import { findUpdatedInRecord } from '../utils/findUpdatedEntities';
import { TOIMDBReduxDefaultCollectionState } from '../types/TOIMDBReduxDefaultCollectionState';
import { TOIMDBReduxDefaultIndexState } from '../types/TOIMDBReduxDefaultIndexState';
import { OIMDBReduxLinkedIndexesUpdater } from './OIMDBReduxLinkedIndexesUpdater';

/**
 * Factory for creating Redux reducers from OIMDB collections and indexes.
 */
export class OIMDBReduxReducerFactory {
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
            // Initialize state if undefined (required by Redux combineReducers)
            if (state === undefined) {
                // Get all PKs for initialization
                const allPks = new Set(collection.getAllPks());
                return actualMapper(collection, allPks, undefined);
            }

            // Handle OIMDB_UPDATE action (from OIMDB to Redux)
            if (action.type === EOIMDBReduxReducerActionType.UPDATE) {
                // If we're syncing from child, skip to prevent loops
                if (isSyncingFromChild) {
                    return state;
                }

                // If no updates, return state unchanged
                if (reducerData.updatedKeys === null) {
                    return state;
                }

                // Create new state using mapper
                const updatedKeys = reducerData.updatedKeys;
                const newState = actualMapper(
                    collection,
                    updatedKeys,
                    state as TState | undefined
                );

                // Clear updated keys
                reducerData.updatedKeys = null;

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
                                collection.upsertMany(entitiesToUpsert);
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
                                    new OIMDBReduxLinkedIndexesUpdater<TEntity, TPk>();
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

            // No child reducer and not OIMDB_UPDATE - return state unchanged
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
                            // Check if index has addPks/removePks methods (OIMReactiveIndexManual)
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
                                        // Use addPks/removePks if available (OIMReactiveIndexManual)
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
}
