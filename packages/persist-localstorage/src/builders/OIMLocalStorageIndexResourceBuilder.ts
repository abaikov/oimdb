import { TOIMPk } from '@oimdb/core';
import {
    createSetIndexSourceAdapter,
    OIMPersistResource,
    TOIMIndexPersistSnapshot,
} from '@oimdb/persist';
import type { OIMLocalStoragePersistor } from '../core/OIMLocalStoragePersistor';
import { createLocalStorageEntryStrategy } from '../strategies/createLocalStorageEntryStrategy';
import { createLocalStoragePathStrategy } from '../strategies/createLocalStoragePathStrategy';
import { TOIMLocalStorageEntryOptions } from '../types/TOIMLocalStorageEntryOptions';
import { TOIMLocalStoragePathOptions } from '../types/TOIMLocalStoragePathOptions';

export class OIMLocalStorageIndexResourceBuilder<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> {
    constructor(
        private readonly persistor: OIMLocalStoragePersistor,
        private readonly source: ReturnType<
            typeof createSetIndexSourceAdapter<TKey, TPk>
        >
    ) {}

    public entry(options: TOIMLocalStorageEntryOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: this.source,
                strategy: createLocalStorageEntryStrategy<
                    TOIMIndexPersistSnapshot<TKey, TPk>
                >(options),
            })
        );
    }

    public path(options: TOIMLocalStoragePathOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: this.source,
                strategy: createLocalStoragePathStrategy<
                    TOIMIndexPersistSnapshot<TKey, TPk>
                >(options),
            })
        );
    }
}
