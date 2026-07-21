import { TOIMKey } from '../types/TOIMKey';
import { OIMCollectionIndexFactory } from '../core/OIMCollectionIndexFactory';
import { OIMEventQueue } from '../core/OIMEventQueue';
import { OIMReactiveCollection } from '../core/OIMReactiveCollection';
import { OIMDisposeScope } from '../core/OIMDisposeScope';
import { OIMCollectionSelectors } from './OIMCollectionSelectors';
import {
    TOIMCollectionKit,
    TOIMReactiveCollectionFactoryOptions,
} from '../types/TOIMCollectionKit';
import { TOIMPk } from '../types/TOIMPk';

export function createOIMCollectionKit<
    TEntity extends object,
    TPk extends TOIMKey,
>(
    queue: OIMEventQueue,
    opts?: TOIMReactiveCollectionFactoryOptions<TEntity, TPk>
): TOIMCollectionKit<TEntity, TPk> {
    const collection = new OIMReactiveCollection<TEntity, TPk>(queue, opts);
    const indexFactory = new OIMCollectionIndexFactory(queue, collection);
    const select = new OIMCollectionSelectors(queue, collection);

    // The scope owns the collection (created here) but NOT the queue (passed in,
    // possibly shared). Register the collection first so it disposes LAST — after
    // any indexes/subscriptions the caller adds to the scope.
    const scope = new OIMDisposeScope();
    scope.add(collection);

    return {
        queue,
        collection,
        indexFactory,
        select,
        scope,
        destroy: () => scope.destroy(),
    };
}
