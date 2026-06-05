import { TOIMPk } from '@oimdb/core';
import {
    createArrayIndexSourceAdapter,
    createOrderedArrayIndexSourceAdapter,
    createSetIndexSourceAdapter,
    OIMPersistor,
    TOIMArrayIndexPersistSource,
    TOIMCollectionPersistSource,
    TOIMObjectPersistSource,
    TOIMOrderedArrayIndexPersistSource,
    TOIMSetIndexPersistSource,
} from '@oimdb/persist';
import { OIMJsonCollectionResourceBuilder } from '../builders/OIMJsonCollectionResourceBuilder';
import { OIMJsonIndexResourceBuilder } from '../builders/OIMJsonIndexResourceBuilder';
import { OIMJsonObjectResourceBuilder } from '../builders/OIMJsonObjectResourceBuilder';
import { TOIMJsonPersistStorage } from '../types/TOIMJsonPersistStorage';
import { TOIMJsonPersistorOptions } from '../types/TOIMJsonPersistorOptions';

/**
 * A persistor whose storage is a single plain, JSON-serializable object.
 * Designed as an SSR transport: register the same resources on server and
 * client, `persist()` on the server, `JSON.stringify(dehydrate())` into the
 * page, then seed the client persistor via `initial` and `hydrate()`.
 */
export class OIMJsonPersistor extends OIMPersistor<TOIMJsonPersistStorage> {
    constructor(options: TOIMJsonPersistorOptions = {}) {
        super({
            ...options,
            storage: { data: { ...(options.initial ?? {}) } },
        });
    }

    public collection<TEntity extends object, TPk extends TOIMPk>(
        collection: TOIMCollectionPersistSource<TEntity, TPk>
    ): OIMJsonCollectionResourceBuilder<TEntity, TPk> {
        return new OIMJsonCollectionResourceBuilder(this, collection);
    }

    public object<TKey extends string, TValue>(
        object: TOIMObjectPersistSource<TKey, TValue>
    ): OIMJsonObjectResourceBuilder<TKey, TValue> {
        return new OIMJsonObjectResourceBuilder(this, object);
    }

    public setIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMSetIndexPersistSource<TKey, TPk>
    ): OIMJsonIndexResourceBuilder<TKey, TPk> {
        return new OIMJsonIndexResourceBuilder(
            this,
            createSetIndexSourceAdapter(index)
        );
    }

    public arrayIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMArrayIndexPersistSource<TKey, TPk>
    ): OIMJsonIndexResourceBuilder<TKey, TPk> {
        return new OIMJsonIndexResourceBuilder(
            this,
            createArrayIndexSourceAdapter(index)
        );
    }

    public orderedArrayIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMOrderedArrayIndexPersistSource<TKey, TPk>
    ): OIMJsonIndexResourceBuilder<TKey, TPk> {
        return new OIMJsonIndexResourceBuilder(
            this,
            createOrderedArrayIndexSourceAdapter(index)
        );
    }

    /**
     * Returns the JSON-serializable dump of everything persisted so far.
     * Typically: `JSON.stringify(persistor.dehydrate())` on the server.
     */
    public dehydrate(): Record<string, unknown> {
        return this.storage.data;
    }
}
