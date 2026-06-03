import type { OIMCollectionIndexFactory } from '../core/OIMCollectionIndexFactory';
import type { OIMEventQueue } from '../core/OIMEventQueue';
import type { OIMReactiveCollection } from '../core/OIMReactiveCollection';
import type { OIMCollectionSelectors } from '../dx/OIMCollectionSelectors';
import type { TOIMCollectionOptions } from './TOIMCollectionOptions';
import type { TOIMPk } from './TOIMPk';

export type TOIMReactiveCollectionFactoryOptions<
    TEntity extends object,
    TPk extends TOIMPk,
> = TOIMCollectionOptions<TEntity, TPk>;

export type TOIMCollectionContext<
    TEntity extends object,
    TPk extends TOIMPk,
> = {
    queue: OIMEventQueue;
    collection: OIMReactiveCollection<TEntity, TPk>;
    indexFactory: OIMCollectionIndexFactory<TEntity, TPk>;
    select: OIMCollectionSelectors<TEntity, TPk>;
};
