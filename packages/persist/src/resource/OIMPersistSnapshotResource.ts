import type { IOIMPersistCodec } from '../codec/interfaces/IOIMPersistCodec';
import type { TOIMPersistHydrateReconcile } from '../reconcile/types/TOIMPersistHydrateReconcile';
import type { IOIMPersistSnapshotSource } from '../source/interfaces/IOIMPersistSnapshotSource';
import type { IOIMPersistSnapshotService } from '../strategy/interfaces/IOIMPersistSnapshotService';
import type { IOIMPersistResource } from './interfaces/IOIMPersistResource';
import { OIMPersistSourceSilencer } from './OIMPersistSourceSilencer';
import { OIMPersistSourceSubscription } from './OIMPersistSourceSubscription';
import type { TOIMPersistResourceSnapshotOptions } from './types/TOIMPersistResourceSnapshotOptions';
import { oimHydratePersistResource } from './utils/oimHydratePersistResource';

export class OIMPersistSnapshotResource<TPersistBackend, TWriteBatch, TSourceSnapshot, TPersistedSnapshot>
implements IOIMPersistResource<TPersistBackend, TWriteBatch> {
    private readonly persistSnapshotSource: IOIMPersistSnapshotSource<TSourceSnapshot>;
    private readonly persistSnapshotService: IOIMPersistSnapshotService<TPersistBackend, TWriteBatch, TPersistedSnapshot>;
    private readonly persistCodec: IOIMPersistCodec<TSourceSnapshot, TPersistedSnapshot>;
    private readonly persistHydrateReconcile: TOIMPersistHydrateReconcile<TSourceSnapshot> | undefined;
    private readonly persistSourceSilencer = new OIMPersistSourceSilencer();
    private readonly persistSourceSubscription = new OIMPersistSourceSubscription();
    private isWritePending = false;
    private isWriteInFlight = false;

    public constructor(
        persistResourceSnapshotOptions: TOIMPersistResourceSnapshotOptions<
            TPersistBackend, TWriteBatch, TSourceSnapshot, TPersistedSnapshot
        >,
    ) {
        this.persistSnapshotSource = persistResourceSnapshotOptions.persistSnapshotSource;
        this.persistSnapshotService = persistResourceSnapshotOptions.persistSnapshotService;
        this.persistCodec = persistResourceSnapshotOptions.persistCodec;
        this.persistHydrateReconcile = persistResourceSnapshotOptions.persistHydrateReconcile;
    }

    public start(onPersistResourceDirty: () => void): void {
        this.persistSourceSubscription.subscribeSource(() => this.persistSnapshotSource.subscribeSnapshotChanged(() => {
            if (this.persistSourceSilencer.isSourceSilenced) return;
            this.isWritePending = true;
            onPersistResourceDirty();
        }));
    }

    public stop(): void {
        this.persistSourceSubscription.unsubscribeSource();
    }

    public hasPendingWrite(): boolean {
        return this.isWritePending;
    }

    public writePendingWrite(writeBatch: TWriteBatch): void {
        this.writeEverything(writeBatch);
    }

    public writeEverything(writeBatch: TWriteBatch): void {
        this.isWritePending = false;
        this.isWriteInFlight = true;
        this.persistSnapshotService.writeSnapshot(
            writeBatch, this.persistCodec.encode(this.persistSnapshotSource.readSnapshot()),
        );
    }

    public deleteEverything(writeBatch: TWriteBatch): void {
        this.persistSnapshotService.deleteSnapshot(writeBatch);
    }

    public onPersistWriteCommitted(): void {
        this.isWriteInFlight = false;
    }

    public onPersistWriteFailed(): void {
        if (!this.isWriteInFlight) return;
        this.isWriteInFlight = false;
        this.isWritePending = true;
    }

    public dropPendingWrite(): void {
        this.isWritePending = false;
    }

    public hydrate(persistBackend: TPersistBackend): Promise<void> {
        return oimHydratePersistResource({
            persistSnapshotSource: this.persistSnapshotSource,
            persistSourceSilencer: this.persistSourceSilencer,
            persistHydrateReconcile: this.persistHydrateReconcile,
            readStoredSnapshot: async () => {
                const persistedSnapshot = await this.persistSnapshotService.readSnapshot(persistBackend);
                return persistedSnapshot === undefined ? undefined : this.persistCodec.decode(persistedSnapshot);
            },
            resourceName: 'OIMPersistSnapshotResource',
        });
    }
}
