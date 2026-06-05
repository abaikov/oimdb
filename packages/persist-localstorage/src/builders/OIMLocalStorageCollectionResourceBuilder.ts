import { TOIMPk } from '@oimdb/core';
import {
    createCollectionSourceAdapter,
    OIMPersistResource,
    TOIMCollectionPersistSnapshot,
    TOIMCollectionPersistSource,
    TOIMPersistStrategy,
} from '@oimdb/persist';
import type { OIMLocalStoragePersistor } from '../core/OIMLocalStoragePersistor';
import { createLocalStorageEntryStrategy } from '../strategies/createLocalStorageEntryStrategy';
import { createLocalStoragePathStrategy } from '../strategies/createLocalStoragePathStrategy';
import { TOIMLocalStorageEntryOptions } from '../types/TOIMLocalStorageEntryOptions';
import { TOIMLocalStoragePathOptions } from '../types/TOIMLocalStoragePathOptions';

export class OIMLocalStorageCollectionResourceBuilder<
    TEntity extends object,
    TPk extends TOIMPk,
> {
    constructor(
        private readonly persistor: OIMLocalStoragePersistor,
        private readonly collection: TOIMCollectionPersistSource<TEntity, TPk>
    ) {}

    public entry(options: TOIMLocalStorageEntryOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(this.collection),
                strategy: createLocalStorageEntryStrategy<
                    TOIMCollectionPersistSnapshot<TPk, TEntity>
                >(options),
            })
        );
    }

    public path(options: TOIMLocalStoragePathOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(this.collection),
                strategy: createLocalStoragePathStrategy<
                    TOIMCollectionPersistSnapshot<TPk, TEntity>
                >(options),
            })
        );
    }

    public using<TPersistedSnapshot>(
        strategy: TOIMPersistStrategy<
            OIMLocalStoragePersistor,
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
