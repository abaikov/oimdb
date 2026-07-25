import { TOIMKey } from '../types/TOIMKey';
import { OIMReactiveCollection } from '../core/OIMReactiveCollection';
import { OIMReactiveObject } from '../core/OIMReactiveObject';
import { IOIMKeyedSubscription } from '../interfaces/IOIMKeyedSubscription';
import { OIMComputed } from '../modules/computed/core/OIMComputed';
import { OIMEffectDependencyKeyedCollection } from '../modules/effect/core/OIMEffectDependencyKeyedCollection';
import { OIMEffectDependencyKeyedIndex } from '../modules/effect/core/OIMEffectDependencyKeyedIndex';
import { OIMEffectDependencyKeyedObject } from '../modules/effect/core/OIMEffectDependencyKeyedObject';
import { OIMEffectDependencyComputed } from '../modules/effect/core/OIMEffectDependencyComputed';

/**
 * Dependency builders for `computed` / `effect`. They pick the right wrapper for
 * each source type so you never instantiate `OIMEffectDependency…` by hand:
 *
 * ```ts
 * kit.computed(
 *   [on.collection(users, 'u1'), on.index(byRole, 'admin'), on.computed(orderCount)],
 *   () => …,
 * );
 * ```
 */
export const on = {
    /** Depend on one PK of a collection. */
    collection: <TEntity extends object, TPk extends TOIMKey>(
        collection: OIMReactiveCollection<TEntity, TPk>,
        pk: TPk
    ): OIMEffectDependencyKeyedCollection<TEntity, TPk> =>
        new OIMEffectDependencyKeyedCollection(collection, pk),

    /** Depend on one key of an index. */
    index: <TKey extends TOIMKey>(
        index: IOIMKeyedSubscription<TKey>,
        key: TKey
    ): OIMEffectDependencyKeyedIndex<TKey> =>
        new OIMEffectDependencyKeyedIndex(index, key),

    /** Depend on one key of a reactive object. */
    object: <TKey extends string, TValue>(
        object: OIMReactiveObject<TKey, TValue>,
        key: TKey
    ): OIMEffectDependencyKeyedObject<TKey, TValue> =>
        new OIMEffectDependencyKeyedObject(object, key),

    /** Depend on another computed. */
    computed: <TValue>(
        computed: OIMComputed<TValue>
    ): OIMEffectDependencyComputed =>
        new OIMEffectDependencyComputed(computed),
};
