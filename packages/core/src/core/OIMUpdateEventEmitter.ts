import { OIMEventQueue } from './OIMEventQueue';
import { TOIMEventHandler } from '../type/TOIMEventHandler';
import { TOIMPk } from '../type/TOIMPk';
import { EOIMEventQueueEventType } from '../enum/EOIMEventQueueEventType';

type TOIMUpdateEventEmitterDeliveryMode = 'queue' | 'after_flush' | 'immediate';

/**
 * Universal event emitter that handles subscriptions and notifications for any key type.
 * Optimized for performance with adaptive algorithms and memory management.
 */
export class OIMUpdateEventEmitter<TKey extends TOIMPk> {
    protected keyHandlers = new Map<TKey, Set<TOIMEventHandler<void>>>();
    protected queue: OIMEventQueue;
    private readonly deliveryMode: TOIMUpdateEventEmitterDeliveryMode;
    private isFlushEnqueued = false;
    private dequeueFlush?: () => void;
    private updatedKeys = new Set<TKey>();
    private isAfterFlushDeliveryScheduled = false;
    private unsubscribeAfterFlushDelivery?: () => void;

    constructor(
        queue: OIMEventQueue,
        deliveryMode: TOIMUpdateEventEmitterDeliveryMode = 'queue'
    ) {
        this.queue = queue;
        this.deliveryMode = deliveryMode;

        if (this.deliveryMode === 'after_flush') {
            this.unsubscribeAfterFlushDelivery = this.queue.emitter.on(
                EOIMEventQueueEventType.AFTER_FLUSH,
                this.onAfterFlush
            );
        }
    }

    /**
     * Mark keys as updated and schedule delivery.
     *
     * If there are no subscriptions, this is a no-op and does not allocate or retain keys.
     */
    public markUpdatedKeys(keys: readonly TKey[]): void {
        if (keys.length === 0) return;
        if (this.deliveryMode === 'queue' && this.queue.isInFlush) {
            throw new Error(
                'OIMUpdateEventEmitter: updates during queue.flush() are not allowed. ' +
                    'Finish all writes before calling queue.flush().'
            );
        }
        if (this.keyHandlers.size === 0) return;

        let didAddAny = false;
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const handlers = this.keyHandlers.get(key);
            // If no one is subscribed for this key, don't retain it.
            if (!handlers || handlers.size === 0) continue;
            this.updatedKeys.add(key);
            didAddAny = true;
        }

        if (!didAddAny) return;
        if (this.deliveryMode === 'immediate') {
            this.deliverImmediate();
            return;
        }
        if (this.deliveryMode === 'after_flush') {
            this.isAfterFlushDeliveryScheduled = true;
            return;
        }

