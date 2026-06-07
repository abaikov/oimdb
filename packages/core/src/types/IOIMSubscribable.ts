/**
 * A carrier that can hold per-key subscribers directly on itself, so the keyed
 * emitter delivers without a per-key map lookup. Implemented by the entity slot
 * (collection carrier) and the index bucket (index carrier).
 */
export interface IOIMSubscribable {
    subscribers?: Set<() => void>;
}
