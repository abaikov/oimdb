import { TOIMKey } from '@oimdb/core';
import {
    OIMReactiveIndexSetBased,
    OIMReactiveIndexArrayBased,
    OIMIndexSetBased,
    OIMIndexArrayBased,
    IOIMPkCodec,
} from '@oimdb/core';
import { TOIMReduxKey } from '../types/TOIMReduxKey';

/**
 * Type for linked index configuration
 */
type TOIMDBReduxLinkedIndexConfig<TEntity extends object, TPk extends TOIMKey> = {
    index:
        | OIMReactiveIndexSetBased<TOIMKey, TPk, OIMIndexSetBased<TOIMKey, TPk>>
        | OIMReactiveIndexArrayBased<
              TOIMKey,
              TPk,
              OIMIndexArrayBased<TOIMKey, TPk>
          >
        | OIMReactiveIndexSetBased<string, TPk, OIMIndexSetBased<string, TPk>>
        | OIMReactiveIndexArrayBased<
              string,
              TPk,
              OIMIndexArrayBased<string, TPk>
          >
        | OIMReactiveIndexSetBased<number, TPk, OIMIndexSetBased<number, TPk>>
        | OIMReactiveIndexArrayBased<
              number,
              TPk,
              OIMIndexArrayBased<number, TPk>
          >;
    fieldName: keyof TEntity;
};

/**
 * Helper class for updating linked indexes when collection entities change.
 * Handles both added/updated entities and removed entities.
 */
export class OIMDBReduxLinkedIndexesUpdater<
    TEntity extends object,
    TPk extends TOIMKey,
