import { TOIMKey } from '../types/TOIMKey';
import { TOIMEventHandler } from '../types/TOIMEventHandler';
import { IOIMSubscribable } from '../types/IOIMSubscribable';

/**
 * The keyed pub/sub surface a reactive node needs from its update emitter:
 * per-key subscribe/unsubscribe plus batched "mark updated" delivery.
 *
 * Both keyed emitters implement it — `OIMUpdateEventEmitter` (Map of handlers)
 * and `OIMCarrierKeyedEmitter` (handlers on a per-key carrier). Typing the node
 * against this interface lets either back the node without leaking the carrier
 * generic into the node's signatures.
 */
export interface IOIMKeyedUpdateEmitter<TKey extends TOIMKey> {
    subscribeOnKey(key: TKey, handler: TOIMEventHandler<void>): () => void;
    subscribeOnKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ): () => void;
    unsubscribeFromKey(key: TKey, handler: TOIMEventHandler<void>): void;
    unsubscribeFromKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ): void;
    markUpdatedKey(key: TKey): void;
    markUpdatedKeys(keys: readonly TKey[]): void;
    /**
     * Fast path: mark a carrier the writer already holds (an entity slot or an
     * index bucket), skipping the key→carrier lookup entirely. O(1).
     */
    markUpdatedCarrier(carrier: IOIMSubscribable): void;
    hasSubscriptions(): boolean;
    getHandlerCount(key: TKey): number;
    getMetrics(): {
        totalKeys: number;
        totalHandlers: number;
        averageHandlersPerKey: number;
        queueLength: number;
    };
    destroy(): void;
}
