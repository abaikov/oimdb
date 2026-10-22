import { useSyncExternalStore } from 'react';
import type { TOIMDisposer } from '@oimdb/core';
import type { OIMSnapshotVersion } from './OIMSnapshotVersion';

export function useOIMSnapshotVersion(
    snapshotVersion: OIMSnapshotVersion,
    subscribe: (onStoreChange: () => void) => TOIMDisposer,
): number {
    return useSyncExternalStore(subscribe, snapshotVersion.getVersion, snapshotVersion.getVersion);
}
