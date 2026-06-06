import {
    OIMIndexSetBased,
    OIMIndexArrayBased,
    OIMReactiveCollection,
    OIMReactiveObject,
    OIMReactiveIndexSetBased,
    OIMReactiveIndexArrayBased,
    TOIMPk,
} from '@oimdb/core';
import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';

/**
 * Fast React binding — an alternative to the default `useSyncExternalStore`
 * hooks. It drops the Concurrent-Mode anti-tearing machinery (which calls
 * `getSnapshot` several times and keeps extra bookkeeping) in favour of a
 * manual subscribe + `forceUpdate`, reading the value synchronously during
 * render. This is ~25% faster on update-heavy workloads but is NOT tearing-safe
 * under Concurrent features (Suspense / transitions).
 *
 * Trade-off: use these `*Fast` hooks when raw update throughput matters and you
 * are not relying on Concurrent Mode; otherwise keep the default hooks.
 *
 * Reference stability is preserved: a hook returns the same array/Set/entity
 * reference across renders when the content is unchanged, so `React.memo`
 * children are not re-rendered needlessly.
 */

// useLayoutEffect subscribes before paint (minimal missed-update window) but
// warns during SSR — fall back to useEffect when there is no DOM.
const useIsomorphicLayoutEffect =
    typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function useForceUpdate(): () => void {
    const [, force] = useReducer((c: number): number => (c + 1) | 0, 0);
    return force;
}

function objectIsEqual<T>(a: T, b: T): boolean {
    return Object.is(a, b);
}

function shallowEqualArray<T>(a: readonly T[], b: readonly T[]): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (!Object.is(a[i], b[i])) return false;
    }
    return true;
}

function setEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
    if (a === b) return true;
    if (a.size !== b.size) return false;
    for (const value of a) {
        if (!b.has(value)) return false;
    }
    return true;
}

/** Keeps a referentially stable array while its content is unchanged. */
function useStableArray<T>(input: readonly T[]): readonly T[] {
    const ref = useRef<readonly T[]>(input);
    if (!shallowEqualArray(ref.current, input)) {
        ref.current = input;
    }
    return ref.current;
}

/**
 * Core of the fast binding: read synchronously in render (with reference
 * stability), subscribe in a layout effect, resync once after subscribing to
 * close the render→effect gap, and skip re-renders when a fired key did not
 * actually change the value.
 */
function useFastReactiveValue<T>(
    read: () => T,
    subscribe: (onChange: () => void) => () => void,
    isEqual: (a: T, b: T) => boolean,
    deps: readonly unknown[]
): T {
    const force = useForceUpdate();
    const cache = useRef<{ value: T } | null>(null);

    const incoming = read();
    if (cache.current === null || !isEqual(cache.current.value, incoming)) {
        cache.current = { value: incoming };
    }
    const value = cache.current.value;

    useIsomorphicLayoutEffect(() => {
        let active = true;
        const onChange = (): void => {
            if (!active) return;
            const next = read();
            // Keyed subscriptions fire per touched key, not per value change —
            // skip the re-render when the content is still equal.
            if (cache.current !== null && isEqual(cache.current.value, next)) {
                return;
            }
            cache.current = { value: next };
            force();
        };
        const unsubscribe = subscribe(onChange);
        // An update may have landed between render and this effect.
        const latest = read();
        if (cache.current === null || !isEqual(cache.current.value, latest)) {
            cache.current = { value: latest };
            force();
        }
        return () => {
            active = false;
            unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return value;
}

// --- Collection: entity by pk -------------------------------------------------

export const useSelectEntityByPkFast = <
    TEntity extends object,
    TPk extends TOIMPk,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    pk: TPk
): TEntity | undefined =>
    useFastReactiveValue(
        () => reactiveCollection.getOneByPk(pk),
        onChange => reactiveCollection.subscribeOnKey(pk, onChange),
        objectIsEqual,
        [reactiveCollection, pk]
    );

export const useSelectEntitiesByPksFast = <
    TEntity extends object,
    TPk extends TOIMPk,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    pks: readonly TPk[]
): readonly (TEntity | undefined)[] => {
    const stablePks = useStableArray(pks);
    return useFastReactiveValue(
        () => stablePks.map(pk => reactiveCollection.getOneByPk(pk)),
        onChange => reactiveCollection.subscribeOnKeys(stablePks, onChange),
        shallowEqualArray,
        [reactiveCollection, stablePks]
    );
};

// --- Object: value by key -----------------------------------------------------

export const useSelectValueByObjectKeyFast = <TKey extends string, TValue>(
    reactiveObject: OIMReactiveObject<TKey, TValue>,
    key: TKey
): TValue | undefined =>
    useFastReactiveValue(
        () => reactiveObject.get(key),
        onChange => reactiveObject.subscribeOnKey(key, onChange),
        objectIsEqual,
        [reactiveObject, key]
    );

export const useSelectValuesByObjectKeysFast = <TKey extends string, TValue>(
    reactiveObject: OIMReactiveObject<TKey, TValue>,
    keys: readonly TKey[]
): readonly (TValue | undefined)[] => {
    const stableKeys = useStableArray(keys);
    return useFastReactiveValue(
        () => stableKeys.map(key => reactiveObject.get(key)),
        onChange => reactiveObject.subscribeOnKeys(stableKeys, onChange),
        shallowEqualArray,
        [reactiveObject, stableKeys]
    );
};

// --- Index: pks by key --------------------------------------------------------

export const useSelectPksByIndexKeySetBasedFast = <
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
>(
    reactiveIndex: OIMReactiveIndexSetBased<TKey, TPk, TIndex>,
    key: TKey
): ReadonlySet<TPk> =>
    useFastReactiveValue(
        () => reactiveIndex.getPksByKey(key),
        onChange => reactiveIndex.subscribeOnKey(key, onChange),
        setEqual,
        [reactiveIndex, key]
    );

export const useSelectPksByIndexKeyArrayBasedFast = <
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
>(
    reactiveIndex: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>,
    key: TKey
): readonly TPk[] =>
    useFastReactiveValue(
        () => reactiveIndex.getPksByKey(key),
        onChange => reactiveIndex.subscribeOnKey(key, onChange),
        shallowEqualArray,
        [reactiveIndex, key]
    );

export const useSelectPksByIndexKeysSetBasedFast = <
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
>(
    reactiveIndex: OIMReactiveIndexSetBased<TKey, TPk, TIndex>,
    keys: readonly TKey[]
): readonly TPk[] => {
    const stableKeys = useStableArray(keys);
    return useFastReactiveValue(
        () =>
            stableKeys
                .map(key => Array.from(reactiveIndex.getPksByKey(key)))
                .flat(),
        onChange => reactiveIndex.subscribeOnKeys(stableKeys, onChange),
        shallowEqualArray,
        [reactiveIndex, stableKeys]
    );
};

export const useSelectPksByIndexKeysArrayBasedFast = <
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
>(
    reactiveIndex: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>,
    keys: readonly TKey[]
): readonly TPk[] => {
    const stableKeys = useStableArray(keys);
    return useFastReactiveValue(
        () => stableKeys.map(key => reactiveIndex.getPksByKey(key)).flat(),
        onChange => reactiveIndex.subscribeOnKeys(stableKeys, onChange),
        shallowEqualArray,
        [reactiveIndex, stableKeys]
    );
};

// --- Index + collection: entities by key -------------------------------------

function subscribeIndexAndPks<TPk extends TOIMPk>(
    subscribeIndex: (onChange: () => void) => () => void,
    subscribeCollection: (
        pks: readonly TPk[],
        onChange: () => void
    ) => () => void,
    readPks: () => readonly TPk[],
    onChange: () => void
): () => void {
    let unsubscribeCollection = subscribeCollection(readPks(), onChange);
    const unsubscribeIndex = subscribeIndex(() => {
        // Membership may have changed — re-subscribe to the new pk set.
        unsubscribeCollection();
        unsubscribeCollection = subscribeCollection(readPks(), onChange);
        onChange();
    });
    return () => {
        unsubscribeIndex();
        unsubscribeCollection();
    };
}

export const useSelectEntitiesByIndexKeySetBasedFast = <
    TEntity extends object,
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    reactiveIndex: OIMReactiveIndexSetBased<TKey, TPk, TIndex>,
    key: TKey
): readonly (TEntity | undefined)[] => {
    const readPks = (): readonly TPk[] =>
        Array.from(reactiveIndex.getPksByKey(key));
    return useFastReactiveValue(
        () => readPks().map(pk => reactiveCollection.getOneByPk(pk)),
        onChange =>
            subscribeIndexAndPks(
                cb => reactiveIndex.subscribeOnKey(key, cb),
                (pks, cb) => reactiveCollection.subscribeOnKeys(pks, cb),
                readPks,
                onChange
            ),
        shallowEqualArray,
        [reactiveCollection, reactiveIndex, key]
    );
};

