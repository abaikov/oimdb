import { EOIMEventQueueEventType, OIMEventQueue } from '@oimdb/core';
import { IOIMAnyPersistResource } from '../interfaces/IOIMAnyPersistResource';
import { TOIMPersistErrorContext } from '../types/TOIMPersistErrorContext';
import { TOIMPersistorOptions } from '../types/TOIMPersistorOptions';

export class OIMPersistor<TStorage> {
    public readonly storage: TStorage;
    public readonly queue?: OIMEventQueue;

    protected readonly resources: IOIMAnyPersistResource<this>[] = [];
    protected readonly onError?: (error: unknown, context: TOIMPersistErrorContext) => void;
    private readonly pendingWrites = new Set<IOIMAnyPersistResource<this>>();
    private isStarted = false;
    private isFlushScheduled = false;
    private unsubscribeAfterFlush?: () => void;

    constructor(options: TOIMPersistorOptions<TStorage>) {
        this.storage = options.storage;
        this.queue = options.queue;
        this.onError = options.onError;
    }

    public addResource<TResource extends IOIMAnyPersistResource<this>>(
        resource: TResource
    ): TResource {
        this.resources.push(resource);
        if (this.isStarted) resource.start(() => this.markDirty(resource));
        return resource;
    }

    public removeResource(resource: IOIMAnyPersistResource<this>): void {
        const index = this.resources.indexOf(resource);
        if (index < 0) return;
        this.resources.splice(index, 1);
        this.pendingWrites.delete(resource);
        resource.stop();
    }

    public getResources(): readonly IOIMAnyPersistResource<this>[] {
        return this.resources;
    }

    public markDirty(resource: IOIMAnyPersistResource<this>): void {
        if (!this.isStarted) return;
        this.pendingWrites.add(resource);
        if (!this.queue && !this.isFlushScheduled) {
            this.isFlushScheduled = true;
            queueMicrotask(this.runScheduledFlush);
        }
    }

    public start(): void {
        if (this.isStarted) return;
        this.isStarted = true;
        for (let i = 0; i < this.resources.length; i++) {
            const resource = this.resources[i];
            resource.start(() => this.markDirty(resource));
        }
        if (this.queue) {
            this.unsubscribeAfterFlush = this.queue.emitter.on(
                EOIMEventQueueEventType.AFTER_FLUSH,
                this.onAfterFlush
            );
        }
    }

    public stop(): void {
        if (!this.isStarted) return;
        this.isStarted = false;
        this.unsubscribeAfterFlush?.();
        this.unsubscribeAfterFlush = undefined;
        for (let i = 0; i < this.resources.length; i++) {
            this.resources[i].stop();
        }
    }

    public destroy(): void {
        this.stop();
        this.resources.length = 0;
        this.pendingWrites.clear();
    }

    public async hydrate(): Promise<void> {
        for (let i = 0; i < this.resources.length; i++) {
            const resource = this.resources[i];
            try {
                const snapshot = await resource.strategy.read(this);
                if (snapshot !== undefined) resource.applySnapshot(snapshot);
            } catch (error) {
                if (this.onError) {
                    this.onError(error, { resource, operation: 'hydrate' });
                } else {
                    throw error;
                }
            }
        }
    }

    public async persist(): Promise<void> {
        await this.batchPersist(this.resources);
    }

    public async clearPersisted(): Promise<void> {
        for (let i = 0; i < this.resources.length; i++) {
            await this.resources[i].strategy.clear(this);
        }
    }

    protected async batchPersist(
        resources: readonly IOIMAnyPersistResource<this>[]
    ): Promise<void> {
        for (let i = 0; i < resources.length; i++) {
            const resource = resources[i];
            try {
                await resource.strategy.write(this, resource.takeSnapshot());
            } catch (error) {
                if (this.onError) {
                    this.onError(error, { resource, operation: 'persist' });
                } else {
                    throw error;
                }
            }
        }
    }

    private readonly runScheduledFlush = (): void => {
        this.isFlushScheduled = false;
        this.flushPending();
    };

    private readonly onAfterFlush = (): void => {
        this.flushPending();
    };

    private flushPending(): void {
        if (this.pendingWrites.size === 0) return;
        const toWrite = Array.from(this.pendingWrites);
        this.pendingWrites.clear();
        void this.batchPersist(toWrite);
    }
}
