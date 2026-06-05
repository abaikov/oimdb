import {
    createObjectSourceAdapter,
    OIMPersistResource,
    TOIMObjectPersistSnapshot,
    TOIMObjectPersistSource,
} from '@oimdb/persist';
import type { OIMLocalStoragePersistor } from '../core/OIMLocalStoragePersistor';
import { createLocalStorageEntryStrategy } from '../strategies/createLocalStorageEntryStrategy';
import { createLocalStoragePathStrategy } from '../strategies/createLocalStoragePathStrategy';
import { TOIMLocalStorageEntryOptions } from '../types/TOIMLocalStorageEntryOptions';
import { TOIMLocalStoragePathOptions } from '../types/TOIMLocalStoragePathOptions';

export class OIMLocalStorageObjectResourceBuilder<
    TKey extends string,
    TValue,
> {
    constructor(
        private readonly persistor: OIMLocalStoragePersistor,
        private readonly object: TOIMObjectPersistSource<TKey, TValue>
    ) {}

    public entry(options: TOIMLocalStorageEntryOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createObjectSourceAdapter(this.object),
                strategy: createLocalStorageEntryStrategy<
                    TOIMObjectPersistSnapshot<TKey, TValue>
                >(options),
            })
        );
    }

    public path(options: TOIMLocalStoragePathOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createObjectSourceAdapter(this.object),
                strategy: createLocalStoragePathStrategy<
                    TOIMObjectPersistSnapshot<TKey, TValue>
                >(options),
            })
        );
    }
}
