import {
    OIMIndex,
    OIMReactiveCollection,
    OIMReactiveIndex,
    TOIMPk,
} from '@oimdb/core';
import { useMemo, useRef, useEffect } from 'react';
import { useSyncExternalStore } from 'react';

const EMPTY_ARRAY: readonly unknown[] = [];

export const useSelectPksByIndexKeys = <
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndex<TKey, TPk>,
>(
    reactiveIndex: OIMReactiveIndex<TKey, TPk, TIndex>,
    keys: readonly TKey[]
) => {
    const isInitialized = useRef(false);
    const snapshotValueRef = useRef<readonly TPk[] | null>(
        keys.map(key => Array.from(reactiveIndex.getPksByKey(key))).flat()
    );
    const osc = useRef<() => void>(() => {});
    const subscribe = useRef((onStoreChange: () => void) => {
        osc.current = onStoreChange;
        return () => {
            osc.current = () => {};
        };
    });
    useEffect(() => {
        const list = () => {
            snapshotValueRef.current = keys
                .map(key => Array.from(reactiveIndex.getPksByKey(key)))
                .flat();
            osc.current();
        };
        reactiveIndex.updateEventEmitter.subscribeOnKeys(keys, list);
        if (!isInitialized.current) {
            isInitialized.current = true;
        } else {
            snapshotValueRef.current = keys
                .map(key => Array.from(reactiveIndex.getPksByKey(key)))
                .flat();
            osc.current();
        }
        return () => {
            reactiveIndex.updateEventEmitter.unsubscribeFromKeys(keys, list);
        };
    }, [keys, reactiveIndex.updateEventEmitter, reactiveIndex]);

    const getSnapshot = useMemo(() => {
        return () => {
            // Only recalculate if keys reference actually changed
            return snapshotValueRef.current;
        };
    }, []);

    const snapshot = useSyncExternalStore(
        subscribe.current,
        getSnapshot,
        getSnapshot
    );
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
    const isInitialized = useRef(false);
    const snapshotValueRef = useRef<readonly TPk[] | null>(
        Array.from(reactiveIndex.getPksByKey(key))
    );
    const osc = useRef<() => void>(() => {});
    const subscribe = useRef((onStoreChange: () => void) => {
        osc.current = onStoreChange;
        return () => {
            osc.current = () => {};
        };
    });
    useEffect(() => {
        const list = () => {
            snapshotValueRef.current = Array.from(
                reactiveIndex.getPksByKey(key)
            );
            osc.current();
        };
        reactiveIndex.updateEventEmitter.subscribeOnKey(key, list);
        if (!isInitialized.current) {
            isInitialized.current = true;
        } else {
            snapshotValueRef.current = Array.from(
                reactiveIndex.getPksByKey(key)
            );
            osc.current();
        }
        return () => {
            reactiveIndex.updateEventEmitter.unsubscribeFromKey(key, list);
        };
    }, [key, reactiveIndex.updateEventEmitter, reactiveIndex]);
    const getSnapshot = useMemo(() => {
        return () => {
            return snapshotValueRef.current;
        };
    }, []);
    const snapshot = useSyncExternalStore(
        subscribe.current,
        getSnapshot,
        getSnapshot
    );
    return snapshot;
};

export const useSelectEntityByPk = <TEntity extends object, TPk extends TOIMPk>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    pk: TPk
) => {
    const isInitialized = useRef(false);
    const snapshotValueRef = useRef<TEntity | undefined>(
        reactiveCollection.getOneByPk(pk)
    );
    const osc = useRef<() => void>(() => {});
    const subscribe = useRef((onStoreChange: () => void) => {
        osc.current = onStoreChange;
        return () => {
            osc.current = () => {};
        };
    });
    useEffect(() => {
        const list = () => {
            snapshotValueRef.current = reactiveCollection.getOneByPk(pk);
            osc.current();
        };
        reactiveCollection.updateEventEmitter.subscribeOnKey(pk, list);
        if (!isInitialized.current) {
            isInitialized.current = true;
        } else {
            snapshotValueRef.current = reactiveCollection.getOneByPk(pk);
            osc.current();
        }
        return () => {
            reactiveCollection.updateEventEmitter.unsubscribeFromKey(pk, list);
        };
    }, [pk, reactiveCollection.updateEventEmitter, reactiveCollection]);
    const getSnapshot = useMemo(() => () => snapshotValueRef.current, []);
    const snapshot = useSyncExternalStore(
        subscribe.current,
        getSnapshot,
        getSnapshot
    );
    return snapshot;
};

export const useSelectEntitiesByPks = <
    TEntity extends object,
    TPk extends TOIMPk,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    pks: readonly TPk[]
) => {
    const isInitialized = useRef(false);
    const snapshotValueRef = useRef<readonly TEntity[] | null>(
        pks.map(pk => reactiveCollection.getOneByPk(pk)) as readonly TEntity[]
    );
    const osc = useRef<() => void>(() => {});
    const subscribe = useRef((onStoreChange: () => void) => {
        osc.current = onStoreChange;
        return () => {
            osc.current = () => {};
        };
    });
    useEffect(() => {
        const list = () => {
            snapshotValueRef.current = pks.map(pk =>
                reactiveCollection.getOneByPk(pk)
            ) as readonly TEntity[];
            osc.current();
        };
        reactiveCollection.updateEventEmitter.subscribeOnKeys(pks, list);
        if (!isInitialized.current) {
            isInitialized.current = true;
        } else {
            snapshotValueRef.current = pks.map(pk =>
                reactiveCollection.getOneByPk(pk)
            ) as readonly TEntity[];
            osc.current();
        }
        return () => {
            reactiveCollection.updateEventEmitter.unsubscribeFromKeys(
                pks,
                list
            );
        };
    }, [pks, reactiveCollection.updateEventEmitter, reactiveCollection]);

    const getSnapshot = useMemo(() => {
        return () => {
            return snapshotValueRef.current;
        };
    }, []);
    const snapshot = useSyncExternalStore(
        subscribe.current,
        getSnapshot,
        getSnapshot
    );
    return snapshot;
};

export const useSelectEntitiesByIndexKey = <
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
    return useSelectEntitiesByPks(
        reactiveCollection,
        pks || (EMPTY_ARRAY as readonly TPk[])
    );
};

const unique = <T>(array: T[]): T[] => {
    return Array.from(new Set(array));
};

export const useSelectEntitiesByIndexKeys = <
    TEntity extends object,
    TPk extends TOIMPk,
    TKey extends TOIMPk,
    TIndex extends OIMIndex<TKey, TPk>,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    reactiveIndex: OIMReactiveIndex<TKey, TPk, TIndex>,
    keys: readonly TKey[]
) => {
    const pks =
        useSelectPksByIndexKeys(reactiveIndex, keys) ||
        (EMPTY_ARRAY as readonly TPk[]);

    return useSelectEntitiesByPks(reactiveCollection, unique(Array.from(pks)));
};
