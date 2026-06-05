import { TOIMPk } from '@oimdb/core';
import {
    createCollectionSourceAdapter,
    OIMPersistResource,
    TOIMCollectionPersistSnapshot,
    TOIMCollectionPersistSource,
    TOIMPersistCodec,
    TOIMPersistStrategy,
} from '@oimdb/persist';
import type { OIMMemoryPersistor } from '../core/OIMMemoryPersistor';
import { createMemoryCollectionRecordsStrategy } from '../strategies/createMemoryCollectionRecordsStrategy';
import { createMemoryEntryStrategy } from '../strategies/createMemoryEntryStrategy';
import { TOIMMemoryEntryStrategyOptions } from '../types/TOIMMemoryEntryStrategyOptions';
import { TOIMMemoryRecordsStrategyOptions } from '../types/TOIMMemoryRecordsStrategyOptions';

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
        codec?: TOIMPersistCodec<
            TOIMCollectionPersistSnapshot<TPk, TEntity>,
            unknown
        >
    ) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(this.collection),
                strategy: createMemoryEntryStrategy(options),
                codec,
            })
        );
    }

    public records(options: TOIMMemoryRecordsStrategyOptions = {}) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(this.collection),
                strategy: createMemoryCollectionRecordsStrategy<TPk, TEntity>(
                    options
                ),
            })
        );
    }

    public using<TPersistedSnapshot>(
        strategy: TOIMPersistStrategy<OIMMemoryPersistor, TPersistedSnapshot>,
        codec?: TOIMPersistCodec<
            TOIMCollectionPersistSnapshot<TPk, TEntity>,
            TPersistedSnapshot
        >
    ) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(this.collection),
                strategy,
                codec,
            })
        );
    }
}
