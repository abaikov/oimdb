import { EOIMEventQueueEventType, OIMEventQueue } from '@oimdb/core';
import { IOIMAnyPersistResource } from '../interfaces/IOIMAnyPersistResource';
import { TOIMPersistBatchItem } from '../types/TOIMPersistBatchItem';
import { TOIMPersistDelta } from '../types/TOIMPersistDelta';
import { TOIMPersistErrorContext } from '../types/TOIMPersistErrorContext';
import { TOIMPersistorOptions } from '../types/TOIMPersistorOptions';

export class OIMPersistor<TStorage> {
    public readonly storage: TStorage;
    public readonly queue?: OIMEventQueue;

    protected readonly resources: IOIMAnyPersistResource<this>[] = [];
    protected readonly onError?: (error: unknown, context: TOIMPersistErrorContext) => void;
    // Per-resource dirty state accumulated between flushes. `'all'` means a full
    // snapshot is required; a Set of keys means only those keys changed (a delta
    // candidate). Once a resource is marked `'all'` it stays so until flushed —
    // a coarse change can't be narrowed back to a delta.
    private readonly pendingWrites = new Map<
        IOIMAnyPersistResource<this>,
        'all' | Set<unknown>
    >();
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
        if (this.isStarted) {
            resource.start(keys => this.markDirty(resource, keys));
        }
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

    public markDirty(
        resource: IOIMAnyPersistResource<this>,
        keys?: readonly unknown[]
    ): void {
        if (!this.isStarted) return;
        const prev = this.pendingWrites.get(resource);
        if (prev !== 'all') {
            if (keys === undefined) {
                // Coarse "something changed" signal → must write everything.
                this.pendingWrites.set(resource, 'all');
            } else {
                const set = prev ?? new Set<unknown>();
                for (let i = 0; i < keys.length; i++) set.add(keys[i]);
                this.pendingWrites.set(resource, set);
            }
        }
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
            resource.start(keys => this.markDirty(resource, keys));
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
        // Manual, full persist of every resource — always a full snapshot.
        await this.batchPersist(
            this.resources.map(resource => ({
                resource,
                dirty: 'all' as const,
            }))
        );
    }

    public async clearPersisted(): Promise<void> {
        for (let i = 0; i < this.resources.length; i++) {
            await this.resources[i].strategy.clear(this);
        }
    }

    protected async batchPersist(
        items: readonly TOIMPersistBatchItem<this>[]
    ): Promise<void> {
        for (let i = 0; i < items.length; i++) {
            const { resource, dirty } = items[i];
            try {
                await this.writeResource(resource, dirty);
            } catch (error) {
                if (this.onError) {
                    this.onError(error, { resource, operation: 'persist' });
                } else {
                    throw error;
                }
            }
        }
    }

    /**
     * Persist one resource: a delta when it changed at key granularity and the
     * strategy can write deltas, otherwise the full snapshot. Shared so a
     * backend persistor's `batchPersist` override can reuse it for resources it
     * doesn't handle in its own (e.g. transactional) fast path.
     */
    protected async writeResource(
        resource: IOIMAnyPersistResource<this>,
        dirty: 'all' | readonly unknown[]
    ): Promise<void> {
        if (dirty !== 'all' && resource.supportsDelta()) {
            const writeDelta = resource.strategy.writeDelta;
            // supportsDelta() guarantees writeDelta is defined.
            await writeDelta!(
                this,
                resource.takeDelta(dirty) as TOIMPersistDelta<unknown, unknown>
            );
        } else {
            await resource.strategy.write(this, resource.takeSnapshot());
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
        const items: TOIMPersistBatchItem<this>[] = [];
        for (const [resource, dirty] of this.pendingWrites) {
            items.push({
                resource,
                dirty: dirty === 'all' ? 'all' : Array.from(dirty),
            });
        }
        this.pendingWrites.clear();
        void this.batchPersist(items);
    }
}