export const useSelectEntitiesByIndexKeyArrayBasedFast = <
    TEntity extends object,
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    reactiveIndex: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>,
    key: TKey
): readonly (TEntity | undefined)[] => {
    const readPks = (): readonly TPk[] => reactiveIndex.getPksByKey(key);
    return useFastReactiveValue(
        () => readPks().map(pk => reactiveCollection.getOneByPk(pk)),
        onChange =>
            subscribeIndexAndPks(
                cb => reactiveIndex.subscribeOnKey(key, cb),
                (pks, cb) => reactiveCollection.subscribeOnKeys(pks, cb),
                readPks,
                onChange
            ),
        shallowEqualArray,
        [reactiveCollection, reactiveIndex, key]
    );
};

export const useSelectEntitiesByIndexKeysSetBasedFast = <
    TEntity extends object,
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    reactiveIndex: OIMReactiveIndexSetBased<TKey, TPk, TIndex>,
    keys: readonly TKey[]
): readonly (TEntity | undefined)[] => {
    const stableKeys = useStableArray(keys);
    const readPks = (): readonly TPk[] =>
        stableKeys.flatMap(key => Array.from(reactiveIndex.getPksByKey(key)));
    return useFastReactiveValue(
        () => readPks().map(pk => reactiveCollection.getOneByPk(pk)),
        onChange =>
            subscribeIndexAndPks(
                cb => reactiveIndex.subscribeOnKeys(stableKeys, cb),
                (pks, cb) => reactiveCollection.subscribeOnKeys(pks, cb),
                readPks,
                onChange
            ),
        shallowEqualArray,
        [reactiveCollection, reactiveIndex, stableKeys]
    );
};

export const useSelectEntitiesByIndexKeysArrayBasedFast = <
    TEntity extends object,
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    reactiveIndex: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>,
    keys: readonly TKey[]
): readonly (TEntity | undefined)[] => {
    const stableKeys = useStableArray(keys);
    const readPks = (): readonly TPk[] =>
        stableKeys.flatMap(key => reactiveIndex.getPksByKey(key));
    return useFastReactiveValue(
        () => readPks().map(pk => reactiveCollection.getOneByPk(pk)),
        onChange =>
            subscribeIndexAndPks(
                cb => reactiveIndex.subscribeOnKeys(stableKeys, cb),
                (pks, cb) => reactiveCollection.subscribeOnKeys(pks, cb),
                readPks,
                onChange
            ),
        shallowEqualArray,
        [reactiveCollection, reactiveIndex, stableKeys]
    );
};
