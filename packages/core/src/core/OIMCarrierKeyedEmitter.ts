import { TOIMKey } from '../types/TOIMKey';
import { OIMEventQueue } from './OIMEventQueue';
import { NO_FIELDS } from './OIMFieldMaskRegistry';
import { TOIMEventHandler } from '../types/TOIMEventHandler';
import { IOIMSubscribable } from '../types/IOIMSubscribable';
import { IOIMFrameParticipant } from '../interfaces/IOIMFrameParticipant';
import { IOIMKeyedUpdateEmitter } from '../interfaces/IOIMKeyedUpdateEmitter';

/**
 * Resolves a key to its carrier — the object that holds the key's subscribers.
 * `getOrReserveCarrier` is used on subscribe (creates the carrier if absent so a
 * subscription can exist before its data); `findCarrier` resolves an existing
 * carrier for delivery/unsubscribe without creating one.
 *
 * Collection carrier = the entity slot (by pk); index carrier = the bucket
 * (by index key).
 */
export interface IOIMCarrierProvider<TKey extends TOIMKey, TCarrier> {
    getOrReserveCarrier(key: TKey): TCarrier;
    findCarrier(key: TKey): TCarrier | undefined;
    /**
     * Optional: called when a carrier loses its last subscriber, so a carrierProvider
     * that owns standalone carriers (e.g. the index's key→carrier map) can prune
     * it and not leak the key space. Providers whose carriers are owned
     * elsewhere (e.g. the collection's slots) leave this unset.
     */
    onCarrierEmptied?(carrier: TCarrier): void;
}

/**
 * Keyed (per-key) pub/sub that stores handlers ON the carrier object
 * (`carrier.subscribers`) instead of a `Map<key, handlers>`. The hot path —
 * marking a written carrier dirty and delivering — needs no per-key map lookup
 * or hashing: the writer already holds the carrier.
 *
 * Same public surface as `OIMUpdateEventEmitter` (queue delivery) plus a fast
 * `markUpdatedCarrier(carrier)`, so it is a drop-in for the collection's and
 * index's keyed emitter. Reused with carrier = slot (collection) or carrier =
 * bucket (index).
 */
export class OIMCarrierKeyedEmitter<
    TKey extends TOIMKey,
    TCarrier extends IOIMSubscribable,
