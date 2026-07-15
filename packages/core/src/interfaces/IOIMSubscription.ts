import { TOIMEventHandler } from '../types/TOIMEventHandler';

/**
 * Keyless subscription surface — the counterpart of {@link IOIMKeyedSubscription}
 * for a single (whole-collection) reactive node. A subscriber is notified on
 * `queue.flush()` whenever the node's one bucket changes; there is no key.
 */
export interface IOIMSubscription {
    subscribe(handler: TOIMEventHandler<void>): () => void;
}
