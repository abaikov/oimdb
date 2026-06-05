import { TOIMPk } from '@oimdb/core';
import {
    createSetIndexSourceAdapter,
    OIMPersistResource,
    TOIMIndexPersistSnapshot,
} from '@oimdb/persist';
import type { OIMMemoryPersistor } from '../core/OIMMemoryPersistor';
import { createMemoryEntryStrategy } from '../strategies/createMemoryEntryStrategy';
import { TOIMMemoryEntryStrategyOptions } from '../types/TOIMMemoryEntryStrategyOptions';

export class OIMMemoryIndexResourceBuilder<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> {
    constructor(
        private readonly persistor: OIMMemoryPersistor,
        private readonly source: ReturnType<
            typeof createSetIndexSourceAdapter<TKey, TPk>
        >
    ) {}

    public entry(options: TOIMMemoryEntryStrategyOptions = {}) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: this.source,
                strategy: createMemoryEntryStrategy<
                    TOIMIndexPersistSnapshot<TKey, TPk>
                >(options),
            })
        );
    }
}
