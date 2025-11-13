import {
    OIMIndexSetBased,
    OIMIndexArrayBased,
    OIMReactiveCollection,
    OIMReactiveIndexSetBased,
    OIMReactiveIndexArrayBased,
    TOIMPk,
} from '@oimdb/core';
import { useMemo, useRef } from 'react';
import { useSyncExternalStore } from 'react';

const EMPTY_ARRAY: readonly unknown[] = [];

// SetBased Index Hooks
export const useSelectPksByIndexKeysSetBased = <
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
>(
    reactiveIndex: OIMReactiveIndexSetBased<TKey, TPk, TIndex>,
    keys: readonly TKey[]
) => {
    const prevKeysRef = useRef<readonly TKey[]>();
    const keysAreEqual = arraysEqual(prevKeysRef.current || EMPTY_ARRAY, keys);
    if (!keysAreEqual) {
        prevKeysRef.current = keys;
    }
    const snapshotValueRef = useRef<TPk[]>();
    const subscribe = useMemo(() => {
        snapshotValueRef.current = keys
            .map(key => Array.from(reactiveIndex.getPksByKey(key)))
            .flat();
        return (onStoreChange: () => void) => {
            const prevKeys = prevKeysRef.current;
            if (!prevKeys) {
                return () => {};
            }
            const updateSnapshot = () => {
                snapshotValueRef.current = keys
                    .map(key => Array.from(reactiveIndex.getPksByKey(key)))
                    .flat();
                onStoreChange();
            };
            reactiveIndex.updateEventEmitter.subscribeOnKeys(
                prevKeys,
                updateSnapshot
            );
            return () => {
                reactiveIndex.updateEventEmitter.unsubscribeFromKeys(
                    prevKeys,
                    updateSnapshot
                );
            };
        };
    }, [prevKeysRef.current, reactiveIndex.updateEventEmitter]);
    const getSnapshot = useMemo(() => {
        return () => {
            return snapshotValueRef.current;
        };
    }, []);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return snapshot;
};

export const useSelectPksByIndexKeySetBased = <
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
>(
    reactiveIndex: OIMReactiveIndexSetBased<TKey, TPk, TIndex>,
    key: TKey
) => {
    const getSnapshot = useMemo(() => {
        return () => {
            return reactiveIndex.getPksByKey(key);
        };
    }, [key, reactiveIndex]);
    const subscribe = useMemo(() => {
        return (onStoreChange: () => void) => {
            reactiveIndex.updateEventEmitter.subscribeOnKey(key, onStoreChange);

            return () => {
                reactiveIndex.updateEventEmitter.unsubscribeFromKey(
                    key,
                    onStoreChange
                );
            };
        };
    }, [key, reactiveIndex.updateEventEmitter]);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return snapshot;
};

// ArrayBased Index Hooks
export const useSelectPksByIndexKeysArrayBased = <
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
>(
    reactiveIndex: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>,
    keys: readonly TKey[]
) => {
    const prevKeysRef = useRef<readonly TKey[]>();
    const keysAreEqual = arraysEqual(prevKeysRef.current || EMPTY_ARRAY, keys);
    if (!keysAreEqual) {
        prevKeysRef.current = keys;
    }
    const snapshotValueRef = useRef<TPk[]>();
    const subscribe = useMemo(() => {
        snapshotValueRef.current = keys
            .map(key => reactiveIndex.getPksByKey(key))
            .flat();
        return (onStoreChange: () => void) => {
            const prevKeys = prevKeysRef.current;
            if (!prevKeys) {
                return () => {};
            }
            const updateSnapshot = () => {
                snapshotValueRef.current = keys
                    .map(key => reactiveIndex.getPksByKey(key))
                    .flat();
                onStoreChange();
            };
            reactiveIndex.updateEventEmitter.subscribeOnKeys(
                prevKeys,
                updateSnapshot
            );
            return () => {
                reactiveIndex.updateEventEmitter.unsubscribeFromKeys(
                    prevKeys,
                    updateSnapshot
                );
            };
        };
    }, [prevKeysRef.current, reactiveIndex.updateEventEmitter]);
    const getSnapshot = useMemo(() => {
        return () => {
            return snapshotValueRef.current;
        };
    }, []);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return snapshot;
};