> implements IOIMKeyedUpdateEmitter<TKey>, IOIMFrameParticipant {
    private readonly queue: OIMEventQueue;
    // `protected`, not private: a subclass that records per-write state has to reach
    // the carrier before marking it. Two wrapper methods would say the same thing
    // with more code.
    protected readonly carrierProvider: IOIMCarrierProvider<TKey, TCarrier>;
    // Carriers with at least one subscriber — for markAllUpdated / metrics.
    private readonly subscribedCarriers = new Set<TCarrier>();
    // Pending flush batch. A plain array + a `carrier.dirty` flag for dedup —
    // marking is the hottest write-path op, and pushing to an array with a
    // boolean check is ~4x cheaper than a `Set` identity-hash add. The flag
    // doubles as membership: a carrier is in this array iff `carrier.dirty`.
    private dirtyCarriers: TCarrier[] = [];
    private isFlushEnqueued = false;
    // Carriers whose change record outlives delivery: cleared at FRAME_END, once
    // the effects that may want to read it have run.
    private pendingClear: TCarrier[] = [];
    private isFrameEndClearScheduled = false;
    // Handlers registered through a `subscribeOnKeys` that spans 2+ carriers,
    // refcounted (the same handler may hold several such subscriptions). Their
    // delivery is coalesced to at most ONCE per flush — the callback carries no
    // key, so firing per changed carrier is pure waste.
    //
    // Membership matters, not just the count: coalescing must apply ONLY to
    // these handlers. A handler that took two independent `subscribeOnKey`
    // subscriptions owes two deliveries, and that must not change just because
    // some unrelated multi-key subscription happens to exist on this emitter.
    //
    // Lazily created: an emitter that never sees a multi-carrier subscription
    // allocates nothing and pays nothing on the hot path.
    private multiCarrierHandlers?: Map<TOIMEventHandler<void>, number>;
    // Reused across flushes (created lazily the first time a multi-carrier
    // subscription actually delivers) and `.clear()`ed after each flush rather
    // than re-allocated — same discipline as `dirtyCarriers`. Emitters that
    // never hold a multi-carrier subscription never allocate it at all.
    private deliveredPool?: Set<TOIMEventHandler<void>>;

    constructor(
        queue: OIMEventQueue,
        carrierProvider: IOIMCarrierProvider<TKey, TCarrier>
    ) {
        this.queue = queue;
        this.carrierProvider = carrierProvider;
    }

    public subscribeOnKey(key: TKey, handler: TOIMEventHandler<void>): () => void {
        const carrier = this.carrierProvider.getOrReserveCarrier(key);
        this.addHandler(carrier, handler);
        return () => this.removeHandler(carrier, handler);
    }

    public subscribeOnKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ): () => void {
        // Register the SAME handler on each key's carrier. Handler identity is
        // preserved (no wrapper), so `unsubscribeFromKeys(keys, handler)` still
        // works. Same allocation profile as before — one array + one closure.
        const carriers: TCarrier[] = [];
        for (let i = 0; i < keys.length; i++) {
            const carrier = this.carrierProvider.getOrReserveCarrier(keys[i]);
            this.addHandler(carrier, handler);
            carriers.push(carrier);
        }
        // `> 1` gates the per-flush delivery dedup: a handler that spans several
        // carriers must fire at most once per flush. `carriers` counts the input
        // keys, so duplicate keys (a degenerate call) may over-count and trip the
        // gate for a single real carrier — harmless (the dedup just runs and the
        // lone handler still fires once).
        const spansMultipleCarriers = carriers.length > 1;
        if (spansMultipleCarriers) this.retainMultiCarrierHandler(handler);
        let unsubscribed = false;
        return () => {
            if (unsubscribed) return;
            unsubscribed = true;
            if (spansMultipleCarriers) {
                this.releaseMultiCarrierHandler(handler);
            }
            for (let i = 0; i < carriers.length; i++) {
                this.removeHandler(carriers[i], handler);
            }
        };
    }

    public unsubscribeFromKey(key: TKey, handler: TOIMEventHandler<void>): void {
        const carrier = this.carrierProvider.findCarrier(key);
        if (carrier) this.removeHandler(carrier, handler);
    }

    public unsubscribeFromKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ): void {
        // The documented alternative to the closure `subscribeOnKeys` returns,
        // so it has to release the coalescing refcount too — otherwise the gate
        // stays latched for the emitter's whole life and every later flush pays
        // for a dedup nothing needs. Once per call, not once per key: it undoes
        // ONE subscription.
        if (keys.length > 1) this.releaseMultiCarrierHandler(handler);
        for (let i = 0; i < keys.length; i++) {
            this.unsubscribeFromKey(keys[i], handler);
        }
    }

    /** Take a reference for a handler whose subscription spans several carriers. */
    private retainMultiCarrierHandler(handler: TOIMEventHandler<void>): void {
        const handlers = (this.multiCarrierHandlers ??= new Map());
        handlers.set(handler, (handlers.get(handler) ?? 0) + 1);
    }

    /** Drop one reference; the handler leaves the set when none are left. */
    private releaseMultiCarrierHandler(handler: TOIMEventHandler<void>): void {
        const handlers = this.multiCarrierHandlers;
        if (handlers === undefined) return;
        const count = handlers.get(handler);
        if (count === undefined) return;
        if (count > 1) handlers.set(handler, count - 1);
        else handlers.delete(handler);
    }

    private addHandler(
        carrier: TCarrier,
        handler: TOIMEventHandler<void>
    ): void {
        let subscribers = carrier.subscribers;
        if (!subscribers) {
            subscribers = new Set();
            carrier.subscribers = subscribers;
        }
        subscribers.add(handler);
        this.subscribedCarriers.add(carrier);
    }

    private removeHandler(
        carrier: TCarrier,
        handler: TOIMEventHandler<void>
    ): void {
        const subscribers = carrier.subscribers;
        if (!subscribers) return;
        subscribers.delete(handler);
        if (subscribers.size === 0) {
            this.subscribedCarriers.delete(carrier);
            // Let a carrierProvider that owns standalone carriers prune this one
            // (index key→carrier map). Carriers owned elsewhere (collection
            // slots) have no hook and are reclaimed on remove/clear instead.
            this.carrierProvider.onCarrierEmptied?.(carrier);
        }
    }

    /**
     * Fast path: the writer already holds the carrier.
     *
     * `patch` is what the write actually set. This emitter has no use for it —
     * a subscriber of a key wants every write to that key — but the parameter is
     * here so the WRITER never has to know which emitter it is talking to. A
     * field-tracking emitter reads it; passing it costs a register.
     *
     * Its absence means "everything changed" (a removal, or a writer that does
     * not track fields), which is the conservative reading: never fewer wakeups
     * than correctness requires.
     */
    public markUpdatedCarrier(carrier: TCarrier, _patch?: object): void {
        this.assertNotInFlush();
        const subscribers = carrier.subscribers;
        if (!subscribers || subscribers.size === 0) return;
        if (carrier.dirty) return; // already in the pending batch
        carrier.dirty = true;
        this.dirtyCarriers.push(carrier);
        this.scheduleFlush();
    }

    public markUpdatedKey(key: TKey, _patch?: object): void {
        // Nothing is subscribed anywhere → no carrier can have handlers, so skip
        // the carrierProvider lookup entirely. For a composite (trie) carrierProvider this
        // avoids an O(arity) walk on every write to an unsubscribed key.
        if (this.subscribedCarriers.size === 0) {
            this.assertNotInFlush();
            return;
        }
        const carrier = this.carrierProvider.findCarrier(key);
        if (carrier) this.markUpdatedCarrier(carrier);
        else this.assertNotInFlush();
    }

    public markUpdatedKeys(keys: readonly TKey[]): void {
        if (this.subscribedCarriers.size === 0) {
            this.assertNotInFlush();
            return;
        }
        for (let i = 0; i < keys.length; i++) this.markUpdatedKey(keys[i]);
    }

    public markAllUpdated(): void {
        this.assertNotInFlush();
        if (this.subscribedCarriers.size === 0) return;
        this.subscribedCarriers.forEach(carrier => {
            if (carrier.dirty) return;
            carrier.dirty = true;
            this.dirtyCarriers.push(carrier);
        });
        this.scheduleFlush();
    }

    public hasSubscriptions(): boolean {
        return this.subscribedCarriers.size > 0;
    }

    public getHandlerCount(key: TKey): number {
        return this.carrierProvider.findCarrier(key)?.subscribers?.size ?? 0;
    }

    public getMetrics(): {
        totalKeys: number;
        totalHandlers: number;
        averageHandlersPerKey: number;
        queueLength: number;
    } {
        let totalHandlers = 0;
        this.subscribedCarriers.forEach(carrier => {
            totalHandlers += carrier.subscribers?.size ?? 0;
        });
        const totalKeys = this.subscribedCarriers.size;
        return {
            totalKeys,
            totalHandlers,
            averageHandlersPerKey: totalKeys > 0 ? totalHandlers / totalKeys : 0,
            queueLength: this.dirtyCarriers.length,
        };
    }

    public destroy(): void {
        if (this.isFlushEnqueued) {
            this.queue.cancel(this.onFlush);
            this.isFlushEnqueued = false;
        }
        this.subscribedCarriers.forEach(carrier => {
            carrier.subscribers?.clear();
            carrier.subscribers = undefined;
        });
        this.subscribedCarriers.clear();
        for (let i = 0; i < this.dirtyCarriers.length; i++) {
            this.dirtyCarriers[i].dirty = false;
        }
        this.dirtyCarriers = [];
        this.isFlushEnqueued = false;
        // Every subscription is gone, so no handler is multi-carrier any more.
        // Leaving these behind would latch the coalescing gate for a reused
        // emitter and keep the pooled Set alive for nothing.
        this.multiCarrierHandlers?.clear();
        this.deliveredPool?.clear();
    }

    private assertNotInFlush(): void {
        if (this.queue.isInFlush) {
            throw new Error(
                'OIMCarrierKeyedEmitter: updates during queue.flush() are not allowed. ' +
                    'Finish all writes before calling queue.flush().'
            );
        }
    }

    /**
     * Take part in the end of the frame, so the delivered carriers are settled
     * before anything is told the frame is over.
     *
     * Registered lazily and only while something is actually pending, so an
     * emitter that never delivers costs the queue nothing.
     */
    private scheduleFrameEndClear(): void {
        if (this.isFrameEndClearScheduled) return;
        this.isFrameEndClearScheduled = true;
        this.queue.registerFrameParticipant(this);
    }

    /**
     * Put away the change records this frame accumulated.
     *
     * `dirtyFields` is cleared alongside `dirty` rather than left to be
     * overwritten by the next frame's first write. Leaving it would mean a read
     * taken outside a frame returns the PREVIOUS frame's mask — a stale value
     * that is indistinguishable from a live one. Zero says what is true: nothing
     * changed in the frame you are asking about.
     *
     * The property is only written when it already exists, so slots in a
     * collection that does not track fields never grow it.
     */
    public endFrame(): void {
        const clearing = this.pendingClear;
        for (let i = 0; i < clearing.length; i++) {
            const carrier = clearing[i];
            carrier.dirty = false;
            if (carrier.dirtyFields !== undefined) {
                carrier.dirtyFields = NO_FIELDS;
            }
        }
        clearing.length = 0;
        this.isFrameEndClearScheduled = false;
        this.queue.unregisterFrameParticipant(this);
    }

    private scheduleFlush(): void {
        if (this.isFlushEnqueued) return;
        this.isFlushEnqueued = true;
        this.queue.enqueue(this.onFlush);
    }

    private readonly onFlush = (): void => {
        this.isFlushEnqueued = false;
        if (this.dirtyCarriers.length === 0) return;

        // Swap in a fresh batch so any (illegal) re-mark wouldn't touch this one.
        const flushing = this.dirtyCarriers;
        this.dirtyCarriers = [];
        // Only when some handler spans multiple carriers do we need to dedup
        // delivery across this flush; otherwise every handler is unique to its
        // carrier and the Set would be pure overhead on the hot path.
        const multiCarrierHandlers = this.multiCarrierHandlers;
        const delivered =
            multiCarrierHandlers !== undefined && multiCarrierHandlers.size > 0
                ? (this.deliveredPool ??= new Set<TOIMEventHandler<void>>())
                : undefined;
        let i = 0;
        try {
            for (; i < flushing.length; i++) {
                this.notify(flushing[i], delivered);
            }
        } finally {
            // `dirty` used to be cleared right before notifying, so a handler
            // that wrote could re-mark the carrier. Writes are now refused for
            // the whole frame — effects included — so the flag can instead stay
            // up until the frame really ends, which is what lets an effect look
            // at its dependency and see WHAT changed rather than only that
            // something did. Carriers we never reached (a handler threw) are
            // cleared here so they are not stuck.
            for (let j = 0; j < flushing.length; j++) {
                this.pendingClear.push(flushing[j]);
            }
            this.scheduleFrameEndClear();
            // Empty the pool for the next flush while keeping its capacity.
            delivered?.clear();
        }
    };

    private notify(
        carrier: TCarrier,
        delivered?: Set<TOIMEventHandler<void>>
    ): void {
        const subscribers = carrier.subscribers;
        if (!subscribers || subscribers.size === 0) return;
        // Coalescing is scoped to handlers that actually hold a multi-carrier
        // subscription. A handler with several independent single-key
        // subscriptions owes one delivery per carrier, and must keep getting
        // them no matter what else is subscribed to this emitter.
        const multiCarrierHandlers = delivered
            ? this.multiCarrierHandlers
            : undefined;
        // One subscriber per key is the common case — no snapshot allocation.
        if (subscribers.size === 1) {
            const only = subscribers.values().next().value;
            if (!only) return;
            if (this.isAlreadyDelivered(only, delivered, multiCarrierHandlers)) {
                return;
            }
            only();
            return;
        }
        // Snapshot so a handler may (un)subscribe during iteration safely.
        const snapshot: TOIMEventHandler<void>[] = [];
        subscribers.forEach(h => snapshot.push(h));
        for (let i = 0; i < snapshot.length; i++) {
            const handler = snapshot[i];
            if (!subscribers.has(handler)) continue;
            if (
                this.isAlreadyDelivered(handler, delivered, multiCarrierHandlers)
            ) {
                continue;
            }
            handler();
        }
    }

    /**
     * Whether this handler already fired in the current flush and must be
     * skipped. Only multi-carrier handlers are tracked; everything else always
     * delivers. Membership is recorded via the size delta of a single `add` —
     * one hash probe instead of `has` + `add`.
     */
    private isAlreadyDelivered(
        handler: TOIMEventHandler<void>,
        delivered: Set<TOIMEventHandler<void>> | undefined,
        multiCarrierHandlers:
            | Map<TOIMEventHandler<void>, number>
            | undefined
    ): boolean {
        if (delivered === undefined) return false;
        if (multiCarrierHandlers?.has(handler) !== true) return false;
        const size = delivered.size;
        delivered.add(handler);
        return delivered.size === size;
    }
}
