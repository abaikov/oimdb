import type { IOIMPersistCodec } from '../../codec/interfaces/IOIMPersistCodec';
import type { TOIMPersistHydrateReconcile } from '../../reconcile/types/TOIMPersistHydrateReconcile';
import type { IOIMPersistSnapshotSource } from '../../source/interfaces/IOIMPersistSnapshotSource';
import type { IOIMPersistSnapshotService } from '../../strategy/interfaces/IOIMPersistSnapshotService';

export type TOIMPersistResourceSnapshotOptions<TPersistBackend, TWriteBatch, TSourceSnapshot, TPersistedSnapshot> = {
    readonly persistSnapshotSource: IOIMPersistSnapshotSource<TSourceSnapshot>;
    readonly persistSnapshotService: IOIMPersistSnapshotService<TPersistBackend, TWriteBatch, TPersistedSnapshot>;
    readonly persistCodec: IOIMPersistCodec<TSourceSnapshot, TPersistedSnapshot>;
    readonly persistHydrateReconcile?: TOIMPersistHydrateReconcile<TSourceSnapshot> | undefined;
};
