import { oimDeliverPersistErrors } from '../error/oimDeliverPersistErrors';
import type { TOIMPersistErrorContext } from '../error/types/TOIMPersistErrorContext';
import type { TOIMPersistErrorHandler } from '../error/types/TOIMPersistErrorHandler';
import type { TOIMPersistOperation } from '../error/types/TOIMPersistOperation';
import type { IOIMPersistResource } from '../resource/interfaces/IOIMPersistResource';
import type { OIMPersistResourceRecords } from '../resource/OIMPersistResourceRecords';
import type { IOIMPersistScheduler } from '../schedule/interfaces/IOIMPersistScheduler';
import { oimNoop } from '../utils/oimNoop';
import type { IOIMPersistBackend } from './interfaces/IOIMPersistBackend';
import type { IOIMPersistWriteBatch } from './interfaces/IOIMPersistWriteBatch';
import type { TOIMPersistorOptions } from './types/TOIMPersistorOptions';
import type { TOIMPersistResourceFailure } from './types/TOIMPersistResourceFailure';

const OIM_QUARANTINE_AFTER_CONSECUTIVE_FAILURES = 3;

export class OIMPersistor<
    TPersistBackend extends IOIMPersistBackend<TWriteBatch>,
    TWriteBatch extends IOIMPersistWriteBatch,
