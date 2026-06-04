import { OIMCollectionIndexFactory } from '../core/OIMCollectionIndexFactory';
import { OIMEventQueue } from '../core/OIMEventQueue';
import { OIMReactiveCollection } from '../core/OIMReactiveCollection';
import { OIMCollectionSelectors } from './OIMCollectionSelectors';
import {
    TOIMCollectionKit,
    TOIMReactiveCollectionFactoryOptions,
} from '../types/TOIMCollectionKit';
import { TOIMPk } from '../types/TOIMPk';

export function createOIMCollectionKit<
    TEntity extends object,
    TPk extends TOIMPk,
>(
    queue: OIMEventQueue,
    opts?: TOIMReactiveCollectionFactoryOptions<TEntity, TPk>
): TOIMCollectionKit<TEntity, TPk> {
    const collection = new OIMReactiveCollection<TEntity, TPk>(queue, opts);
    const indexFactory = new OIMCollectionIndexFactory(queue, collection);
    const select = new OIMCollectionSelectors(queue, collection);

    return { queue, collection, indexFactory, select };
}
