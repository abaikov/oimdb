import { TOIMPk } from '@oimdb/core';
import {
    createCollectionSourceAdapter,
    OIMPersistResource,
    TOIMCollectionPersistSnapshot,
    TOIMCollectionPersistSource,
    TOIMPersistCodec,
    TOIMPersistStrategy,
} from '@oimdb/persist';
import type { OIMJsonPersistor } from '../core/OIMJsonPersistor';
import { createJsonEntryStrategy } from '../strategies/createJsonEntryStrategy';
import { TOIMJsonEntryStrategyOptions } from '../types/TOIMJsonEntryStrategyOptions';

export class OIMJsonCollectionResourceBuilder<
    TEntity extends object,
    TPk extends TOIMPk,
> {
    constructor(
        private readonly persistor: OIMJsonPersistor,
        private readonly collection: TOIMCollectionPersistSource<TEntity, TPk>
    ) {}

    public entry(
        options: TOIMJsonEntryStrategyOptions,
        codec?: TOIMPersistCodec<
            TOIMCollectionPersistSnapshot<TPk, TEntity>,
            unknown
        >
    ) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(this.collection),
                strategy: createJsonEntryStrategy(options),
                codec,
            })
        );
    }

    public using<TPersistedSnapshot>(
        strategy: TOIMPersistStrategy<OIMJsonPersistor, TPersistedSnapshot>,
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
