import { TOIMPk } from '@oimdb/core';
import { OIMPersistor, TOIMPersistorOptions } from '../core/OIMPersistor';
import { OIMPersistResource } from '../core/OIMPersistResource';
import {
    createArrayIndexSourceAdapter,
    createCollectionSourceAdapter,
    createObjectSourceAdapter,
    createOrderedArrayIndexSourceAdapter,
    createSetIndexSourceAdapter,
    TOIMArrayIndexPersistSource,
    TOIMCollectionPersistSnapshot,
    TOIMCollectionPersistSource,
    TOIMIndexPersistSnapshot,
    TOIMObjectPersistSnapshot,
    TOIMObjectPersistSource,
    TOIMOrderedArrayIndexPersistSource,
    TOIMSetIndexPersistSource,
} from '../core/OIMSourceAdapters';
import {
    TOIMPersistCodec,
    TOIMPersistStrategy,
} from '../types/TOIMPersistResource';

export type TOIMMemoryPersistStorage = {
    entries: Map<string, unknown>;
    recordBuckets: Map<string, Map<TOIMPk, unknown>>;
};

export type TOIMMemoryPersistorOptions = Omit<
    TOIMPersistorOptions<TOIMMemoryPersistStorage>,
    'storage'
> & {
    storage?: TOIMMemoryPersistStorage;
};

export type TOIMMemoryEntryStrategyOptions = {
    bucketName?: string;
};

export type TOIMMemoryRecordsStrategyOptions = {
    bucketName?: string;
};

export class OIMMemoryPersistor extends OIMPersistor<TOIMMemoryPersistStorage> {
    constructor(options: TOIMMemoryPersistorOptions = {}) {
        super({
            ...options,
            storage: options.storage ?? createMemoryPersistStorageRuntime(),
        });
    }

    public collection<TEntity extends object, TPk extends TOIMPk>(
        collection: TOIMCollectionPersistSource<TEntity, TPk>
    ): OIMMemoryCollectionResourceBuilder<TEntity, TPk> {
        return new OIMMemoryCollectionResourceBuilder(this, collection);
    }

    public object<TKey extends string, TValue>(
        object: TOIMObjectPersistSource<TKey, TValue>
    ): OIMMemoryObjectResourceBuilder<TKey, TValue> {
        return new OIMMemoryObjectResourceBuilder(this, object);
    }

    public setIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMSetIndexPersistSource<TKey, TPk>
    ): OIMMemoryIndexResourceBuilder<TKey, TPk> {
        return new OIMMemoryIndexResourceBuilder(this, createSetIndexSourceAdapter(index));
    }

    public arrayIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMArrayIndexPersistSource<TKey, TPk>
    ): OIMMemoryIndexResourceBuilder<TKey, TPk> {
        return new OIMMemoryIndexResourceBuilder(this, createArrayIndexSourceAdapter(index));
    }

    public orderedArrayIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMOrderedArrayIndexPersistSource<TKey, TPk>
    ): OIMMemoryIndexResourceBuilder<TKey, TPk> {
        return new OIMMemoryIndexResourceBuilder(this, createOrderedArrayIndexSourceAdapter(index));
    }
}

export function createMemoryPersistor(
    options: TOIMMemoryPersistorOptions = {}
): OIMMemoryPersistor {
    return new OIMMemoryPersistor(options);
}

export function createMemoryPersistStorageRuntime(): TOIMMemoryPersistStorage {
    return {
        entries: new Map(),
        recordBuckets: new Map(),
    };
}

export class OIMMemoryCollectionResourceBuilder<
    TEntity extends object,
    TPk extends TOIMPk,
