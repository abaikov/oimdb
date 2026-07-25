import { TOIMKey } from '../types/TOIMKey';
import { OIMCollectionIndexFactory } from '../core/OIMCollectionIndexFactory';
import { OIMEventQueue } from '../core/OIMEventQueue';
import { OIMReactiveCollection } from '../core/OIMReactiveCollection';
import { OIMDisposeScope } from '../core/OIMDisposeScope';
import { OIMCollectionSelectors } from './OIMCollectionSelectors';
import { getOIMComputeRuntime } from './getOIMComputeRuntime';
import { on } from './on';
import { OIMComputed } from '../modules/computed/core/OIMComputed';
import { OIMEffect } from '../modules/effect/core/OIMEffect';
import { IOIMEffectDependency } from '../modules/effect/interfaces/IOIMEffectDependency';
import {
    TOIMCollectionKit,
    TOIMReactiveCollectionFactoryOptions,
} from '../types/TOIMCollectionKit';

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
    // Shared per queue → computeds/effects here can depend on selectors and on
    // any other collection/index/computed sharing the same queue.
    const runtime = getOIMComputeRuntime(queue);

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
        on,
        computed: <TValue>(
            deps: readonly IOIMEffectDependency[],
            compute: () => TValue,
            options?: { compare?: (a: TValue, b: TValue) => boolean }
        ): OIMComputed<TValue> => {
            const computed = new OIMComputed<TValue>(runtime, {
                deps,
                compute,
                compare: options?.compare,
            });
            scope.add(computed);
            return computed;
        },
        effect: (
            deps: readonly IOIMEffectDependency[],
            run: () => void,
            options?: { onUpdate?: () => void }
        ): OIMEffect => {
            const effect = new OIMEffect(runtime, {
                deps,
                run,
                onUpdate: options?.onUpdate,
            });
            scope.add(effect);
            return effect;
        },
        scope,
        destroy: () => scope.destroy(),
    };
}
