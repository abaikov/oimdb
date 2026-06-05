import { TOIMPk } from '@oimdb/core';
import {
    createArrayIndexSourceAdapter,
    createOrderedArrayIndexSourceAdapter,
    createSetIndexSourceAdapter,
    IOIMAnyPersistResource,
    OIMPersistor,
    TOIMArrayIndexPersistSource,
    TOIMCollectionPersistSource,
    TOIMObjectPersistSource,
    TOIMOrderedArrayIndexPersistSource,
    TOIMPersistStrategy,
    TOIMSetIndexPersistSource,
} from '@oimdb/persist';
import { OIMLocalStorageCollectionResourceBuilder } from '../builders/OIMLocalStorageCollectionResourceBuilder';
import { OIMLocalStorageIndexResourceBuilder } from '../builders/OIMLocalStorageIndexResourceBuilder';
import { OIMLocalStorageObjectResourceBuilder } from '../builders/OIMLocalStorageObjectResourceBuilder';
import { TOIMLocalStorageBatchStrategy } from '../types/TOIMLocalStorageBatchStrategy';
import { TOIMLocalStoragePersistorOptions } from '../types/TOIMLocalStoragePersistorOptions';
import { TOIMLocalStorageRuntime } from '../types/TOIMLocalStorageRuntime';

export class OIMLocalStoragePersistor extends OIMPersistor<TOIMLocalStorageRuntime> {
    constructor(options: TOIMLocalStoragePersistorOptions = {}) {
        const storage = options.storage ?? globalThis.localStorage;
        if (!storage) {
            throw new Error(
                '[OIMPersist]: localStorage is not available in this environment.'
            );
        }
        super({
            ...options,
            storage: {
                storage,
                serialize: options.serialize ?? (v => JSON.stringify(v)),
                deserialize: options.deserialize ?? (v => JSON.parse(v)),
            },
        });
    }

    public collection<TEntity extends object, TPk extends TOIMPk>(
        collection: TOIMCollectionPersistSource<TEntity, TPk>
    ): OIMLocalStorageCollectionResourceBuilder<TEntity, TPk> {
        return new OIMLocalStorageCollectionResourceBuilder(this, collection);
    }

    public object<TKey extends string, TValue>(
        object: TOIMObjectPersistSource<TKey, TValue>
    ): OIMLocalStorageObjectResourceBuilder<TKey, TValue> {
        return new OIMLocalStorageObjectResourceBuilder(this, object);
    }

    public setIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMSetIndexPersistSource<TKey, TPk>
    ): OIMLocalStorageIndexResourceBuilder<TKey, TPk> {
        return new OIMLocalStorageIndexResourceBuilder(
            this,
            createSetIndexSourceAdapter(index)
        );
    }

    public arrayIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMArrayIndexPersistSource<TKey, TPk>
    ): OIMLocalStorageIndexResourceBuilder<TKey, TPk> {
        return new OIMLocalStorageIndexResourceBuilder(
            this,
            createArrayIndexSourceAdapter(index)
        );
    }

    public orderedArrayIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMOrderedArrayIndexPersistSource<TKey, TPk>
    ): OIMLocalStorageIndexResourceBuilder<TKey, TPk> {
        return new OIMLocalStorageIndexResourceBuilder(
            this,
            createOrderedArrayIndexSourceAdapter(index)
        );
    }

    protected override async batchPersist(
        resources: readonly IOIMAnyPersistResource<this>[]
    ): Promise<void> {
        const batchItems: Array<{
            strategy: TOIMLocalStorageBatchStrategy<unknown>;
            snapshot: unknown;
            resource: IOIMAnyPersistResource<OIMLocalStoragePersistor>;
        }> = [];
        const fallbackItems: Array<{
            strategy: TOIMPersistStrategy<OIMLocalStoragePersistor, unknown>;
            snapshot: unknown;
            resource: IOIMAnyPersistResource<OIMLocalStoragePersistor>;
        }> = [];

        for (const resource of resources) {
            const snapshot = resource.takeSnapshot();
            const strategy =
                resource.strategy as TOIMLocalStorageBatchStrategy<unknown>;
            if (typeof strategy.storageKeys !== 'undefined') {
                batchItems.push({ strategy, snapshot, resource });
            } else {
                fallbackItems.push({
                    strategy: resource.strategy,
                    snapshot,
                    resource,
                });
            }
        }

        if (batchItems.length > 0) {
            const allKeys = new Set<string>();
            for (const { strategy } of batchItems) {
                for (const key of strategy.storageKeys) allKeys.add(key);
            }

            const roots = new Map<string, unknown>();
            const toDelete = new Set<string>();
            for (const key of allKeys) {
                const raw = this.storage.storage.getItem(key);
                if (raw !== null) roots.set(key, this.storage.deserialize(raw));
            }

            try {
                for (const { strategy, snapshot } of batchItems) {
                    strategy.writeToRoots(roots, toDelete, snapshot);
                }

                for (const [key, value] of roots) {
                    if (!toDelete.has(key)) {
                        this.storage.storage.setItem(
                            key,
                            this.storage.serialize(value)
                        );
                    }
                }
                for (const key of toDelete) {
                    this.storage.storage.removeItem(key);
                }
            } catch (error) {
                if (this.onError) {
                    for (const { resource } of batchItems) {
                        this.onError(error, { resource, operation: 'persist' });
                    }
                } else {
                    throw error;
                }
            }
        }

        for (const { strategy, snapshot, resource } of fallbackItems) {
            try {
                await strategy.write(this, snapshot);
            } catch (error) {
                if (this.onError) {
                    this.onError(error, { resource, operation: 'persist' });
                } else {
                    throw error;
                }
            }
        }
    }
}
