import { OIMUpdateEventCoalescer } from './OIMUpdateEventCoalescer';
import { OIMEventQueue } from './OIMEventQueue';
import { TOIMEventHandler } from '../type/TOIMEventHandler';
import { EOIMUpdateEventCoalescerEventType } from '../enum/EOIMUpdateEventCoalescerEventType';
import { TOIMUpdateEventEmitterOptions } from '../type/TOIMUpdateEventEmitterOptions';
import { TOIMPk } from '../type/TOIMPk';

/**
 * Universal event emitter that handles subscriptions and notifications for any key type.
 * Optimized for performance with adaptive algorithms and memory management.
 */
export class OIMUpdateEventEmitter<TKey extends TOIMPk> {
    protected keyHandlersBeforeFlush = new Map<
        TKey,
        Set<TOIMEventHandler<void>>
    >();
    protected keyHandlers = new Map<TKey, Set<TOIMEventHandler<void>>>();
    protected coalescer: OIMUpdateEventCoalescer<TKey>;
    protected queue: OIMEventQueue;
    private isDestroyed = false;
    private isDispatching = false;
    private isInPrePhase = false;
    private hasPendingDuringPrePhase = false;
    private isFlushEnqueued = false;

    constructor(opts: TOIMUpdateEventEmitterOptions<TKey>) {
        this.coalescer = opts.coalescer;
        this.coalescer.emitter.on(
            EOIMUpdateEventCoalescerEventType.HAS_CHANGES,
            this.handleHasChanges
        );
        this.queue = opts.queue;
    }

    protected handleHasChanges = () => {
        // If updates happen while we're already draining pre-phase, we fold them into the same run
        // (computed-only drain) instead of scheduling redundant queue tasks.
        if (this.isDispatching && this.isInPrePhase) {
            this.hasPendingDuringPrePhase = true;
            return;
        }

        if (this.isFlushEnqueued) return;
        this.isFlushEnqueued = true;
        this.queue.enqueue(this.onFlush);
    };

    // Stable handler reference to avoid allocating a new closure on every HAS_CHANGES.
    protected readonly onFlush = () => {
        // Allow new HAS_CHANGES during this run (e.g. from normal handlers) to enqueue a follow-up batch.
        this.isFlushEnqueued = false;

        if (this.isDestroyed) {
            // Best-effort cleanup: keep coalescer state from growing unbounded.
            this.coalescer.clearUpdatedKeys();
            this.coalescer.clearFlushingUpdatedKeys();
            return;
        }

        // Early exit if no handlers are registered
        if (
            this.keyHandlers.size === 0 &&
            this.keyHandlersBeforeFlush.size === 0
        ) {
            this.coalescer.clearUpdatedKeys();
            return;
        }

        const makeHandlerSnapshot = (
            handlers: Set<TOIMEventHandler<void>>
        ): TOIMEventHandler<void>[] => {
            const snapshot: TOIMEventHandler<void>[] = [];
            handlers.forEach(h => snapshot.push(h));
            return snapshot;
        };

        try {
            this.isDispatching = true;
            this.isInPrePhase = true;
            this.hasPendingDuringPrePhase = false;

            const allKeysForNormalPhase =
                this.runPrePhaseDrain(makeHandlerSnapshot);
            this.isInPrePhase = false;
            this.runHandlersPhase(allKeysForNormalPhase, makeHandlerSnapshot);
        } finally {
            this.isInPrePhase = false;
            this.isDispatching = false;
        }
    };

    /**
     * Helps to run computed values etc.
     */
    protected runPrePhaseDrain(
        makeHandlerSnapshot: (
            handlers: Set<TOIMEventHandler<void>>
        ) => TOIMEventHandler<void>[]
    ): Set<TKey> {
        const allKeysForNormalPhase = new Set<TKey>();
        let hasMorePreWork = true;

        while (hasMorePreWork) {
            this.coalescer.markUpdatedKeysAsFlushing();
            const flushingKeys = this.coalescer.getFlushingUpdatedKeys();
            flushingKeys.forEach(key => allKeysForNormalPhase.add(key));

            try {
                if (this.keyHandlersBeforeFlush.size > 0) {
                    if (
                        flushingKeys.size * 2 <
                        this.keyHandlersBeforeFlush.size
                    ) {
                        flushingKeys.forEach(key => {
                            if (this.isDestroyed) return;
                            const handlers =
                                this.keyHandlersBeforeFlush.get(key);
                            if (!handlers || handlers.size === 0) return;

                            const handlerSnapshot =
                                makeHandlerSnapshot(handlers);
                            for (let i = 0; i < handlerSnapshot.length; i++) {
                                if (this.isDestroyed) return;
                                const handler = handlerSnapshot[i];
                                if (handlers.has(handler)) handler();
                            }
                        });
                    } else {
                        this.keyHandlersBeforeFlush.forEach((handlers, key) => {
                            if (this.isDestroyed) return;
                            if (!flushingKeys.has(key)) return;
                            if (!handlers || handlers.size === 0) return;

                            const handlerSnapshot =
                                makeHandlerSnapshot(handlers);
                            for (let i = 0; i < handlerSnapshot.length; i++) {
                                if (this.isDestroyed) return;
                                const handler = handlerSnapshot[i];
                                if (handlers.has(handler)) handler();
                            }
                        });
                    }
                }
            } finally {
                this.coalescer.clearFlushingUpdatedKeys();
            }

            const nextHasMorePreWork =
                this.hasPendingDuringPrePhase ||
                this.coalescer.getUpdatedKeys().size > 0;
            this.hasPendingDuringPrePhase = false;
            hasMorePreWork = nextHasMorePreWork;
        }

        return allKeysForNormalPhase;
    }