> {
    constructor(
        private readonly persistor: OIMMemoryPersistor,
        private readonly collection: TOIMCollectionPersistSource<TEntity, TPk>
    ) {}

    public entry(
        options: TOIMMemoryEntryStrategyOptions = {},
        codec?: TOIMPersistCodec<TOIMCollectionPersistSnapshot<TPk, TEntity>, unknown>
    ) {
        return this.persistor.addResource(new OIMPersistResource({
            source: createCollectionSourceAdapter(this.collection),
            strategy: createMemoryEntryStrategy(options),
            codec,
        }));
    }

    public records(options: TOIMMemoryRecordsStrategyOptions = {}) {
        return this.persistor.addResource(new OIMPersistResource({
            source: createCollectionSourceAdapter(this.collection),
            strategy: createMemoryCollectionRecordsStrategy<TPk, TEntity>(options),
        }));
    }

    public using<TPersistedSnapshot>(
        strategy: TOIMPersistStrategy<OIMMemoryPersistor, TPersistedSnapshot>,
        codec?: TOIMPersistCodec<TOIMCollectionPersistSnapshot<TPk, TEntity>, TPersistedSnapshot>
    ) {
        return this.persistor.addResource(new OIMPersistResource({
            source: createCollectionSourceAdapter(this.collection),
            strategy,
            codec,
        }));
    }
}

export class OIMMemoryObjectResourceBuilder<TKey extends string, TValue> {
    constructor(
        private readonly persistor: OIMMemoryPersistor,
        private readonly object: TOIMObjectPersistSource<TKey, TValue>
    ) {}

    public entry(options: TOIMMemoryEntryStrategyOptions = {}) {
        return this.persistor.addResource(new OIMPersistResource({
            source: createObjectSourceAdapter(this.object),
            strategy: createMemoryEntryStrategy<TOIMObjectPersistSnapshot<TKey, TValue>>(options),
        }));
    }
}

export class OIMMemoryIndexResourceBuilder<TKey extends TOIMPk, TPk extends TOIMPk> {
    constructor(
        private readonly persistor: OIMMemoryPersistor,
        private readonly source: ReturnType<typeof createSetIndexSourceAdapter<TKey, TPk>>
    ) {}

    public entry(options: TOIMMemoryEntryStrategyOptions = {}) {
        return this.persistor.addResource(new OIMPersistResource({
            source: this.source,
            strategy: createMemoryEntryStrategy<TOIMIndexPersistSnapshot<TKey, TPk>>(options),
        }));
    }
}

export function createMemoryEntryStrategy<TSnapshot>(
    options: TOIMMemoryEntryStrategyOptions = {}
): TOIMPersistStrategy<OIMMemoryPersistor, TSnapshot> {
    const bucketName = options.bucketName ?? 'default';
    return {
        async read(persistor) {
            return persistor.storage.entries.get(bucketName) as TSnapshot | undefined;
        },
        async write(persistor, snapshot) {
            persistor.storage.entries.set(bucketName, snapshot);
        },
        async clear(persistor) {
            persistor.storage.entries.delete(bucketName);
        },
    };
}

export function createMemoryCollectionRecordsStrategy<TPk extends TOIMPk, TEntity>(
    options: TOIMMemoryRecordsStrategyOptions = {}
): TOIMPersistStrategy<OIMMemoryPersistor, TOIMCollectionPersistSnapshot<TPk, TEntity>> {
    const bucketName = options.bucketName ?? 'default';
    return {
        async read(persistor) {
            const bucket = persistor.storage.recordBuckets.get(bucketName);
            if (!bucket) return undefined;
            return {
                records: Array.from(bucket, ([pk, value]) => ({
                    pk: pk as TPk,
                    value: value as TEntity,
                })),
            };
        },
        async write(persistor, snapshot) {
            const bucket = new Map<TOIMPk, unknown>();
            for (let i = 0; i < snapshot.records.length; i++) {
                bucket.set(snapshot.records[i].pk, snapshot.records[i].value);
            }
            persistor.storage.recordBuckets.set(bucketName, bucket);
        },
        async clear(persistor) {
            persistor.storage.recordBuckets.delete(bucketName);
        },
    };
}
