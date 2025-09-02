import {
    OIMIndex,
    OIMReactiveCollection,
    OIMReactiveIndex,
    TOIMPk,
} from '@oimdb/core';
import { useMemo } from 'react';
import { useSyncExternalStore } from 'react';

export const useSelectPksByIndexKeys = <
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndex<TKey, TPk>,
>(
    reactiveIndex: OIMReactiveIndex<TKey, TPk, TIndex>,
    keys: readonly TKey[]
) => {
    const subscribe = useMemo(() => {
        return (onStoreChange: () => void) =>
            reactiveIndex.updateEventEmitter.subscribeOnKeys(
                keys,
                onStoreChange
            );
    }, [keys, reactiveIndex.updateEventEmitter]);
    const getSnapshot = useMemo(
        () => () => keys.map(key => reactiveIndex.getPksByKey(key)),
        [keys, reactiveIndex]
    );
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return snapshot;
};

export const useSelectPksByIndexKey = <
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndex<TKey, TPk>,
>(
    reactiveIndex: OIMReactiveIndex<TKey, TPk, TIndex>,
    key: TKey
) => {
    const subscribe = useMemo(() => {
        return (onStoreChange: () => void) =>
            reactiveIndex.updateEventEmitter.subscribeOnKey(key, onStoreChange);
    }, [key, reactiveIndex.updateEventEmitter]);
    const getSnapshot = useMemo(
        () => () => reactiveIndex.getPksByKey(key),
        [key, reactiveIndex]
    );
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return snapshot;
};

export const selectEntityByPk = <TEntity extends object, TPk extends TOIMPk>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    pk: TPk
) => {
    const subscribe = useMemo(() => {
        return (onStoreChange: () => void) =>
            reactiveCollection.updateEventEmitter.subscribeOnKey(
                pk,
                onStoreChange
            );
    }, [pk, reactiveCollection.updateEventEmitter]);
    const getSnapshot = useMemo(
        () => () => reactiveCollection.getOneByPk(pk),
        [pk, reactiveCollection]
    );
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return snapshot;
};

export const useSelectEntitiesByPks = <
    TEntity extends object,
    TPk extends TOIMPk,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    pks: readonly TPk[]
) => {
    const subscribe = useMemo(() => {
        return (onStoreChange: () => void) =>
            reactiveCollection.updateEventEmitter.subscribeOnKeys(
                pks,
                onStoreChange
            );
    }, [pks, reactiveCollection.updateEventEmitter]);
    const getSnapshot = useMemo(
        () => () => pks.map(pk => reactiveCollection.getOneByPk(pk)),
        [pks, reactiveCollection]
    );
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return snapshot;
};

export const selectEntitiesByIndexKey = <
    TEntity extends object,
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndex<TKey, TPk>,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    reactiveIndex: OIMReactiveIndex<TKey, TPk, TIndex>,
    key: TKey
) => {
    const pks = useSelectPksByIndexKey(reactiveIndex, key);
    return useSelectEntitiesByPks(reactiveCollection, pks);
};

const unique = <T>(array: T[]): T[] => {
    return Array.from(new Set(array));
};

export const selectEntitiesByIndexKeys = <
    TEntity extends object,
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndex<TKey, TPk>,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    reactiveIndex: OIMReactiveIndex<TKey, TPk, TIndex>,
    keys: readonly TKey[]
) => {
    const pks = useSelectPksByIndexKeys(reactiveIndex, keys);
    const pksArray = useMemo(
        () => unique(Array.from(pks.values()).flat()),
        [pks]
    );
    return useSelectEntitiesByPks(reactiveCollection, pksArray);
};
