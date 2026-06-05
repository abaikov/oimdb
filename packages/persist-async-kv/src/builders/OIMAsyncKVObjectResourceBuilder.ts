import {
    createObjectSourceAdapter,
    OIMPersistResource,
    TOIMObjectPersistSnapshot,
    TOIMObjectPersistSource,
} from '@oimdb/persist';
import type { OIMAsyncKVPersistor } from '../core/OIMAsyncKVPersistor';
import { createAsyncKVEntryStrategy } from '../strategies/createAsyncKVEntryStrategy';
import { createAsyncKVPathStrategy } from '../strategies/createAsyncKVPathStrategy';
import { TOIMAsyncKVEntryOptions } from '../types/TOIMAsyncKVEntryOptions';
import { TOIMAsyncKVPathOptions } from '../types/TOIMAsyncKVPathOptions';

export class OIMAsyncKVObjectResourceBuilder<TKey extends string, TValue> {
    constructor(
        private readonly persistor: OIMAsyncKVPersistor,
        private readonly object: TOIMObjectPersistSource<TKey, TValue>
    ) {}

    public entry(options: TOIMAsyncKVEntryOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createObjectSourceAdapter(this.object),
                strategy: createAsyncKVEntryStrategy<
                    TOIMObjectPersistSnapshot<TKey, TValue>
                >(options),
            })
        );
    }

    public path(options: TOIMAsyncKVPathOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createObjectSourceAdapter(this.object),
                strategy: createAsyncKVPathStrategy<
                    TOIMObjectPersistSnapshot<TKey, TValue>
                >(options),
            })
        );
    }
}
