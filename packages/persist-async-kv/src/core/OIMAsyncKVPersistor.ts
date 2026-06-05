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
import { OIMAsyncKVCollectionResourceBuilder } from '../builders/OIMAsyncKVCollectionResourceBuilder';
import { OIMAsyncKVIndexResourceBuilder } from '../builders/OIMAsyncKVIndexResourceBuilder';
import { OIMAsyncKVObjectResourceBuilder } from '../builders/OIMAsyncKVObjectResourceBuilder';
import { TOIMAsyncKVBatchStrategy } from '../types/TOIMAsyncKVBatchStrategy';
import { TOIMAsyncKVPersistorOptions } from '../types/TOIMAsyncKVPersistorOptions';
import { TOIMAsyncKVRuntime } from '../types/TOIMAsyncKVRuntime';

export class OIMAsyncKVPersistor extends OIMPersistor<TOIMAsyncKVRuntime> {
    constructor(options: TOIMAsyncKVPersistorOptions) {
        const { storage } = options;
        if (!storage) {
            throw new Error(
                '[OIMPersist]: an async key-value storage must be provided.'
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
    ): OIMAsyncKVCollectionResourceBuilder<TEntity, TPk> {
        return new OIMAsyncKVCollectionResourceBuilder(this, collection);
    }

    public object<TKey extends string, TValue>(
        object: TOIMObjectPersistSource<TKey, TValue>
    ): OIMAsyncKVObjectResourceBuilder<TKey, TValue> {
        return new OIMAsyncKVObjectResourceBuilder(this, object);
    }

    public setIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMSetIndexPersistSource<TKey, TPk>
    ): OIMAsyncKVIndexResourceBuilder<TKey, TPk> {
        return new OIMAsyncKVIndexResourceBuilder(
            this,
            createSetIndexSourceAdapter(index)
        );
    }

    public arrayIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMArrayIndexPersistSource<TKey, TPk>
    ): OIMAsyncKVIndexResourceBuilder<TKey, TPk> {
        return new OIMAsyncKVIndexResourceBuilder(
            this,
            createArrayIndexSourceAdapter(index)
        );
    }

    public orderedArrayIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMOrderedArrayIndexPersistSource<TKey, TPk>
    ): OIMAsyncKVIndexResourceBuilder<TKey, TPk> {
        return new OIMAsyncKVIndexResourceBuilder(
            this,
            createOrderedArrayIndexSourceAdapter(index)
        );
    }

    protected override async batchPersist(
        resources: readonly IOIMAnyPersistResource<this>[]
    ): Promise<void> {
        const batchItems: Array<{
            strategy: TOIMAsyncKVBatchStrategy<unknown>;
            snapshot: unknown;
            resource: IOIMAnyPersistResource<OIMAsyncKVPersistor>;
        }> = [];
        const fallbackItems: Array<{
            strategy: TOIMPersistStrategy<OIMAsyncKVPersistor, unknown>;
            snapshot: unknown;
            resource: IOIMAnyPersistResource<OIMAsyncKVPersistor>;
        }> = [];

        for (const resource of resources) {
            const snapshot = resource.takeSnapshot();
            const strategy =
                resource.strategy as TOIMAsyncKVBatchStrategy<unknown>;
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
            const keys = [...allKeys];

            // READ roots: prefer a single multiGet, else sequential getItem.
            const roots = new Map<string, unknown>();
            const toDelete = new Set<string>();
            const { storage } = this.storage;
            if (storage.multiGet) {
                const pairs = await storage.multiGet(keys);
                for (const [key, raw] of pairs) {
                    if (raw !== null) {
                        roots.set(key, this.storage.deserialize(raw));
                    }
                }
            } else {
                for (const key of keys) {
                    const raw = await storage.getItem(key);
                    if (raw !== null) {
                        roots.set(key, this.storage.deserialize(raw));
                    }
                }
            }

            try {
                for (const { strategy, snapshot } of batchItems) {
                    strategy.writeToRoots(roots, toDelete, snapshot);
                }

                // WRITE surviving roots: prefer a single multiSet.
                const toSet: Array<[string, string]> = [];
                for (const [key, value] of roots) {
                    if (!toDelete.has(key)) {
                        toSet.push([key, this.storage.serialize(value)]);
                    }
                }
                if (toSet.length > 0) {
                    if (storage.multiSet) {
                        await storage.multiSet(toSet);
                    } else {
                        for (const [key, value] of toSet) {
                            await storage.setItem(key, value);
                        }
                    }
                }

                // REMOVE deleted roots: prefer a single multiRemove.
                const toRemove = [...toDelete];
                if (toRemove.length > 0) {
                    if (storage.multiRemove) {
                        await storage.multiRemove(toRemove);
                    } else {
                        for (const key of toRemove) {
                            await storage.removeItem(key);
                        }
                    }
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
