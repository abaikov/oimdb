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
    // Handlers registered through a `subscribeOnKeys` spanning 2+ keys,
    // refcounted. Their delivery is coalesced to at most ONCE per flush (the
    // callback carries no key, so firing per changed key is pure waste).
    //
    // Membership matters, not just the count: coalescing must apply ONLY to
    // these handlers. A handler holding several independent `subscribeOnKey`
    // subscriptions owes one delivery per key, and that must not change because
    // some unrelated multi-key subscription exists on this emitter.
    private multiKeyHandlers?: Map<TOIMEventHandler<void>, number>;
    // Reused across flushes (lazily created) and cleared per flush rather than
    // re-allocated — only touched while a multi-key handler is registered.
    private deliveredPool?: Set<TOIMEventHandler<void>>;

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
        // A handler over 2+ keys must be coalesced to one call per flush (the
        // callback carries no key). Counts input keys — a degenerate duplicate
        // key may over-count, harmlessly tripping the dedup for a single key.
        const spansMultipleKeys = keys.length > 1;
        if (spansMultipleKeys) this.retainMultiKeyHandler(handler);
        let unsubscribed = false;
        return () => {
            if (unsubscribed) return;
            unsubscribed = true;
            if (spansMultipleKeys) this.releaseMultiKeyHandler(handler);
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
        // The documented alternative to the closure `subscribeOnKeys` returns,
        // so it must release the coalescing refcount too — otherwise the gate
        // stays latched for the emitter's whole life. Once per call, not once
        // per key: it undoes ONE subscription.
        if (keys.length > 1) this.releaseMultiKeyHandler(handler);
        for (const key of keys) this.unsubscribeFromKey(key, handler);
    }

    /** Take a reference for a handler whose subscription spans several keys. */
    private retainMultiKeyHandler(handler: TOIMEventHandler<void>): void {
        const handlers = (this.multiKeyHandlers ??= new Map());
        handlers.set(handler, (handlers.get(handler) ?? 0) + 1);
    }

    /** Drop one reference; the handler leaves the set when none are left. */
    private releaseMultiKeyHandler(handler: TOIMEventHandler<void>): void {
        const handlers = this.multiKeyHandlers;
        if (handlers === undefined) return;
        const count = handlers.get(handler);
        if (count === undefined) return;
        if (count > 1) handlers.set(handler, count - 1);
        else handlers.delete(handler);
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

        // Dedup delivery across the flush only when some handler spans multiple
        // keys; otherwise every handler is unique to its key and the Set is pure
        // overhead. Pooled + cleared per flush, not re-allocated.
        const multiKeyHandlers = this.multiKeyHandlers;
        const delivered =
            multiKeyHandlers !== undefined && multiKeyHandlers.size > 0
                ? (this.deliveredPool ??= new Set<TOIMEventHandler<void>>())
                : undefined;
        try {
            flushingKeys.forEach(key => {
                const handlers = this.keyHandlers.get(key);
                if (!handlers || handlers.size === 0) return;
                this.notifyHandlers(handlers, delivered);
            });
        } finally {
            // Must clear even on a thrown handler, else stale entries would
            // suppress those handlers on the next flush.
            delivered?.clear();
        }
    };

    private notifyHandlers(
        handlers: Set<TOIMEventHandler<void>>,
        delivered?: Set<TOIMEventHandler<void>>
    ): void {
        // One subscriber per key is the common case — no snapshot allocation.
        if (handlers.size === 1) {
            const only = handlers.values().next().value;
            if (!only) return;
            if (this.isAlreadyDelivered(only, delivered)) return;
            only();
            return;
        }
        // Snapshot so a handler may (un)subscribe during iteration safely.
        const snapshot = Array.from(handlers);
        for (let i = 0; i < snapshot.length; i++) {
            const handler = snapshot[i];
            if (!handlers.has(handler)) continue;
            if (this.isAlreadyDelivered(handler, delivered)) continue;
            handler();
        }
    }

    /**
     * Whether this handler already fired in the current flush and must be
     * skipped. Only multi-key handlers are tracked; everything else always
     * delivers. Membership is recorded via the size delta of a single `add` —
     * one hash probe instead of `has` + `add`.
     */
    private isAlreadyDelivered(
        handler: TOIMEventHandler<void>,
        delivered: Set<TOIMEventHandler<void>> | undefined
    ): boolean {
        if (delivered === undefined) return false;
        if (this.multiKeyHandlers?.has(handler) !== true) return false;
        const size = delivered.size;
        delivered.add(handler);
        return delivered.size === size;
    }

    public destroy(): void {
        if (this.isFlushEnqueued) {
            this.queue.cancel(this.onFlush);
            this.isFlushEnqueued = false;
        }
        this.keyHandlers.forEach(h => h.clear());
        this.keyHandlers.clear();
        this.updatedKeys.clear();
        this.isFlushEnqueued = false;
        // Every subscription is gone, so no handler is multi-key any more.
        this.multiKeyHandlers?.clear();
        this.deliveredPool?.clear();
    }
}




