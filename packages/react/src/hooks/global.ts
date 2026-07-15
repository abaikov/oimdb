import {
    OIMGlobalIndexArrayBased,
    OIMGlobalIndexSetBased,
    OIMReactiveCollection,
    OIMReactiveGlobalIndexArrayBased,
    OIMReactiveGlobalIndexSetBased,
    TOIMPk,
} from '@oimdb/core';
import { useMemo, useRef, useSyncExternalStore } from 'react';

/**
 * Hooks for keyless "Global" (whole-collection / "all") indexes. Same shape as
 * the keyed `…ByIndexKey…` hooks, minus the `key` argument.
 */

// Pks — array-based (ordered)
export const useSelectPksByGlobalIndexArrayBased = <
    TPk extends TOIMPk,
    TIndex extends OIMGlobalIndexArrayBased<TPk>,
>(
    reactiveIndex: OIMReactiveGlobalIndexArrayBased<TPk, TIndex>
) => {
    const snapshotValueRef = useRef<TPk[]>();
    const subscribe = useMemo(() => {
        snapshotValueRef.current = reactiveIndex.getPks();
        return (onStoreChange: () => void) => {
            return reactiveIndex.subscribe(() => {
                snapshotValueRef.current = reactiveIndex.getPks();
                onStoreChange();
            });
        };
    }, [reactiveIndex]);
    const getSnapshot = useMemo(() => () => snapshotValueRef.current, []);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

// Pks — set-based (unordered)
export const useSelectPksByGlobalIndexSetBased = <
    TPk extends TOIMPk,
    TIndex extends OIMGlobalIndexSetBased<TPk>,
>(
    reactiveIndex: OIMReactiveGlobalIndexSetBased<TPk, TIndex>
) => {
    const snapshotValueRef = useRef<Set<TPk>>();
    const subscribe = useMemo(() => {
        snapshotValueRef.current = reactiveIndex.getPks();
        return (onStoreChange: () => void) => {
            return reactiveIndex.subscribe(() => {
                snapshotValueRef.current = reactiveIndex.getPks();
                onStoreChange();
            });
        };
    }, [reactiveIndex]);
    const getSnapshot = useMemo(() => () => snapshotValueRef.current, []);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

// Entities — array-based (ordered)
export const useSelectEntitiesByGlobalIndexArrayBased = <
    TEntity extends object,
    TPk extends TOIMPk,
    TIndex extends OIMGlobalIndexArrayBased<TPk>,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    reactiveIndex: OIMReactiveGlobalIndexArrayBased<TPk, TIndex>
) => {
    const snapshotRef = useRef<readonly (TEntity | undefined)[]>();
    const subscribe = useMemo(() => {
        const readPks = () => reactiveIndex.getPks();
        const readSnapshot = () =>
            readPks().map(pk => reactiveCollection.getOneByPk(pk));

        snapshotRef.current = readSnapshot();
        return (onStoreChange: () => void) => {
            let unsubscribeFromCollection = reactiveCollection.subscribeOnKeys(
                readPks(),
                () => {
                    snapshotRef.current = readSnapshot();
                    onStoreChange();
                }
            );

            const resubscribeCollection = () => {
                unsubscribeFromCollection();
                unsubscribeFromCollection = reactiveCollection.subscribeOnKeys(
                    readPks(),
                    () => {
                        snapshotRef.current = readSnapshot();
                        onStoreChange();
                    }
                );
            };

            const unsubscribeFromIndex = reactiveIndex.subscribe(() => {
                resubscribeCollection();
                snapshotRef.current = readSnapshot();
                onStoreChange();
            });

            return () => {
                unsubscribeFromIndex();
                unsubscribeFromCollection();
            };
        };
    }, [reactiveCollection, reactiveIndex]);
    const getSnapshot = useMemo(() => () => snapshotRef.current, []);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

// Entities — set-based (unordered)
export const useSelectEntitiesByGlobalIndexSetBased = <
    TEntity extends object,
    TPk extends TOIMPk,
    TIndex extends OIMGlobalIndexSetBased<TPk>,
>(
    reactiveCollection: OIMReactiveCollection<TEntity, TPk>,
    reactiveIndex: OIMReactiveGlobalIndexSetBased<TPk, TIndex>
) => {
    const snapshotRef = useRef<readonly (TEntity | undefined)[]>();
    const subscribe = useMemo(() => {
        const readPks = () => Array.from(reactiveIndex.getPks());
        const readSnapshot = () =>
            readPks().map(pk => reactiveCollection.getOneByPk(pk));

        snapshotRef.current = readSnapshot();
        return (onStoreChange: () => void) => {
            let unsubscribeFromCollection = reactiveCollection.subscribeOnKeys(
                readPks(),
                () => {
                    snapshotRef.current = readSnapshot();
                    onStoreChange();
                }
            );

            const resubscribeCollection = () => {
                unsubscribeFromCollection();
                unsubscribeFromCollection = reactiveCollection.subscribeOnKeys(
                    readPks(),
                    () => {
                        snapshotRef.current = readSnapshot();
                        onStoreChange();
                    }
                );
            };

            const unsubscribeFromIndex = reactiveIndex.subscribe(() => {
                resubscribeCollection();
                snapshotRef.current = readSnapshot();
                onStoreChange();
            });

            return () => {
                unsubscribeFromIndex();
                unsubscribeFromCollection();
            };
        };
    }, [reactiveCollection, reactiveIndex]);
    const getSnapshot = useMemo(() => () => snapshotRef.current, []);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
