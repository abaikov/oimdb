import type { TOIMPersistHydrateReconcile } from '../../reconcile/types/TOIMPersistHydrateReconcile';
import type { IOIMPersistSnapshotSource } from '../../source/interfaces/IOIMPersistSnapshotSource';
import type { OIMPersistSourceSilencer } from '../OIMPersistSourceSilencer';

export type TOIMPersistResourceHydrateOptions<TSnapshot> = {
    readonly persistSnapshotSource: IOIMPersistSnapshotSource<TSnapshot>;
    readonly persistSourceSilencer: OIMPersistSourceSilencer;
    readonly persistHydrateReconcile: TOIMPersistHydrateReconcile<TSnapshot> | undefined;
    readonly readStoredSnapshot: () => Promise<TSnapshot | undefined>;
    readonly resourceName: string;
};
