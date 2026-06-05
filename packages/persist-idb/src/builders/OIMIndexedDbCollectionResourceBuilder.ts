import { TOIMPk } from '@oimdb/core';
import {
    createCollectionSourceAdapter,
    OIMPersistResource,
    TOIMCollectionPersistSnapshot,
    TOIMCollectionPersistSource,
    TOIMPersistStrategy,
} from '@oimdb/persist';
import type { OIMIndexedDbPersistor } from '../core/OIMIndexedDbPersistor';
import { createIndexedDbCollectionRecordsStrategy } from '../strategies/createIndexedDbCollectionRecordsStrategy';
import { createIndexedDbEntryStrategy } from '../strategies/createIndexedDbEntryStrategy';
import { TOIMIndexedDbEntryStrategyOptions } from '../types/TOIMIndexedDbEntryStrategyOptions';
import { TOIMIndexedDbRecordsStrategyOptions } from '../types/TOIMIndexedDbRecordsStrategyOptions';

export class OIMIndexedDbCollectionResourceBuilder<
    TEntity extends object,
    TPk extends TOIMPk,
> {
    constructor(
        private readonly persistor: OIMIndexedDbPersistor,
        private readonly collection: TOIMCollectionPersistSource<TEntity, TPk>
    ) {}

    public entry(options: TOIMIndexedDbEntryStrategyOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(this.collection),
                strategy: createIndexedDbEntryStrategy<
                    TOIMCollectionPersistSnapshot<TPk, TEntity>
                >(options),
            })
        );
    }

    public records(options: TOIMIndexedDbRecordsStrategyOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(this.collection),
                strategy: createIndexedDbCollectionRecordsStrategy<
                    TPk,
                    TEntity
                >(options),
            })
        );
    }

    public using<TPersistedSnapshot>(
        strategy: TOIMPersistStrategy<
            OIMIndexedDbPersistor,
            TPersistedSnapshot
        >
    ) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(this.collection),
                strategy,
            })
        );
    }
}