export const useSelectPksByIndexKeyArrayBased = <
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
>(
    reactiveIndex: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>,
    key: TKey
) => {
    const prevKeyRef = useRef<TKey>();
    const keyAreEqual = prevKeyRef.current === key;
    if (!keyAreEqual) {
        prevKeyRef.current = key;
    }
    const snapshotValueRef = useRef<TPk[]>();
    const subscribe = useMemo(() => {
        snapshotValueRef.current = reactiveIndex.getPksByKey(key);
        return (onStoreChange: () => void) => {
            const prevKey = prevKeyRef.current;
            if (!prevKey) {
                return () => {};
            }
            const updateSnapshot = () => {
                snapshotValueRef.current = reactiveIndex.getPksByKey(prevKey);
                onStoreChange();
            };
            reactiveIndex.updateEventEmitter.subscribeOnKey(
                prevKey,
                updateSnapshot
            );
            return () => {
                reactiveIndex.updateEventEmitter.unsubscribeFromKey(
                    prevKey,
                    updateSnapshot
                );
            };
        };
    }, [key, reactiveIndex.updateEventEmitter]);
    const getSnapshot = useMemo(() => {
        return () => {
            return snapshotValueRef.current;
        };
    }, []);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return snapshot;
};

// Collection Hooks (unchanged)
export const useSelectEntityByPk = <TEntity extends object, TPk extends TOIMPk>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    pk: TPk
) => {
    const getSnapshot = useMemo(
        () => () => reactiveCollection.getOneByPk(pk),
        [pk, reactiveCollection]
    );
    const subscribe = useMemo(() => {
        return (onStoreChange: () => void) => {
            reactiveCollection.updateEventEmitter.subscribeOnKey(
                pk,
                onStoreChange
            );
            return () => {
                reactiveCollection.updateEventEmitter.unsubscribeFromKey(
                    pk,
                    onStoreChange
                );
            };
        };
    }, [pk, reactiveCollection.updateEventEmitter]);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return snapshot;
};

// Helper function to compare arrays by values
function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export const useSelectEntitiesByPks = <
    TEntity extends object,
    TPk extends TOIMPk,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    pks: readonly TPk[]
) => {
    const prevPksRef = useRef<readonly TPk[]>();
    const pksAreEqual = arraysEqual(prevPksRef.current || EMPTY_ARRAY, pks);
    if (!pksAreEqual) {
        prevPksRef.current = pks;
    }
    const snapshotRef = useRef<readonly (TEntity | undefined)[]>();
    const subscribe = useMemo(() => {
        snapshotRef.current = pks.map(pk => reactiveCollection.getOneByPk(pk));
        return (onStoreChange: () => void) => {
            const prevPks = prevPksRef.current;
            if (!prevPks) {
                return () => {};
            }
            const updateSnapshot = () => {
                snapshotRef.current = prevPks.map(pk =>
                    reactiveCollection.getOneByPk(pk)
                );
                onStoreChange();
            };
            reactiveCollection.updateEventEmitter.subscribeOnKeys(
                prevPks,
                updateSnapshot
            );

            return () => {
                reactiveCollection.updateEventEmitter.unsubscribeFromKeys(
                    prevPks,
                    updateSnapshot
                );
            };
        };
    }, [prevPksRef.current, reactiveCollection.updateEventEmitter]);
    const getSnapshot = useMemo(() => {
        return () => {
            return snapshotRef.current;
        };
    }, []);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return snapshot;
};
// SetBased Index + Collection Hooks
export const useSelectEntitiesByIndexKeySetBased = <
    TEntity extends object,
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    reactiveIndex: OIMReactiveIndexSetBased<TKey, TPk, TIndex>,
    key: TKey
) => {
    const pks = useSelectPksByIndexKeySetBased(reactiveIndex, key);
    const pksArray = useMemo(
        () => (pks ? Array.from(pks) : (EMPTY_ARRAY as readonly TPk[])),
        [pks]
    );
    return useSelectEntitiesByPks(reactiveCollection, pksArray);
};

export const useSelectEntitiesByIndexKeysSetBased = <
    TEntity extends object,
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    reactiveIndex: OIMReactiveIndexSetBased<TKey, TPk, TIndex>,
    keys: readonly TKey[]
) => {
    const pks = useSelectPksByIndexKeysSetBased(reactiveIndex, keys);
    const pksArray = useMemo(
        () => (pks ? Array.from(pks) : (EMPTY_ARRAY as readonly TPk[])),
        [pks]
    );
    return useSelectEntitiesByPks(reactiveCollection, pksArray);
};

// ArrayBased Index + Collection Hooks
export const useSelectEntitiesByIndexKeyArrayBased = <
    TEntity extends object,
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    reactiveIndex: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>,
    key: TKey
) => {
    const pks = useSelectPksByIndexKeyArrayBased(reactiveIndex, key);
    return useSelectEntitiesByPks(
        reactiveCollection,
        pks || (EMPTY_ARRAY as readonly TPk[])
    );
};

export const useSelectEntitiesByIndexKeysArrayBased = <
    TEntity extends object,
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    reactiveIndex: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>,
    keys: readonly TKey[]
) => {
    const pks =
        useSelectPksByIndexKeysArrayBased(reactiveIndex, keys) ||
        (EMPTY_ARRAY as readonly TPk[]);

    return useSelectEntitiesByPks(reactiveCollection, pks);
};