    protected runHandlersPhase(
        allKeysForNormalPhase: ReadonlySet<TKey>,
        makeHandlerSnapshot: (
            handlers: Set<TOIMEventHandler<void>>
        ) => TOIMEventHandler<void>[]
    ): void {
        if (this.keyHandlers.size === 0 || allKeysForNormalPhase.size === 0)
            return;

        if (allKeysForNormalPhase.size * 2 < this.keyHandlers.size) {
            allKeysForNormalPhase.forEach(key => {
                if (this.isDestroyed) return;
                const handlers = this.keyHandlers.get(key);
                if (!handlers || handlers.size === 0) return;

                const handlerSnapshot = makeHandlerSnapshot(handlers);
                for (let i = 0; i < handlerSnapshot.length; i++) {
                    if (this.isDestroyed) return;
                    const handler = handlerSnapshot[i];
                    if (handlers.has(handler)) handler();
                }
            });
        } else {
            this.keyHandlers.forEach((handlers, key) => {
                if (this.isDestroyed) return;
                if (!allKeysForNormalPhase.has(key)) return;
                if (!handlers || handlers.size === 0) return;

                const handlerSnapshot = makeHandlerSnapshot(handlers);
                for (let i = 0; i < handlerSnapshot.length; i++) {
                    if (this.isDestroyed) return;
                    const handler = handlerSnapshot[i];
                    if (handlers.has(handler)) handler();
                }
            });
        }
    }

    public destroy() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;
        this.coalescer.emitter.off(
            EOIMUpdateEventCoalescerEventType.HAS_CHANGES,
            this.handleHasChanges
        );

        // Clear all handlers to free memory
        this.keyHandlersBeforeFlush.clear();
        this.keyHandlers.clear();
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
        return (
            this.keyHandlers.size > 0 || this.keyHandlersBeforeFlush.size > 0
        );
    }

    /**
     * Get the number of handlers for a specific key
     */
    public getHandlerCount(key: TKey): number {
        return (
            (this.keyHandlers.get(key)?.size ?? 0) +
            (this.keyHandlersBeforeFlush.get(key)?.size ?? 0)
        );
    }

    public subscribeOnKeyBeforeFlush(
        key: TKey,
        handler: TOIMEventHandler<void>
    ) {
        let handlers = this.keyHandlersBeforeFlush.get(key);
        if (!handlers) {
            handlers = new Set();
            this.keyHandlersBeforeFlush.set(key, handlers);
        }
        handlers.add(handler);
        return () => {
            this.unsubscribeFromKeyBeforeFlush(key, handler);
        };
    }

    public unsubscribeFromKeyBeforeFlush(
        key: TKey,
        handler: TOIMEventHandler<void>
    ) {
        const handlers = this.keyHandlersBeforeFlush.get(key);
        if (!handlers) return;

        handlers.delete(handler);

        if (handlers.size === 0) {
            this.keyHandlersBeforeFlush.delete(key);
        }
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

    public subscribeOnKeysBeforeFlush(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ) {
        const subscribedKeys: TKey[] = [];

        for (const key of keys) {
            let handlers = this.keyHandlersBeforeFlush.get(key);
            if (!handlers) {
                handlers = new Set();
                this.keyHandlersBeforeFlush.set(key, handlers);
            }

            if (!handlers.has(handler)) {
                handlers.add(handler);
                subscribedKeys.push(key);
            }
        }

        return () => {
            for (const key of subscribedKeys) {
                this.unsubscribeFromKeyBeforeFlush(key, handler);
            }
        };
    }

    public unsubscribeFromKeysBeforeFlush(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ) {
        for (const key of keys) {
            this.unsubscribeFromKeyBeforeFlush(key, handler);
        }
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
