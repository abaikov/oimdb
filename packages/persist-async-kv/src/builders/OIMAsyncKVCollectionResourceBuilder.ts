import { TOIMPk } from '@oimdb/core';
import {
    createCollectionSourceAdapter,
    OIMPersistResource,
    TOIMCollectionPersistSnapshot,
    TOIMCollectionPersistSource,
    TOIMPersistStrategy,
} from '@oimdb/persist';
import type { OIMAsyncKVPersistor } from '../core/OIMAsyncKVPersistor';
import { createAsyncKVEntryStrategy } from '../strategies/createAsyncKVEntryStrategy';
import { createAsyncKVPathStrategy } from '../strategies/createAsyncKVPathStrategy';
import { TOIMAsyncKVEntryOptions } from '../types/TOIMAsyncKVEntryOptions';
import { TOIMAsyncKVPathOptions } from '../types/TOIMAsyncKVPathOptions';

export class OIMAsyncKVCollectionResourceBuilder<
    TEntity extends object,
    TPk extends TOIMPk,
> {
    constructor(
        private readonly persistor: OIMAsyncKVPersistor,
        private readonly collection: TOIMCollectionPersistSource<TEntity, TPk>
    ) {}

    public entry(options: TOIMAsyncKVEntryOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(this.collection),
                strategy: createAsyncKVEntryStrategy<
                    TOIMCollectionPersistSnapshot<TPk, TEntity>
                >(options),
            })
        );
    }

    public path(options: TOIMAsyncKVPathOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(this.collection),
                strategy: createAsyncKVPathStrategy<
                    TOIMCollectionPersistSnapshot<TPk, TEntity>
                >(options),
            })
        );
    }

    public using<TPersistedSnapshot>(
        strategy: TOIMPersistStrategy<OIMAsyncKVPersistor, TPersistedSnapshot>
    ) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(this.collection),
                strategy,
            })
        );
    }
}
