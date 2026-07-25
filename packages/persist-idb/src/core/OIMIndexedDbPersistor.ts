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
    TOIMPersistBatchItem,
    TOIMPersistDelta,
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
     *
     * Each batchable resource writes either a full snapshot (`writeInTx`) or,
     * when only some keys changed and its strategy supports it, just those keys
     * (`writeDeltaInTx`) — so a single-record change no longer clears and
     * rewrites the whole table.
     */
    protected override async batchPersist(
        items: readonly TOIMPersistBatchItem<this>[]
    ): Promise<void> {
        const batchFull: Array<{
            strategy: TOIMIndexedDbBatchStrategy<unknown>;
            snapshot: unknown;
            resource: IOIMAnyPersistResource<OIMIndexedDbPersistor>;
        }> = [];
        const batchDelta: Array<{
            strategy: TOIMIndexedDbBatchStrategy<unknown>;
            delta: TOIMPersistDelta<unknown, unknown>;
            resource: IOIMAnyPersistResource<OIMIndexedDbPersistor>;
        }> = [];
        const fallbackItems: Array<{
            resource: IOIMAnyPersistResource<OIMIndexedDbPersistor>;
            dirty: 'all' | readonly unknown[];
        }> = [];

        for (const { resource, dirty } of items) {
            const strategy =
                resource.strategy as TOIMIndexedDbBatchStrategy<unknown>;
            if (typeof strategy.tableNames === 'undefined') {
                fallbackItems.push({ resource, dirty });
                continue;
            }
            if (
                dirty !== 'all' &&
                resource.supportsDelta() &&
                typeof strategy.writeDeltaInTx === 'function'
            ) {
                batchDelta.push({
                    strategy,
                    delta: resource.takeDelta(dirty) as TOIMPersistDelta<
                        unknown,
                        unknown
                    >,
                    resource,
                });
            } else {
                batchFull.push({
                    strategy,
                    snapshot: resource.takeSnapshot(),
                    resource,
                });
            }
        }

        if (batchFull.length > 0 || batchDelta.length > 0) {
            const allTables = new Set<string>();
            for (const { strategy } of batchFull) {
                for (const t of strategy.tableNames) allTables.add(t);
            }
            for (const { strategy } of batchDelta) {
                for (const t of strategy.tableNames) allTables.add(t);
            }
            try {
                await this.storage.batchWrite(
                    Array.from(allTables),
                    stores => {
                        for (const { strategy, snapshot } of batchFull) {
                            strategy.writeInTx(stores, snapshot);
                        }
                        for (const { strategy, delta } of batchDelta) {
                            strategy.writeDeltaInTx!(stores, delta);
                        }
                    }
                );
            } catch (error) {
                if (this.onError) {
                    for (const { resource } of batchFull) {
                        this.onError(error, { resource, operation: 'persist' });
                    }
                    for (const { resource } of batchDelta) {
                        this.onError(error, { resource, operation: 'persist' });
                    }
                } else {
                    throw error;
                }
            }
        }

        // Custom `.using()` strategies without the batch interface: reuse the
        // base per-resource write (delta when supported, else full snapshot).
        for (const { resource, dirty } of fallbackItems) {
            try {
                await this.writeResource(resource, dirty);
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
