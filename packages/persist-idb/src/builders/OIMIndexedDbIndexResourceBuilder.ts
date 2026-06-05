import { TOIMPk } from '@oimdb/core';
import {
    createSetIndexSourceAdapter,
    OIMPersistResource,
    TOIMIndexPersistSnapshot,
} from '@oimdb/persist';
import type { OIMIndexedDbPersistor } from '../core/OIMIndexedDbPersistor';
import { createIndexedDbEntryStrategy } from '../strategies/createIndexedDbEntryStrategy';
import { TOIMIndexedDbEntryStrategyOptions } from '../types/TOIMIndexedDbEntryStrategyOptions';

export class OIMIndexedDbIndexResourceBuilder<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> {
    constructor(
        private readonly persistor: OIMIndexedDbPersistor,
        private readonly source: ReturnType<
            typeof createSetIndexSourceAdapter<TKey, TPk>
        >
    ) {}

    public entry(options: TOIMIndexedDbEntryStrategyOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: this.source,
                strategy: createIndexedDbEntryStrategy<
                    TOIMIndexPersistSnapshot<TKey, TPk>
                >(options),
            })
        );
    }
}
