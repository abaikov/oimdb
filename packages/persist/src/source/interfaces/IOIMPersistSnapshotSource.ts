import type { TOIMDisposer } from '@oimdb/core';
import type { IOIMPersistSourceChangeMark } from './IOIMPersistSourceChangeMark';

export interface IOIMPersistSnapshotSource<TSnapshot> {
    readSnapshot(): TSnapshot;
    writeSnapshot(snapshot: TSnapshot): void;
    subscribeSnapshotChanged(onSnapshotChanged: () => void): TOIMDisposer;
    markSourceChanges(): IOIMPersistSourceChangeMark;
}
