import { TOIMKey } from './TOIMKey';
import type { OIMCollectionIndexFactory } from '../core/OIMCollectionIndexFactory';
import type { OIMEventQueue } from '../core/OIMEventQueue';
import type { OIMReactiveCollection } from '../core/OIMReactiveCollection';
import type { OIMCollectionSelectors } from '../dx/OIMCollectionSelectors';
import type { TOIMCollectionOptions } from './TOIMCollectionOptions';
import type { TOIMPk } from './TOIMPk';

export type TOIMReactiveCollectionFactoryOptions<
    TEntity extends object,
    TPk extends TOIMKey,
> = TOIMCollectionOptions<TEntity, TPk>;

export type TOIMCollectionModel<
    TEntity extends object,
    TPk extends TOIMKey,
> = {
    queue: OIMEventQueue;
    collection: OIMReactiveCollection<TEntity, TPk>;
    indexFactory: OIMCollectionIndexFactory<TEntity, TPk>;
    select: OIMCollectionSelectors<TEntity, TPk>;
};
