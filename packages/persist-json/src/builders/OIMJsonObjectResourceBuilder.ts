import {
    createObjectSourceAdapter,
    OIMPersistResource,
    TOIMObjectPersistSnapshot,
    TOIMObjectPersistSource,
} from '@oimdb/persist';
import type { OIMJsonPersistor } from '../core/OIMJsonPersistor';
import { createJsonEntryStrategy } from '../strategies/createJsonEntryStrategy';
import { TOIMJsonEntryStrategyOptions } from '../types/TOIMJsonEntryStrategyOptions';

export class OIMJsonObjectResourceBuilder<TKey extends string, TValue> {
    constructor(
        private readonly persistor: OIMJsonPersistor,
        private readonly object: TOIMObjectPersistSource<TKey, TValue>
    ) {}

    public entry(options: TOIMJsonEntryStrategyOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createObjectSourceAdapter(this.object),
                strategy: createJsonEntryStrategy<
                    TOIMObjectPersistSnapshot<TKey, TValue>
                >(options),
            })
        );
    }
}
