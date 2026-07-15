import {
    OIMGlobalIndexArrayBased,
    OIMGlobalIndexSetBased,
    OIMIndexArrayBased,
    OIMIndexSetBased,
    OIMReactiveCollection,
    OIMReactiveGlobalIndexArrayBased,
    OIMReactiveGlobalIndexSetBased,
    OIMReactiveIndexArrayBased,
    OIMReactiveIndexSetBased,
    TOIMPk,
} from '@oimdb/core';
import { useEffect, useLayoutEffect, useReducer } from 'react';

/**
 * Signal-driven bindings — the lightest possible React binding for OIMDB.
 *
 * Unlike the default `useSyncExternalStore` hooks, these do NOT compare the
 * value (`Object.is`) and do NOT carry Concurrent-Mode anti-tearing bookkeeping.
 * They simply `forceUpdate` on the keyed notification and re-read during render.
 *
 * That makes them the correct binding for **in-place / mutable collections**
 * (`updateEntity: createInPlaceEntityUpdater()`): the entity reference stays
 * stable across updates, so a value-comparison binding would never re-render —
 * a signal-driven one always does. Together they drop the per-update merge copy
 * AND the uSES overhead, i.e. exactly the work MobX does not pay.
 *
 * Trade-offs: not Concurrent-safe (no tearing guarantees), and no reference
 * stability — so follow the fine-grained discipline of selecting each entity
 * where it is rendered (by pk) rather than passing entities into `React.memo`
 * children.
 */

// useLayoutEffect subscribes before paint (smallest missed-update window) but
// warns under SSR — fall back to useEffect when there is no DOM.
const useIsomorphicLayoutEffect =
    typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function useForceUpdate(): () => void {
    const [, force] = useReducer((c: number): number => (c + 1) | 0, 0);
    return force;
}

export const useSelectEntityByPkSignal = <
    TEntity extends object,
    TPk extends TOIMPk,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    pk: TPk
): TEntity | undefined => {
    const force = useForceUpdate();
    useIsomorphicLayoutEffect(
        () => reactiveCollection.subscribeOnKey(pk, force),
        [reactiveCollection, pk]
    );
    return reactiveCollection.getOneByPk(pk);
};

export const useSelectPksByIndexKeyArrayBasedSignal = <
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
>(
    reactiveIndex: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>,
    key: TKey
): readonly TPk[] => {
    const force = useForceUpdate();
    useIsomorphicLayoutEffect(
        () => reactiveIndex.subscribeOnKey(key, force),
        [reactiveIndex, key]
    );
    return reactiveIndex.getPksByKey(key);
};

export const useSelectPksByIndexKeySetBasedSignal = <
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
>(
    reactiveIndex: OIMReactiveIndexSetBased<TKey, TPk, TIndex>,
    key: TKey
): ReadonlySet<TPk> => {
    const force = useForceUpdate();
    useIsomorphicLayoutEffect(
        () => reactiveIndex.subscribeOnKey(key, force),
        [reactiveIndex, key]
    );
    return reactiveIndex.getPksByKey(key);
};

// Keyless "Global" (whole-collection) signal variants
export const useSelectPksByGlobalIndexArrayBasedSignal = <
    TPk extends TOIMPk,
    TIndex extends OIMGlobalIndexArrayBased<TPk>,
>(
    reactiveIndex: OIMReactiveGlobalIndexArrayBased<TPk, TIndex>
): readonly TPk[] => {
    const force = useForceUpdate();
    useIsomorphicLayoutEffect(
        () => reactiveIndex.subscribe(force),
        [reactiveIndex]
    );
    return reactiveIndex.getPks();
};

export const useSelectPksByGlobalIndexSetBasedSignal = <
    TPk extends TOIMPk,
    TIndex extends OIMGlobalIndexSetBased<TPk>,
>(
    reactiveIndex: OIMReactiveGlobalIndexSetBased<TPk, TIndex>
): ReadonlySet<TPk> => {
    const force = useForceUpdate();
    useIsomorphicLayoutEffect(
        () => reactiveIndex.subscribe(force),
        [reactiveIndex]
    );
    return reactiveIndex.getPks();
};
