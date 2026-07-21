import { TOIMKey } from './TOIMKey';
import type { OIMCollectionIndexFactory } from '../core/OIMCollectionIndexFactory';
import type { OIMEventQueue } from '../core/OIMEventQueue';
import type { OIMReactiveCollection } from '../core/OIMReactiveCollection';
import type { OIMDisposeScope } from '../core/OIMDisposeScope';
import type { OIMCollectionSelectors } from '../dx/OIMCollectionSelectors';
import type { TOIMCollectionOptions } from './TOIMCollectionOptions';
import type { TOIMPk } from './TOIMPk';

export type TOIMReactiveCollectionFactoryOptions<
    TEntity extends object,
    TPk extends TOIMKey,
> = TOIMCollectionOptions<TEntity, TPk>;

export type TOIMCollectionKit<
    TEntity extends object,
    TPk extends TOIMKey,
> = {
    queue: OIMEventQueue;
    collection: OIMReactiveCollection<TEntity, TPk>;
    indexFactory: OIMCollectionIndexFactory<TEntity, TPk>;
    select: OIMCollectionSelectors<TEntity, TPk>;
    /**
     * Dispose scope owning the kit's collection. `add()` indexes/streams/
     * subscriptions you create off the kit, then `destroy()` tears them all down
     * in reverse order. Does NOT own the `queue` (it is passed in and may be
     * shared) — destroy the queue yourself when nothing else uses it.
     */
    scope: OIMDisposeScope;
    /** Tear down the kit's scope (collection + everything added to it). */
    destroy: () => void;
};
