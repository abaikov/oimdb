import { TOIMKey } from '../types/TOIMKey';
import { OIMEventQueue } from './OIMEventQueue';
import { TOIMEventHandler } from '../types/TOIMEventHandler';
import { IOIMSubscribable } from '../types/IOIMSubscribable';
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
> implements IOIMKeyedUpdateEmitter<TKey> {
    private readonly queue: OIMEventQueue;
    private readonly carrierProvider: IOIMCarrierProvider<TKey, TCarrier>;
    // Carriers with at least one subscriber — for markAllUpdated / metrics.
    private readonly subscribedCarriers = new Set<TCarrier>();
    // Pending flush batch. A plain array + a `carrier.dirty` flag for dedup —
    // marking is the hottest write-path op, and pushing to an array with a
    // boolean check is ~4x cheaper than a `Set` identity-hash add. The flag
    // doubles as membership: a carrier is in this array iff `carrier.dirty`.
    private dirtyCarriers: TCarrier[] = [];
    private isFlushEnqueued = false;
    // Number of live subscriptions whose single handler spans 2+ distinct
    // carriers (a `subscribeOnKeys` over distinct keys). While this is > 0 a
    // flush coalesces delivery so such a handler fires at most ONCE per flush,
    // not once per changed carrier — the callback carries no key, so extra
    // fires are pure waste. At 0 the hot single-subscriber path pays nothing:
    // no per-flush Set, no membership checks.
    private multiCarrierSubscriptions = 0;
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
        if (spansMultipleCarriers) this.multiCarrierSubscriptions++;
        let unsubscribed = false;
        return () => {
            if (unsubscribed) return;
            unsubscribed = true;
            if (spansMultipleCarriers) this.multiCarrierSubscriptions--;
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
        for (let i = 0; i < keys.length; i++) {
            this.unsubscribeFromKey(keys[i], handler);
        }
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

    /** Fast path: the writer already holds the carrier. */
    public markUpdatedCarrier(carrier: TCarrier): void {
        this.assertNotInFlush();
        const subscribers = carrier.subscribers;
        if (!subscribers || subscribers.size === 0) return;
        if (carrier.dirty) return; // already in the pending batch
        carrier.dirty = true;
        this.dirtyCarriers.push(carrier);
        this.scheduleFlush();
    }

    public markUpdatedKey(key: TKey): void {
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
    }

    private assertNotInFlush(): void {
        if (this.queue.isInFlush) {
            throw new Error(
                'OIMCarrierKeyedEmitter: updates during queue.flush() are not allowed. ' +
                    'Finish all writes before calling queue.flush().'
            );
        }
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
        const delivered =
            this.multiCarrierSubscriptions > 0
                ? (this.deliveredPool ??= new Set<TOIMEventHandler<void>>())
                : undefined;
        let i = 0;
        try {
            for (; i < flushing.length; i++) {
                // Clear before notifying: even if a handler throws, the carrier
                // is left re-markable rather than stuck dirty.
                flushing[i].dirty = false;
                this.notify(flushing[i], delivered);
            }
        } finally {
            // On a thrown handler, clear flags of the carriers we never reached
            // so they can be re-marked (they drop from this batch, as the old
            // Set-based flush also dropped its remaining carriers).
            for (; i < flushing.length; i++) flushing[i].dirty = false;
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
        // One subscriber per key is the common case — no snapshot allocation.
        if (subscribers.size === 1) {
            const only = subscribers.values().next().value;
            if (!only) return;
            // `delivered` present ⇒ a multi-carrier handler exists this flush;
            // fire each handler at most once across the whole flush. Detect
            // "already fired" via the size delta of a single `add` — one hash
            // probe instead of `has` + `add`.
            if (delivered) {
                const size = delivered.size;
                delivered.add(only);
                if (delivered.size === size) return;
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
            if (delivered) {
                const size = delivered.size;
                delivered.add(handler);
                if (delivered.size === size) continue;
            }
            handler();
        }
    }
}
