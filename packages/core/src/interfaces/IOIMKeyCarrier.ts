import { IOIMSubscribable } from '../types/IOIMSubscribable';
import { TOIMPk } from '../types/TOIMPk';

/**
 * Carrier for a single index key: holds that key's subscribers + dirty flag
 * (via `IOIMSubscribable`) so the keyed emitter delivers straight off the
 * carrier with no per-key map lookup. Carries its own `key` so the resolver can
 * prune it from the key→carrier map when its last subscriber leaves.
 */
export interface IOIMKeyCarrier<TKey extends TOIMPk> extends IOIMSubscribable {
    key: TKey;
}
