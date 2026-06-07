import { OIMEventQueue, TOIMEventHandler, TOIMPk } from '@oimdb/core';

/**
 * Internal keyed update emitter for @oimdb/async reactive nodes.
 *
 * NOTE: @oimdb/core deliberately does not export its internal update emitters.
 * Async package keeps its own minimal implementation and exposes only the
 * subscribe/unsubscribe methods on reactive wrappers.
 */
export class OIMUpdateEventEmitterAsync<TKey extends TOIMPk> {
    private readonly keyHandlers = new Map<TKey, Set<TOIMEventHandler<void>>>();
    private updatedKeys = new Set<TKey>();
    private isFlushEnqueued = false;

    constructor(private readonly queue: OIMEventQueue) {}

    public subscribeOnKey(
        key: TKey,
        handler: TOIMEventHandler<void>
    ): () => void {
        let handlers = this.keyHandlers.get(key);
        if (!handlers) {
            handlers = new Set();
            this.keyHandlers.set(key, handlers);
        }
        handlers.add(handler);
        return () => this.unsubscribeFromKey(key, handler);
    }

    public subscribeOnKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ): () => void {
        const subscribedKeys: TKey[] = [];
        for (const key of keys) {
            let handlers = this.keyHandlers.get(key);
            if (!handlers) {
                handlers = new Set();
                this.keyHandlers.set(key, handlers);
            }
            if (!handlers.has(handler)) {
                handlers.add(handler);
                subscribedKeys.push(key);
            }
        }
        return () => {
            for (const key of subscribedKeys) this.unsubscribeFromKey(key, handler);
        };
    }

    public unsubscribeFromKey(key: TKey, handler: TOIMEventHandler<void>): void {
        const handlers = this.keyHandlers.get(key);
        if (!handlers) return;

        handlers.delete(handler);

        if (handlers.size === 0) {
            this.keyHandlers.delete(key);
            this.updatedKeys.delete(key);
        }

        if (this.keyHandlers.size === 0) {
            this.updatedKeys.clear();
            if (this.isFlushEnqueued) {
                this.queue.cancel(this.onFlush);
                this.isFlushEnqueued = false;
            }
        }
    }

    public unsubscribeFromKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ): void {
        for (const key of keys) this.unsubscribeFromKey(key, handler);
    }

    public markUpdatedKeys(keys: readonly TKey[]): void {
        if (keys.length === 0) return;
        if (this.keyHandlers.size === 0) return;

        let didAddAny = false;
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const handlers = this.keyHandlers.get(key);
            if (!handlers || handlers.size === 0) continue;
            this.updatedKeys.add(key);
            didAddAny = true;
        }

        if (!didAddAny) return;
        this.ensureFlushEnqueued();
    }

    public markUpdatedKey(key: TKey): void {
        if (this.keyHandlers.size === 0) return;
        const handlers = this.keyHandlers.get(key);
        if (!handlers || handlers.size === 0) return;

        this.updatedKeys.add(key);
        this.ensureFlushEnqueued();
    }

    public markAllUpdated(): void {
        if (this.keyHandlers.size === 0) return;
        this.keyHandlers.forEach((_handlers, key) => this.updatedKeys.add(key));
        this.ensureFlushEnqueued();
    }

    private ensureFlushEnqueued(): void {
        if (this.isFlushEnqueued) return;
        this.isFlushEnqueued = true;
        this.queue.enqueue(this.onFlush);
    }

    private readonly onFlush = () => {
        this.isFlushEnqueued = false;

        if (this.keyHandlers.size === 0 || this.updatedKeys.size === 0) {
            this.updatedKeys.clear();
            return;
        }

        const flushingKeys = this.updatedKeys;
        this.updatedKeys = new Set<TKey>();

        flushingKeys.forEach(key => {
            const handlers = this.keyHandlers.get(key);
            if (!handlers || handlers.size === 0) return;
            const snapshot = Array.from(handlers);
            for (let i = 0; i < snapshot.length; i++) {
                const handler = snapshot[i];
                if (handlers.has(handler)) handler();
            }
        });
    };

    public destroy(): void {
        if (this.isFlushEnqueued) {
            this.queue.cancel(this.onFlush);
            this.isFlushEnqueued = false;
        }
        this.keyHandlers.forEach(h => h.clear());
        this.keyHandlers.clear();
        this.updatedKeys.clear();
        this.isFlushEnqueued = false;
    }
}