        if (this.isFlushEnqueued) return;
        this.isFlushEnqueued = true;
        this.dequeueFlush = this.queue.enqueue(this.onFlush);
    }

    public markUpdatedKey(key: TKey): void {
        if (this.deliveryMode === 'queue' && this.queue.isInFlush) {
            throw new Error(
                'OIMUpdateEventEmitter: updates during queue.flush() are not allowed. ' +
                    'Finish all writes before calling queue.flush().'
            );
        }
        if (this.keyHandlers.size === 0) return;

        const handlers = this.keyHandlers.get(key);
        if (!handlers || handlers.size === 0) return;

        this.updatedKeys.add(key);

        if (this.deliveryMode === 'immediate') {
            this.deliverImmediate();
            return;
        }
        if (this.deliveryMode === 'after_flush') {
            this.isAfterFlushDeliveryScheduled = true;
            return;
        }

        if (this.isFlushEnqueued) return;
        this.isFlushEnqueued = true;
        this.dequeueFlush = this.queue.enqueue(this.onFlush);
    }

    public markAllUpdated(): void {
        if (this.deliveryMode === 'queue' && this.queue.isInFlush) {
            throw new Error(
                'OIMUpdateEventEmitter: updates during queue.flush() are not allowed. ' +
                    'Finish all writes before calling queue.flush().'
            );
        }
        if (this.keyHandlers.size === 0) return;

        this.keyHandlers.forEach((_handlers, key) => {
            this.updatedKeys.add(key);
        });

        if (this.deliveryMode === 'immediate') {
            this.deliverImmediate();
            return;
        }
        if (this.deliveryMode === 'after_flush') {
            this.isAfterFlushDeliveryScheduled = true;
            return;
        }

        if (this.isFlushEnqueued) return;
        this.isFlushEnqueued = true;
        this.dequeueFlush = this.queue.enqueue(this.onFlush);
    }

    // Stable handler reference to avoid allocating a new closure on every HAS_CHANGES.
    protected readonly onFlush = () => {
        this.isFlushEnqueued = false;
        this.dequeueFlush = undefined;

        // Early exit if no handlers are registered
        if (this.keyHandlers.size === 0) {
            this.updatedKeys.clear();
            return;
        }

        const makeHandlerSnapshot = (
            handlers: Set<TOIMEventHandler<void>>
        ): TOIMEventHandler<void>[] => {
            const snapshot: TOIMEventHandler<void>[] = [];
            handlers.forEach(h => snapshot.push(h));
            return snapshot;
        };

        this.runSinglePass(makeHandlerSnapshot);
    };

    private deliverImmediate(): void {
        const makeHandlerSnapshot = (
            handlers: Set<TOIMEventHandler<void>>
        ): TOIMEventHandler<void>[] => {
            const snapshot: TOIMEventHandler<void>[] = [];
            handlers.forEach(h => snapshot.push(h));
            return snapshot;
        };

        this.runSinglePass(makeHandlerSnapshot);
    }

    private readonly onAfterFlush = () => {
        if (!this.isAfterFlushDeliveryScheduled) return;
        this.isAfterFlushDeliveryScheduled = false;
        this.deliverImmediate();
    };

    /**
     * Deliver updated keys and notify handlers once.
     * Re-entrant updates during delivery are forbidden and will throw in markUpdatedKeys().
     */
    protected runSinglePass(
        makeHandlerSnapshot: (
            handlers: Set<TOIMEventHandler<void>>
        ) => TOIMEventHandler<void>[]
    ): void {
        if (this.updatedKeys.size === 0) return;

        const flushingKeys = this.updatedKeys;
        this.updatedKeys = new Set<TKey>();

        if (this.keyHandlers.size === 0 || flushingKeys.size === 0) return;

        if (flushingKeys.size * 2 < this.keyHandlers.size) {
            flushingKeys.forEach(key => {
                const handlers = this.keyHandlers.get(key);
                if (!handlers || handlers.size === 0) return;

                const handlerSnapshot = makeHandlerSnapshot(handlers);
                for (let i = 0; i < handlerSnapshot.length; i++) {
                    const handler = handlerSnapshot[i];
                    if (handlers.has(handler)) handler();
                }
            });
        } else {
            this.keyHandlers.forEach((handlers, key) => {
                if (!flushingKeys.has(key)) return;
                if (!handlers || handlers.size === 0) return;

                const handlerSnapshot = makeHandlerSnapshot(handlers);
                for (let i = 0; i < handlerSnapshot.length; i++) {
                    const handler = handlerSnapshot[i];
                    if (handlers.has(handler)) handler();
                }
            });
        }
    }

    public destroy() {
        if (this.dequeueFlush) {
            this.dequeueFlush();
            this.dequeueFlush = undefined;
        }
        if (this.unsubscribeAfterFlushDelivery) {
            this.unsubscribeAfterFlushDelivery();
            this.unsubscribeAfterFlushDelivery = undefined;
        }

        // Clear all handlers to free memory
        this.keyHandlers.forEach(handlers => handlers.clear());
        this.keyHandlers.clear();
        this.updatedKeys.clear();
    }

    /**
     * Get performance metrics for monitoring and debugging
     */
    public getMetrics() {
        let totalHandlers = 0;
        this.keyHandlers.forEach(handlers => {
            totalHandlers += handlers.size;
        });

        return {
            totalKeys: this.keyHandlers.size,
            totalHandlers,
            averageHandlersPerKey:
                this.keyHandlers.size > 0
                    ? totalHandlers / this.keyHandlers.size
                    : 0,
            queueLength: this.queue.length,
        };
    }

    /**
     * Check if there are any active subscriptions
     */
    public hasSubscriptions(): boolean {
        return this.keyHandlers.size > 0;
    }

    /**
     * Get the number of handlers for a specific key
     */
    public getHandlerCount(key: TKey): number {
        return this.keyHandlers.get(key)?.size ?? 0;
    }

    public subscribeOnKey(key: TKey, handler: TOIMEventHandler<void>) {
        let handlers = this.keyHandlers.get(key);
        if (!handlers) {
            handlers = new Set();
            this.keyHandlers.set(key, handlers);
        }
        handlers.add(handler);
        return () => {
            this.unsubscribeFromKey(key, handler);
        };
    }

    public unsubscribeFromKey(key: TKey, handler: TOIMEventHandler<void>) {
        const handlers = this.keyHandlers.get(key);
        if (!handlers) return;

        handlers.delete(handler);

        // Clean up empty handler sets to prevent memory leaks
        if (handlers.size === 0) {
            this.keyHandlers.delete(key);
            // If no one is subscribed anymore, don't keep this key pending.
            this.updatedKeys.delete(key);
        }

        // If there are no subscriptions at all, drop any pending work and cancel scheduled flush.
        if (this.keyHandlers.size === 0) {
            this.updatedKeys.clear();
            if (this.dequeueFlush) {
                this.dequeueFlush();
                this.dequeueFlush = undefined;
            }
            this.isFlushEnqueued = false;
        }
    }

    public subscribeOnKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ) {
        // Batch subscribe for better performance
        const subscribedKeys: TKey[] = [];

        for (const key of keys) {
            let handlers = this.keyHandlers.get(key);
            if (!handlers) {
                handlers = new Set();
                this.keyHandlers.set(key, handlers);
            }

            // Only track keys where we actually added the handler
            if (!handlers.has(handler)) {
                handlers.add(handler);
                subscribedKeys.push(key);
            }
        }

        return () => {
            // Only unsubscribe from keys where we actually subscribed
            for (const key of subscribedKeys) {
                this.unsubscribeFromKey(key, handler);
            }
        };
    }

    public unsubscribeFromKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ) {
        // Batch unsubscribe - more efficient than individual calls
        for (const key of keys) {
            this.unsubscribeFromKey(key, handler);
        }
    }
}
