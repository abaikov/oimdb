import { EOIMEventQueueEventType, OIMEventQueue } from '@oimdb/core';
import { OIMPersistResource } from './OIMPersistResource';

export type TOIMPersistErrorContext = {
    resource: OIMPersistResource<unknown, unknown, unknown>;
    operation: 'persist' | 'hydrate';
};

export type TOIMPersistorOptions<TStorage> = {
    storage: TStorage;
    queue?: OIMEventQueue;
    onError?: (error: unknown, context: TOIMPersistErrorContext) => void;
};

export class OIMPersistor<TStorage> {
    public readonly storage: TStorage;
    public readonly queue?: OIMEventQueue;

    protected readonly resources: OIMPersistResource<any, any, any>[] = [];
    protected readonly onError?: (error: unknown, context: TOIMPersistErrorContext) => void;
    private readonly pendingWrites = new Set<OIMPersistResource<any, any, any>>();
    private isStarted = false;
    private isFlushScheduled = false;
    private unsubscribeAfterFlush?: () => void;

    constructor(options: TOIMPersistorOptions<TStorage>) {
        this.storage = options.storage;
        this.queue = options.queue;
        this.onError = options.onError;
    }

    public addResource<TResource extends OIMPersistResource<any, any, any>>(
        resource: TResource
    ): TResource {
        this.resources.push(resource);
        if (this.isStarted) resource.start(() => this.markDirty(resource));
        return resource;
    }

    public removeResource(resource: OIMPersistResource<any, any, any>): void {
        const index = this.resources.indexOf(resource);
        if (index < 0) return;
        this.resources.splice(index, 1);
        this.pendingWrites.delete(resource);
        resource.stop();
    }

    public getResources(): readonly OIMPersistResource<any, any, any>[] {
        return this.resources;
    }

    public markDirty(resource: OIMPersistResource<any, any, any>): void {
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
        resources: readonly OIMPersistResource<any, any, any>[]
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
