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
import { OIMMemoryCollectionResourceBuilder } from '../builders/OIMMemoryCollectionResourceBuilder';
import { OIMMemoryIndexResourceBuilder } from '../builders/OIMMemoryIndexResourceBuilder';
import { OIMMemoryObjectResourceBuilder } from '../builders/OIMMemoryObjectResourceBuilder';
import { TOIMMemoryPersistStorage } from '../types/TOIMMemoryPersistStorage';
import { TOIMMemoryPersistorOptions } from '../types/TOIMMemoryPersistorOptions';
import { createMemoryPersistStorageRuntime } from '../utils/createMemoryPersistStorageRuntime';

export class OIMMemoryPersistor extends OIMPersistor<TOIMMemoryPersistStorage> {
    constructor(options: TOIMMemoryPersistorOptions = {}) {
        super({
            ...options,
            storage: options.storage ?? createMemoryPersistStorageRuntime(),
        });
    }

    public collection<TEntity extends object, TPk extends TOIMPk>(
        collection: TOIMCollectionPersistSource<TEntity, TPk>
    ): OIMMemoryCollectionResourceBuilder<TEntity, TPk> {
        return new OIMMemoryCollectionResourceBuilder(this, collection);
    }

    public object<TKey extends string, TValue>(
        object: TOIMObjectPersistSource<TKey, TValue>
    ): OIMMemoryObjectResourceBuilder<TKey, TValue> {
        return new OIMMemoryObjectResourceBuilder(this, object);
    }

    public setIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMSetIndexPersistSource<TKey, TPk>
    ): OIMMemoryIndexResourceBuilder<TKey, TPk> {
        return new OIMMemoryIndexResourceBuilder(
            this,
            createSetIndexSourceAdapter(index)
        );
    }

    public arrayIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMArrayIndexPersistSource<TKey, TPk>
    ): OIMMemoryIndexResourceBuilder<TKey, TPk> {
        return new OIMMemoryIndexResourceBuilder(
            this,
            createArrayIndexSourceAdapter(index)
        );
    }

    public orderedArrayIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMOrderedArrayIndexPersistSource<TKey, TPk>
    ): OIMMemoryIndexResourceBuilder<TKey, TPk> {
        return new OIMMemoryIndexResourceBuilder(
            this,
            createOrderedArrayIndexSourceAdapter(index)
        );
    }
}
