import { OIMCollectionIndexFactory } from '../core/OIMCollectionIndexFactory';
import { OIMEventQueue } from '../core/OIMEventQueue';
import { OIMReactiveCollection } from '../core/OIMReactiveCollection';
import { OIMCollectionSelectors } from './OIMCollectionSelectors';
import {
    TOIMCollectionModel,
    TOIMReactiveCollectionFactoryOptions,
} from '../types/TOIMCollectionModel';
import { TOIMPk } from '../types/TOIMPk';

export function createOIMReactiveCollection<
    TEntity extends object,
    TPk extends TOIMPk,
>(
    queue: OIMEventQueue,
    opts?: TOIMReactiveCollectionFactoryOptions<TEntity, TPk>
): OIMReactiveCollection<TEntity, TPk> {
    return new OIMReactiveCollection<TEntity, TPk>(queue, opts);
}

export function createOIMCollectionModel<
    TEntity extends object,
    TPk extends TOIMPk,
>(
    queue: OIMEventQueue,
    opts?: TOIMReactiveCollectionFactoryOptions<TEntity, TPk>
): TOIMCollectionModel<TEntity, TPk> {
    const collection = createOIMReactiveCollection<TEntity, TPk>(queue, opts);
    const indexFactory = new OIMCollectionIndexFactory(queue, collection);
    const select = new OIMCollectionSelectors(queue, collection);

    return {
        queue,
        collection,
        indexFactory,
        select,
    };
}
