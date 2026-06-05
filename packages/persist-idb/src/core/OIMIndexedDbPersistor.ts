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
import { OIMIndexedDbCollectionResourceBuilder } from '../builders/OIMIndexedDbCollectionResourceBuilder';
import { OIMIndexedDbIndexResourceBuilder } from '../builders/OIMIndexedDbIndexResourceBuilder';
import { OIMIndexedDbObjectResourceBuilder } from '../builders/OIMIndexedDbObjectResourceBuilder';
import { TOIMIndexedDbBatchStrategy } from '../types/TOIMIndexedDbBatchStrategy';
import { TOIMIndexedDbPersistorOptions } from '../types/TOIMIndexedDbPersistorOptions';
import { TOIMIndexedDbRuntime } from '../types/TOIMIndexedDbRuntime';
import { createIndexedDbRuntime } from '../utils/createIndexedDbRuntime';

export class OIMIndexedDbPersistor extends OIMPersistor<TOIMIndexedDbRuntime> {
    constructor(options: TOIMIndexedDbPersistorOptions) {
        const indexedDb = options.indexedDb ?? globalThis.indexedDB;
        if (!indexedDb) {
            throw new Error('[OIMPersist]: IndexedDB is not available.');
        }
        super({
            queue: options.queue,
            storage: createIndexedDbRuntime({
                databaseName: options.databaseName,
                databaseVersion: options.databaseVersion,
                indexedDb,
            }),
        });
    }

    public collection<TEntity extends object, TPk extends TOIMPk>(
        collection: TOIMCollectionPersistSource<TEntity, TPk>
    ): OIMIndexedDbCollectionResourceBuilder<TEntity, TPk> {
        return new OIMIndexedDbCollectionResourceBuilder(this, collection);
    }

    public object<TKey extends string, TValue>(
        object: TOIMObjectPersistSource<TKey, TValue>
    ): OIMIndexedDbObjectResourceBuilder<TKey, TValue> {
        return new OIMIndexedDbObjectResourceBuilder(this, object);
    }

    public setIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMSetIndexPersistSource<TKey, TPk>
    ): OIMIndexedDbIndexResourceBuilder<TKey, TPk> {
        return new OIMIndexedDbIndexResourceBuilder(
            this,
            createSetIndexSourceAdapter(index)
        );
    }

    public arrayIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMArrayIndexPersistSource<TKey, TPk>
    ): OIMIndexedDbIndexResourceBuilder<TKey, TPk> {
        return new OIMIndexedDbIndexResourceBuilder(
            this,
            createArrayIndexSourceAdapter(index)
        );
    }

    public orderedArrayIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMOrderedArrayIndexPersistSource<TKey, TPk>
    ): OIMIndexedDbIndexResourceBuilder<TKey, TPk> {
        return new OIMIndexedDbIndexResourceBuilder(
            this,
            createOrderedArrayIndexSourceAdapter(index)
        );
    }

    /**
     * Writes all resources in a single IndexedDB transaction. All table names
     * are collected upfront, one connection is opened, and all writes execute
     * within the same transaction — fully atomic.
     */
    protected override async batchPersist(
        resources: readonly IOIMAnyPersistResource<this>[]
    ): Promise<void> {
        const batchItems: Array<{
            strategy: TOIMIndexedDbBatchStrategy<unknown>;
            snapshot: unknown;
            resource: IOIMAnyPersistResource<OIMIndexedDbPersistor>;
        }> = [];
        const fallbackItems: Array<{
            strategy: TOIMPersistStrategy<OIMIndexedDbPersistor, unknown>;
            snapshot: unknown;
            resource: IOIMAnyPersistResource<OIMIndexedDbPersistor>;
        }> = [];

        for (const resource of resources) {
            const snapshot = resource.takeSnapshot();
            const strategy =
                resource.strategy as TOIMIndexedDbBatchStrategy<unknown>;
            if (typeof strategy.tableNames !== 'undefined') {
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
            const allTables = new Set<string>();
            for (const { strategy } of batchItems) {
                for (const t of strategy.tableNames) allTables.add(t);
            }
            try {
                await this.storage.batchWrite(
                    Array.from(allTables),
                    stores => {
                        for (const { strategy, snapshot } of batchItems) {
                            strategy.writeInTx(stores, snapshot);
                        }
                    }
                );
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
