import {
    createObjectSourceAdapter,
    OIMPersistResource,
    TOIMObjectPersistSnapshot,
    TOIMObjectPersistSource,
} from '@oimdb/persist';
import type { OIMIndexedDbPersistor } from '../core/OIMIndexedDbPersistor';
import { createIndexedDbEntryStrategy } from '../strategies/createIndexedDbEntryStrategy';
import { TOIMIndexedDbEntryStrategyOptions } from '../types/TOIMIndexedDbEntryStrategyOptions';

export class OIMIndexedDbObjectResourceBuilder<
    TKey extends string,
    TValue,
> {
    constructor(
        private readonly persistor: OIMIndexedDbPersistor,
        private readonly object: TOIMObjectPersistSource<TKey, TValue>
    ) {}

    public entry(options: TOIMIndexedDbEntryStrategyOptions) {
        return this.persistor.addResource(
            new OIMPersistResource({
                source: createObjectSourceAdapter(this.object),
                strategy: createIndexedDbEntryStrategy<
                    TOIMObjectPersistSnapshot<TKey, TValue>
                >(options),
            })
        );
    }
}