> {
    private readonly persistBackend: TPersistBackend;
    private readonly persistScheduler: IOIMPersistScheduler;
    private readonly onPersistError: TOIMPersistErrorHandler | undefined;
    private readonly persistResources: IOIMPersistResource<TPersistBackend, TWriteBatch>[] = [];
    private readonly dirtyPersistResources = new Set<IOIMPersistResource<TPersistBackend, TWriteBatch>>();
    private readonly consecutiveFailureCounts = new Map<IOIMPersistResource<TPersistBackend, TWriteBatch>, number>();
    private persistQueue: Promise<void> = Promise.resolve();
    private isStarted = false;

    private readonly onPersistSchedulerDrain = (): void => {
        this.flushDirtyPersistResources();
    };

    public constructor(persistorOptions: TOIMPersistorOptions<TPersistBackend, TWriteBatch>) {
        this.persistBackend = persistorOptions.persistBackend;
        this.persistScheduler = persistorOptions.persistScheduler;
        this.onPersistError = persistorOptions.onPersistError;
        this.persistScheduler.attachDrain(this.onPersistSchedulerDrain);
    }

    public addPersistResource<TPersistResource extends IOIMPersistResource<TPersistBackend, TWriteBatch>>(
        persistResource: TPersistResource,
    ): TPersistResource {
        if (this.persistResources.indexOf(persistResource) >= 0) return persistResource;
        if (this.isStarted) {
            this.startPersistResource(persistResource);
            this.persistScheduler.start();
        }
        this.persistResources.push(persistResource);
        return persistResource;
    }

    public removePersistResource(persistResource: IOIMPersistResource<TPersistBackend, TWriteBatch>): void {
        const index = this.persistResources.indexOf(persistResource);
        if (index < 0) return;
        this.persistResources.splice(index, 1);
        this.dirtyPersistResources.delete(persistResource);
        this.consecutiveFailureCounts.delete(persistResource);
        persistResource.stop();
        persistResource.dropPendingWrite();
    }

    public start(): void {
        if (this.isStarted) return;
        this.isStarted = true;
        const persistResourceFailures: TOIMPersistResourceFailure<TPersistBackend, TWriteBatch>[] = [];
        const persistResources = this.persistResources;
        for (let i = 0; i < persistResources.length; i++) {
            const persistResource = persistResources[i];
            if (this.isPersistResourceQuarantined(persistResource)) continue;
            try {
                this.startPersistResource(persistResource);
            } catch (error) {
                persistResourceFailures.push({ persistResource, error });
            }
        }
        this.persistScheduler.start();
        if (this.dirtyPersistResources.size !== 0) this.persistScheduler.requestDrain();
        this.deliverPersistResourceFailures(persistResourceFailures, 'start');
    }

    public stop(): void {
        if (!this.isStarted) return;
        this.isStarted = false;
        this.persistScheduler.stop();
        const persistResources = this.persistResources;
        for (let i = 0; i < persistResources.length; i++) persistResources[i].stop();
    }

    public destroy(): void {
        this.stop();
        const persistResources = this.persistResources;
        for (let i = 0; i < persistResources.length; i++) persistResources[i].dropPendingWrite();
        persistResources.length = 0;
        this.dirtyPersistResources.clear();
        this.consecutiveFailureCounts.clear();
    }

    public whenIdle(): Promise<void> {
        return this.persistQueue;
    }

    public hydrate(): Promise<void> {
        return this.enqueue(async () => {
            const persistResourceFailures: TOIMPersistResourceFailure<TPersistBackend, TWriteBatch>[] = [];
            const persistResources = this.persistResources.slice();
            for (let i = 0; i < persistResources.length; i++) {
                const persistResource = persistResources[i];
                try {
                    await persistResource.hydrate(this.persistBackend);
                } catch (error) {
                    persistResourceFailures.push({ persistResource, error });
                }
            }
            this.deliverPersistResourceFailures(persistResourceFailures, 'hydrate');
        });
    }

    public persist(): Promise<void> {
        return this.enqueue(async () => {
            const persistResources = this.persistResources.slice();
            const persistResourceFailures = await this.writePersistResources(
                persistResources, (persistResource, writeBatch) => { persistResource.writeEverything(writeBatch); },
            );
            this.reportPersistResourceFailures(persistResourceFailures, 'persist');
        });
    }

    public clearPersisted(): Promise<void> {
        return this.enqueue(async () => {
            const persistResourceFailures = await this.writePersistResources(
                this.persistResources.slice(),
                (persistResource, writeBatch) => { persistResource.deleteEverything(writeBatch); },
            );
            this.reportPersistResourceFailures(persistResourceFailures, 'clear');
        });
    }

    public unload<TKey, TEntity extends object>(
        persistResourceRecords: OIMPersistResourceRecords<TPersistBackend, TWriteBatch, TKey, TEntity>,
        keys: readonly TKey[],
    ): Promise<void> {
        this.dirtyPersistResources.delete(persistResourceRecords);
        this.flushDirtyPersistResources();
        return this.enqueue(async () => {
            this.dirtyPersistResources.delete(persistResourceRecords);
            try {
                do {
                    await this.writeInOneWriteBatch(
                        [persistResourceRecords],
                        (_persistResource, writeBatch) => { persistResourceRecords.writeKeys(writeBatch, keys); },
                    );
                } while (persistResourceRecords.hasUnwrittenChangeOfKeys(keys));
            } catch (error) {
                if (this.isStarted && persistResourceRecords.hasPendingWrite()) this.dirtyPersistResources.add(persistResourceRecords);
                throw error;
            } finally {
                persistResourceRecords.disposeWrittenKeysChangeMark();
            }
            persistResourceRecords.unloadKeys(keys);
        });
    }

    public load<TKey, TEntity extends object>(
        persistResourceRecords: OIMPersistResourceRecords<TPersistBackend, TWriteBatch, TKey, TEntity>,
        keys: readonly TKey[],
    ): Promise<void> {
        this.flushDirtyPersistResources();
        return this.enqueue(() => persistResourceRecords.loadKeys(this.persistBackend, keys));
    }

    private startPersistResource(persistResource: IOIMPersistResource<TPersistBackend, TWriteBatch>): void {
        persistResource.start(() => { this.markPersistResourceDirty(persistResource); });
    }

    private markPersistResourceDirty(persistResource: IOIMPersistResource<TPersistBackend, TWriteBatch>): void {
        this.dirtyPersistResources.add(persistResource);
        this.persistScheduler.requestDrain();
    }

    private flushDirtyPersistResources(): void {
        const dirtyPersistResources = this.dirtyPersistResources;
        if (dirtyPersistResources.size === 0) return;
        const persistResources = Array.from(dirtyPersistResources);
        dirtyPersistResources.clear();
        void this.enqueue(() => this.autosavePersistResources(persistResources));
    }

    private async autosavePersistResources(
        persistResources: readonly IOIMPersistResource<TPersistBackend, TWriteBatch>[],
    ): Promise<void> {
        const pendingPersistResources = persistResources.filter(persistResource => persistResource.hasPendingWrite());
        const persistResourceFailures = await this.writePersistResources(
            pendingPersistResources,
            (persistResource, writeBatch) => { persistResource.writePendingWrite(writeBatch); },
        );
        const delayedPersistResourceFailures: TOIMPersistResourceFailure<TPersistBackend, TWriteBatch>[] = [];
        const quarantinedPersistResourceFailures: TOIMPersistResourceFailure<TPersistBackend, TWriteBatch>[] = [];
        for (let i = 0; i < persistResourceFailures.length; i++) {
            const persistResourceFailure = persistResourceFailures[i];
            const persistResource = persistResourceFailure.persistResource;
            if (this.persistResources.indexOf(persistResource) < 0) {
                delayedPersistResourceFailures.push(persistResourceFailure);
                continue;
            }
            const consecutiveFailureCount = (this.consecutiveFailureCounts.get(persistResource) ?? 0) + 1;
            this.consecutiveFailureCounts.set(persistResource, consecutiveFailureCount);
            if (consecutiveFailureCount < OIM_QUARANTINE_AFTER_CONSECUTIVE_FAILURES) {
                this.dirtyPersistResources.add(persistResource);
                delayedPersistResourceFailures.push(persistResourceFailure);
                continue;
            }
            persistResource.stop();
            persistResource.dropPendingWrite();
            this.dirtyPersistResources.delete(persistResource);
            if (consecutiveFailureCount === OIM_QUARANTINE_AFTER_CONSECUTIVE_FAILURES) {
                quarantinedPersistResourceFailures.push(persistResourceFailure);
            }
        }
        const onPersistError = this.onPersistError;
        if (onPersistError !== undefined) {
            for (let i = 0; i < delayedPersistResourceFailures.length; i++) {
                const persistResourceFailure = delayedPersistResourceFailures[i];
                onPersistError(
                    persistResourceFailure.error, this.persistErrorContextOf(persistResourceFailure.persistResource, 'persist'),
                );
            }
        }
        for (let i = 0; i < quarantinedPersistResourceFailures.length; i++) {
            this.notifyQuarantine(quarantinedPersistResourceFailures[i]);
        }
    }

    private async writePersistResources(
        persistResources: readonly IOIMPersistResource<TPersistBackend, TWriteBatch>[],
        writeInto: (persistResource: IOIMPersistResource<TPersistBackend, TWriteBatch>, writeBatch: TWriteBatch) => void,
    ): Promise<readonly TOIMPersistResourceFailure<TPersistBackend, TWriteBatch>[]> {
        if (persistResources.length === 0) return [];
        try {
            await this.writeInOneWriteBatch(persistResources, writeInto);
            return [];
        } catch (error) {
            if (persistResources.length === 1) return [{ persistResource: persistResources[0], error }];
        }
        const persistResourceFailures: TOIMPersistResourceFailure<TPersistBackend, TWriteBatch>[] = [];
        for (let i = 0; i < persistResources.length; i++) {
            try {
                await this.writeInOneWriteBatch([persistResources[i]], writeInto);
            } catch (error) {
                persistResourceFailures.push({ persistResource: persistResources[i], error });
            }
        }
        return persistResourceFailures;
    }

    private async writeInOneWriteBatch(
        persistResources: readonly IOIMPersistResource<TPersistBackend, TWriteBatch>[],
        writeInto: (persistResource: IOIMPersistResource<TPersistBackend, TWriteBatch>, writeBatch: TWriteBatch) => void,
    ): Promise<void> {
        const writeBatch = this.persistBackend.createWriteBatch();
        try {
            for (let i = 0; i < persistResources.length; i++) writeInto(persistResources[i], writeBatch);
            await writeBatch.commit();
        } catch (error) {
            for (let i = 0; i < persistResources.length; i++) {
                const persistResource = persistResources[i];
                persistResource.onPersistWriteFailed();
                if (this.persistResources.indexOf(persistResource) < 0) persistResource.dropPendingWrite();
            }
            throw error;
        }
        for (let i = 0; i < persistResources.length; i++) {
            persistResources[i].onPersistWriteCommitted();
            this.forgetConsecutiveFailuresOf(persistResources[i]);
        }
    }

    private reportPersistResourceFailures(
        persistResourceFailures: readonly TOIMPersistResourceFailure<TPersistBackend, TWriteBatch>[],
        persistOperation: TOIMPersistOperation,
    ): void {
        if (this.isStarted) {
            for (let i = 0; i < persistResourceFailures.length; i++) {
                const persistResource = persistResourceFailures[i].persistResource;
                if (!this.isPersistResourceQuarantined(persistResource) && persistResource.hasPendingWrite()) {
                    this.dirtyPersistResources.add(persistResource);
                }
            }
        }
        this.deliverPersistResourceFailures(persistResourceFailures, persistOperation);
    }

    private deliverPersistResourceFailures(
        persistResourceFailures: readonly TOIMPersistResourceFailure<TPersistBackend, TWriteBatch>[],
        persistOperation: TOIMPersistOperation,
    ): void {
        oimDeliverPersistErrors(this.onPersistError, persistResourceFailures.map(persistResourceFailure => ({
            error: persistResourceFailure.error,
            persistErrorContext: this.persistErrorContextOf(persistResourceFailure.persistResource, persistOperation),
        })));
    }

    private forgetConsecutiveFailuresOf(persistResource: IOIMPersistResource<TPersistBackend, TWriteBatch>): void {
        const consecutiveFailureCounts = this.consecutiveFailureCounts;
        if (consecutiveFailureCounts.size === 0 || !consecutiveFailureCounts.has(persistResource)) return;
        const wasQuarantined = this.isPersistResourceQuarantined(persistResource);
        consecutiveFailureCounts.delete(persistResource);
        if (wasQuarantined && this.isStarted) this.startPersistResource(persistResource);
    }

    private isPersistResourceQuarantined(persistResource: IOIMPersistResource<TPersistBackend, TWriteBatch>): boolean {
        return (this.consecutiveFailureCounts.get(persistResource) ?? 0) >= OIM_QUARANTINE_AFTER_CONSECUTIVE_FAILURES;
    }

    private notifyQuarantine(persistResourceFailure: TOIMPersistResourceFailure<TPersistBackend, TWriteBatch>): void {
        const onPersistError = this.onPersistError;
        if (onPersistError !== undefined) {
            onPersistError(persistResourceFailure.error, this.persistErrorContextOf(persistResourceFailure.persistResource, 'quarantine'));
            return;
        }
        console.error(
            `[OIMPersist]: autosave stopped writing a resource after ${OIM_QUARANTINE_AFTER_CONSECUTIVE_FAILURES} `
            + 'consecutive failed writes, and the change it was carrying was dropped. A failure that survives that many '
            + 'flushes is a property of the data (a cycle, a BigInt, a throwing toJSON, a value structured clone refuses) '
            + 'rather than a passing condition. Fix the value, then call persistor.persist(): a successful manual persist '
            + 'resumes autosave for this resource. Pass onPersistError to OIMPersistor to receive this as '
            + '`persistOperation: "quarantine"` instead.',
            persistResourceFailure.error,
        );
    }

    private persistErrorContextOf(
        persistResource: IOIMPersistResource<TPersistBackend, TWriteBatch>,
        persistOperation: TOIMPersistOperation,
    ): TOIMPersistErrorContext {
        return { persistResource, persistOperation };
    }

    private enqueue(work: () => Promise<void>): Promise<void> {
        const result = this.persistQueue.then(work);
        this.persistQueue = result.then(oimNoop, oimNoop);
        return result;
    }
}
