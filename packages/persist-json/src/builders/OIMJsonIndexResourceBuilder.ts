import { TOIMPk } from '@oimdb/core';
import {
    createSetIndexSourceAdapter,
    OIMPersistResource,
    TOIMIndexPersistSnapshot,
} from '@oimdb/persist';
import type { OIMJsonPersistor } from '../core/OIMJsonPersistor';
import { createJsonEntryStrategy } from '../strategies/createJsonEntryStrategy';
import { TOIMJsonEntryStrategyOptions } from '../types/TOIMJsonEntryStrategyOptions';

export class OIMJsonIndexResourceBuilder<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> {
    constructor(
        private readonly persistor: OIMJsonPersistor,
        private readonly source: ReturnType<
            typeof createSetIndexSourceAdapter<TKey, TPk>
        >
    ) {}

    public entry(options: TOIMJsonEntryStrategyOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: this.source,
                strategy: createJsonEntryStrategy<
                    TOIMIndexPersistSnapshot<TKey, TPk>
                >(options),
            })
        );
    }
}
