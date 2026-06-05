import {
    createObjectSourceAdapter,
    OIMPersistResource,
    TOIMObjectPersistSnapshot,
    TOIMObjectPersistSource,
} from '@oimdb/persist';
import type { OIMMemoryPersistor } from '../core/OIMMemoryPersistor';
import { createMemoryEntryStrategy } from '../strategies/createMemoryEntryStrategy';
import { TOIMMemoryEntryStrategyOptions } from '../types/TOIMMemoryEntryStrategyOptions';

export class OIMMemoryObjectResourceBuilder<TKey extends string, TValue> {
    constructor(
        private readonly persistor: OIMMemoryPersistor,
        private readonly object: TOIMObjectPersistSource<TKey, TValue>
    ) {}

    public entry(options: TOIMMemoryEntryStrategyOptions = {}) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createObjectSourceAdapter(this.object),
                strategy: createMemoryEntryStrategy<
                    TOIMObjectPersistSnapshot<TKey, TValue>
                >(options),
            })
        );
    }
}