> {
    /**
     * Update linked indexes for added and updated entities
     */
    /** Recover the raw PK from a Redux string key (identity for a primitive PK). */
    private decodePk(
        key: TOIMReduxKey<TPk>,
        pkCodec?: IOIMPkCodec<TPk>
    ): TPk {
        return pkCodec
            ? pkCodec.decode(key as unknown as string)
            : (key as unknown as TPk);
    }

    public updateLinkedIndexesForEntities(
        linkedIndexes: Array<TOIMDBReduxLinkedIndexConfig<TEntity, TPk>>,
        updatedPks: readonly TOIMReduxKey<TPk>[],
        oldEntities: Record<TOIMReduxKey<TPk>, TEntity>,
        newEntities: Record<TOIMReduxKey<TPk>, TEntity>,
        pkCodec?: IOIMPkCodec<TPk>
    ): void {
        if (linkedIndexes.length === 0) {
            return;
        }

        const updatedPksLength = updatedPks.length;
        for (let i = 0; i < updatedPksLength; i++) {
            const pk = updatedPks[i];
            const oldEntity = oldEntities[pk];
            const newEntity = newEntities[pk];

            if (!newEntity) continue;

            // Check each linked index
            const linkedIndexesLength = linkedIndexes.length;
            for (let j = 0; j < linkedIndexesLength; j++) {
                const linkedIndex = linkedIndexes[j];
                const fieldName = linkedIndex.fieldName;

                // Get old and new arrays of PKs from the field
                const oldArray = oldEntity
                    ? (oldEntity[fieldName] as TPk[] | undefined)
                    : undefined;
                const newArray = newEntity[fieldName] as TPk[] | undefined;

                // Check if array changed by reference
                if (oldArray !== newArray) {
                    this.updateIndexForEntity(
                        linkedIndex,
                        this.decodePk(pk, pkCodec),
                        oldArray,
                        newArray
                    );
                }
            }
        }
    }

    /**
     * Remove linked indexes for removed entities
     */
    public removeLinkedIndexesForEntities(
        linkedIndexes: Array<TOIMDBReduxLinkedIndexConfig<TEntity, TPk>>,
        removedPks: readonly TOIMReduxKey<TPk>[],
        pkCodec?: IOIMPkCodec<TPk>
    ): void {
        if (linkedIndexes.length === 0 || removedPks.length === 0) {
            return;
        }

        const removedPksLength = removedPks.length;
        for (let i = 0; i < removedPksLength; i++) {
            const entityPk = this.decodePk(removedPks[i], pkCodec);

            const linkedIndexesLength = linkedIndexes.length;
            for (let j = 0; j < linkedIndexesLength; j++) {
                const linkedIndex = linkedIndexes[j];
                const indexKey = entityPk as unknown as TOIMKey;

                // Remove entire index entry for this entity
                // Get all PKs for this key first
                const existingPks = Array.from(
                    (
                        linkedIndex.index as unknown as {
                            getPksByKey: (key: TOIMKey) => Set<TPk>;
                        }
                    ).getPksByKey(indexKey)
                );

                if (existingPks.length > 0) {
                    const indexManual = linkedIndex.index as unknown as {
                        removePks?: (key: TOIMKey, pks: readonly TPk[]) => void;
                        setPks?: (key: TOIMKey, pks: TPk[]) => void;
                        clear?: (key?: TOIMKey) => void;
                    };

                    if (indexManual.removePks) {
                        // Remove all PKs - this will clean up empty buckets
                        indexManual.removePks(indexKey, existingPks);
                    } else {
                        // Use clear to remove the key entirely
                        if (indexManual.clear) {
                            indexManual.clear(indexKey);
                        } else if (indexManual.setPks) {
                            // Fallback: set empty array
                            indexManual.setPks(indexKey, []);
                        }
                    }
                }
            }
        }
    }

    /**
     * Update a single index for a single entity
     */
    private updateIndexForEntity(
        linkedIndex: TOIMDBReduxLinkedIndexConfig<TEntity, TPk>,
        entityPk: TPk,
        oldArray: TPk[] | undefined,
        newArray: TPk[] | undefined
    ): void {
        const indexManual = linkedIndex.index as unknown as {
            addPks?: (key: TOIMKey, pks: readonly TPk[]) => void;
            removePks?: (key: TOIMKey, pks: readonly TPk[]) => void;
            setPks?: (key: TOIMKey, pks: TPk[]) => void;
        };

        // Use entity PK as index key
        const indexKey = entityPk as unknown as TOIMKey;

        // If setPks is available, just set the new array directly (no diff needed)
        if (indexManual.setPks) {
            indexManual.setPks(indexKey, newArray ?? []);
        } else if (indexManual.addPks && indexManual.removePks) {
            // Only do diff if we have addPks/removePks (SetBased indexes)
            const oldArrayForIteration = oldArray ?? [];
            const newArrayForIteration = newArray ?? [];

            // Create Set only if array has elements
            const oldSet =
                oldArrayForIteration.length > 0
                    ? new Set(oldArrayForIteration)
                    : null;
            const newSet =
                newArrayForIteration.length > 0
                    ? new Set(newArrayForIteration)
                    : null;

            // Find PKs to remove (in old but not in new)
            const toRemove: TPk[] = [];
            const oldArrayLength = oldArrayForIteration.length;
            if (oldArrayLength > 0) {
                if (newSet) {
                    for (let i = 0; i < oldArrayLength; i++) {
                        const valuePk = oldArrayForIteration[i];
                        if (!newSet.has(valuePk)) {
                            toRemove.push(valuePk);
                        }
                    }
                } else {
                    // New array is empty, all old items should be removed
                    for (let i = 0; i < oldArrayLength; i++) {
                        toRemove.push(oldArrayForIteration[i]);
                    }
                }
            }

            // Find PKs to add (in new but not in old)
            const toAdd: TPk[] = [];
            const newArrayLength = newArrayForIteration.length;
            if (newArrayLength > 0) {
                if (oldSet) {
                    for (let i = 0; i < newArrayLength; i++) {
                        const valuePk = newArrayForIteration[i];
                        if (!oldSet.has(valuePk)) {
                            toAdd.push(valuePk);
                        }
                    }
                } else {
                    // Old array is empty, all new items should be added
                    for (let i = 0; i < newArrayLength; i++) {
                        toAdd.push(newArrayForIteration[i]);
                    }
                }
            }

            // Apply changes using addPks/removePks
            if (toRemove.length > 0) {
                indexManual.removePks(indexKey, toRemove);
            }
            if (toAdd.length > 0) {
                indexManual.addPks(indexKey, toAdd);
            }
        }
    }
}
