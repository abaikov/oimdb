import { OIMUpdateEventCoalescer } from './OIMUpdateEventCoalescer';
import { OIMEventQueue } from './OIMEventQueue';
import { TOIMEventHandler } from '../types/TOIMEventHandler';
import { EOIMUpdateEventCoalescerEventType } from '../enum/EOIMUpdateEventCoalescerEventType';
import { TOIMUpdateEventEmitterOptions } from '../types/TOIMUpdateEventEmitterOptions';

/**
 * Universal event emitter that handles subscriptions and notifications for any key type.
 * Optimized for performance with adaptive algorithms and memory management.
 */
export class OIMUpdateEventEmitter<TKey> {
    protected keyHandlers = new Map<TKey, Set<TOIMEventHandler<void>>>();
    protected coalescer: OIMUpdateEventCoalescer<TKey>;
    protected queue: OIMEventQueue;

    constructor(opts: TOIMUpdateEventEmitterOptions<TKey>) {
        this.coalescer = opts.coalescer;
        this.coalescer.emitter.on(
            EOIMUpdateEventCoalescerEventType.HAS_CHANGES,
            this.handleHasChanges
        );
        this.queue = opts.queue;
    }

    protected handleHasChanges = () => {
        this.queue.enqueue(() => {
            const updatedKeys = this.coalescer.getUpdatedKeys();

            // Early exit if no handlers are registered
            if (this.keyHandlers.size === 0) {
                this.coalescer.clearUpdatedKeys();
                return;
            }

            // Adaptive algorithm: choose optimal iteration strategy
            if (updatedKeys.size * 2 < this.keyHandlers.size) {
                // Few updates: iterate through updated keys (more efficient)
                for (const key of updatedKeys) {
                    const handlers = this.keyHandlers.get(key);
                    if (handlers) {
                        for (const handler of handlers) {
                            handler();
                        }
                    }
                }
            } else {
                // Many updates: iterate through all handlers (more efficient)
                for (const [key, handlers] of this.keyHandlers) {
                    if (updatedKeys.has(key)) {
                        for (const handler of handlers) {
                            handler();
                        }
                    }
                }
            }

            this.coalescer.clearUpdatedKeys();
        });
    };

    public destroy() {
        this.coalescer.emitter.off(
            EOIMUpdateEventCoalescerEventType.HAS_CHANGES,
            this.handleHasChanges
        );

        // Clear all handlers to free memory
        this.keyHandlers.clear();
    }

    /**
     * Get performance metrics for monitoring and debugging
     */
    public getMetrics() {
        let totalHandlers = 0;
        for (const handlers of this.keyHandlers.values()) {
            totalHandlers += handlers.size;
        }

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
