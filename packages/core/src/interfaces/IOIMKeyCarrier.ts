import { TOIMKey } from '../types/TOIMKey';
import { IOIMSubscribable } from '../types/IOIMSubscribable';

/**
 * Carrier for a single index key: holds that key's subscribers + dirty flag
 * (via `IOIMSubscribable`) so the keyed emitter delivers straight off the
 * carrier with no per-key map lookup. Carries its own `key` so the provider can
 * prune it from the key→carrier map when its last subscriber leaves.
 */
export interface IOIMKeyCarrier<TKey extends TOIMKey> extends IOIMSubscribable {
    key: TKey;
}
