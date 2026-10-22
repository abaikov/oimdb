import type { TOIMKey } from '../types/TOIMKey';
import type { OIMEventQueue } from './OIMEventQueue';
import type { TOIMEventHandler } from '../types/TOIMEventHandler';

/**
 * Keyed pub/sub: who is subscribed, which keys changed, and how to notify them.
 *
 * WHEN the notification happens is the one thing this class does not decide —
 * that is the subclass's whole job, and there are exactly three answers:
 *
 * - {@link OIMUpdateEventEmitterQueued} — inside the next `queue.flush()`. The
 *   default: a reaction to changed data, coalesced per frame. Only this one
 *   refuses writes mid-frame, because only for this one is "mid-frame" a
 *   contradiction.
 * - {@link OIMUpdateEventEmitterAfterFlush} — once the frame is over. For
 *   consumers that ACCUMULATE a description of the frame (ordered-list command
 *   streams, changed-field tracking) and can only publish it complete.
 * - {@link OIMUpdateEventEmitterImmediate} — right now, no queue. For advancing
 *   a graph: a computed publishing its new value inside the effect phase, where
 *   queueing would stretch a three-link chain across three frames.
 *
 * This used to be one class with a `deliveryMode` string, tested twelve times at
 * runtime — three times in each of the three mark methods, on the hot path, to
 * re-derive something fixed at construction. Worse, the mid-frame guard applied
 * to one mode only, which no signature said: you had to read the body to learn
 * that an immediate emitter is exempt.
 */
export abstract class OIMUpdateEventEmitter<TKey extends TOIMKey> {
    protected keyHandlers = new Map<TKey, Set<TOIMEventHandler<void>>>();
    protected queue: OIMEventQueue;
    protected isFlushEnqueued = false;
    private updatedKeys = new Set<TKey>();

    constructor(queue: OIMEventQueue) {
        this.queue = queue;
    }

    /**
     * Publish the keys collected so far — the subclass decides when that is.
     * Called only when something was actually collected.
     */
    protected abstract scheduleDelivery(): void;

    /**
     * Mark keys as updated and schedule delivery.
     *
     * If there are no subscriptions, this is a no-op and does not allocate or retain keys.
     */
    public markUpdatedKeys(keys: readonly TKey[]): void {
        if (keys.length === 0) return;
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
        this.scheduleDelivery();
    }

    public markUpdatedKey(key: TKey): void {
        if (this.keyHandlers.size === 0) return;

        const handlers = this.keyHandlers.get(key);
        if (!handlers || handlers.size === 0) return;

        this.updatedKeys.add(key);
        this.scheduleDelivery();
    }

    public markAllUpdated(): void {
        if (this.keyHandlers.size === 0) return;

        this.keyHandlers.forEach((_handlers, key) => {
            this.updatedKeys.add(key);
        });
        this.scheduleDelivery();
    }

    // Stable handler reference to avoid allocating a new closure on every HAS_CHANGES.
    protected readonly onFlush = () => {
        this.isFlushEnqueued = false;

        // Early exit if no handlers are registered
        if (this.keyHandlers.size === 0) {
            this.updatedKeys.clear();
            return;
        }

        this.runSinglePass();
    };

    /**
     * Notifies all handlers for a key. The overwhelmingly common case is a
     * single subscriber per key (one component per pk), handled without any
     * allocation. For multiple subscribers a snapshot is taken so a handler may
     * (un)subscribe during iteration without corrupting the walk.
     */
    private notifyHandlers(handlers: Set<TOIMEventHandler<void>>): void {
        if (handlers.size === 1) {
            const only = handlers.values().next().value;
            if (only) only();
            return;
        }

        const snapshot: TOIMEventHandler<void>[] = [];
        handlers.forEach(h => snapshot.push(h));
        for (let i = 0; i < snapshot.length; i++) {
            const handler = snapshot[i];
            if (handlers.has(handler)) handler();
        }
    }

    /**
     * Deliver updated keys and notify handlers once.
     * Re-entrant updates during delivery are forbidden and will throw in markUpdatedKeys().
     */
    protected runSinglePass(): void {
        if (this.updatedKeys.size === 0) return;

        const flushingKeys = this.updatedKeys;
        this.updatedKeys = new Set<TKey>();

        if (this.keyHandlers.size === 0 || flushingKeys.size === 0) return;

        // `updatedKeys` only ever holds keys that have handlers (markUpdated*
        // filters), so M <= K. For M < K, walking the changed keys and probing
        // the map (sparse) does fewer lookups than walking the whole map.
        // The one exception is M === K — every subscribed key dirty, as from
        // markAllUpdated()/clear() — where iterating the map in place beats K
        // repeated get() re-hashes by ~7-10% (benchmarked, min-of-7). Switch
        // walks on that exact condition; both still probe membership, so either
        // is correct if subscriptions changed between mark and flush.
        if (flushingKeys.size === this.keyHandlers.size) {
            this.keyHandlers.forEach((handlers, key) => {
                if (!flushingKeys.has(key)) return;
                if (!handlers || handlers.size === 0) return;
                this.notifyHandlers(handlers);
            });
        } else {
            flushingKeys.forEach(key => {
                const handlers = this.keyHandlers.get(key);
                if (!handlers || handlers.size === 0) return;
                this.notifyHandlers(handlers);
            });
        }
    }

    public destroy() {
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
            if (this.isFlushEnqueued) {
                this.queue.cancel(this.onFlush);
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
