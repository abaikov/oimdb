import { TOIMKey } from './TOIMKey';
import type { OIMCollectionIndexFactory } from '../core/OIMCollectionIndexFactory';
import type { OIMEventQueue } from '../core/OIMEventQueue';
import type { OIMReactiveCollection } from '../core/OIMReactiveCollection';
import type { OIMDisposeScope } from '../core/OIMDisposeScope';
import type { OIMCollectionSelectors } from '../dx/OIMCollectionSelectors';
import type { on } from '../dx/on';
import type { OIMComputed } from '../modules/computed/core/OIMComputed';
import type { OIMEffect } from '../modules/effect/core/OIMEffect';
import type { IOIMEffectDependency } from '../modules/effect/interfaces/IOIMEffectDependency';
import type { TOIMCollectionOptions } from './TOIMCollectionOptions';

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
    /** Dependency builders for `computed` / `effect` (no manual wrapper classes). */
    on: typeof on;
    /**
     * Create a computed on the queue's shared runtime and add it to `scope`.
     * Deps come from `on.*` and may reference any source sharing the queue.
     */
    computed: <TValue>(
        deps: readonly IOIMEffectDependency[],
        compute: () => TValue,
        options?: { compare?: (a: TValue, b: TValue) => boolean }
    ) => OIMComputed<TValue>;
    /** Create an effect on the queue's shared runtime and add it to `scope`. */
    effect: (
        deps: readonly IOIMEffectDependency[],
        run: () => void,
        options?: { onUpdate?: () => void }
    ) => OIMEffect;
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
