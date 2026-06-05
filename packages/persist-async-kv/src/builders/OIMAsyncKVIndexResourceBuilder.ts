import { TOIMPk } from '@oimdb/core';
import {
    createSetIndexSourceAdapter,
    OIMPersistResource,
    TOIMIndexPersistSnapshot,
} from '@oimdb/persist';
import type { OIMAsyncKVPersistor } from '../core/OIMAsyncKVPersistor';
import { createAsyncKVEntryStrategy } from '../strategies/createAsyncKVEntryStrategy';
import { createAsyncKVPathStrategy } from '../strategies/createAsyncKVPathStrategy';
import { TOIMAsyncKVEntryOptions } from '../types/TOIMAsyncKVEntryOptions';
import { TOIMAsyncKVPathOptions } from '../types/TOIMAsyncKVPathOptions';

export class OIMAsyncKVIndexResourceBuilder<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> {
    constructor(
        private readonly persistor: OIMAsyncKVPersistor,
        private readonly source: ReturnType<
            typeof createSetIndexSourceAdapter<TKey, TPk>
        >
    ) {}

    public entry(options: TOIMAsyncKVEntryOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: this.source,
                strategy: createAsyncKVEntryStrategy<
                    TOIMIndexPersistSnapshot<TKey, TPk>
                >(options),
            })
        );
    }

    public path(options: TOIMAsyncKVPathOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: this.source,
                strategy: createAsyncKVPathStrategy<
                    TOIMIndexPersistSnapshot<TKey, TPk>
                >(options),
            })
        );
    }
}
