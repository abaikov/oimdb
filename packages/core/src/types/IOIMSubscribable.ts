/**
 * A carrier that can hold per-key subscribers directly on itself, so the keyed
 * emitter delivers without a per-key map lookup. Implemented by the entity slot
 * (collection carrier) and the index bucket (index carrier).
 */
export interface IOIMSubscribable {
    subscribers?: Set<() => void>;
    /**
     * Dirty-batch membership flag, owned by the keyed emitter. `true` while the
     * carrier sits in the pending flush batch — lets the emitter dedup marks with
     * an O(1) boolean check instead of a `Set` identity-hash lookup. Reset to
     * `false` as the carrier is delivered (or on flush teardown). Do not read or
     * write outside the emitter.
     */
    dirty?: boolean;
}
