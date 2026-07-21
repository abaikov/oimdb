import { IOIMSubscription } from './IOIMSubscription';

/**
 * The keyless pub/sub surface a reactive Global node needs from its update
 * emitter: subscribe + a batched "mark updated" delivery. The counterpart of
 * {@link IOIMKeyedUpdateEmitter}, but for exactly one carrier — so there is no
 * key parameter, no provider, and no per-key map.
 */
export interface IOIMSingleUpdateEmitter extends IOIMSubscription {
    markUpdated(): void;
    hasSubscriptions(): boolean;
    destroy(): void;
}
