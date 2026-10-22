import type { TOIMKey } from '../types/TOIMKey';
import type { TOIMEventHandler } from '../types/TOIMEventHandler';
import type { IOIMSubscribable } from '../types/IOIMSubscribable';
import { OIMCarrierKeyedEmitter } from './OIMCarrierKeyedEmitter';
import { ALL_FIELDS } from './OIMFieldMaskRegistry';

/**
 * Keyed pub/sub where a subscriber can name the fields it cares about and sleep
 * through every write that touched none of them.
 *
 * The plain {@link OIMCarrierKeyedEmitter} wakes every subscriber of a key on any
 * write to that key: a row rendering `user.name` re-renders when `user.active`
 * flips. Correct, and wasted. This subclass adds one method, which filters on the
 * change record the carrier is already holding.
 *
 * ## It records nothing
 *
 * Field masks are written by exactly one component — `OIMSlotWriterFieldMasked`,
 * the collection's slot writer — and this emitter only reads them. That is not a
 * division of labour, it is the only arrangement that works: a mask means
 * something only if the bit for `name` is the same bit everywhere, so there can
 * be exactly one field registry, owned by whoever assigns the bits. An emitter
 * with a registry of its own would number the same field differently depending
 * on the order writes happened to arrive, and the two numberings would silently
 * disagree — waking a subscriber for the wrong field, or never waking it at all.
 *
 * Build masks with the collection's registry (`collection.fields`), which is the
 * writer's. On a collection whose writer does not track fields there is no
 * registry and no mask: `dirtyFields` stays absent, this emitter reads that as
 * {@link ALL_FIELDS}, and every subscriber wakes exactly as it would on the plain
 * emitter — over-delivery, never silence.
 *
 * ## Why filtering needs nothing from the base emitter
 *
 * `subscribeOnKeyFields` wraps the handler in a closure that checks the carrier's
 * mask and returns early. The base emitter calls it like any other handler and
 * knows nothing about fields, so the plain delivery path keeps its exact cost and
 * the base class holds no overridable stubs for a subclass's benefit.
 *
 * ## Mask semantics
 *
 * - A subscriber registered WITHOUT a field list watches everything, exactly as
 *   on the plain emitter — this class is a superset, never a narrowing.
 * - An insert reports {@link ALL_FIELDS}: a new entity changes every field from
 *   "absent" to a value, and a subscriber watching `teamId` must see it appear.
 */
export class OIMCarrierKeyedFieldEmitter<
    TKey extends TOIMKey,
    TCarrier extends IOIMSubscribable,
> extends OIMCarrierKeyedEmitter<TKey, TCarrier> {
    /**
     * Subscribe to a key, but only wake for writes touching one of `mask`'s
     * fields. Build `mask` with the collection's field registry so its bits line
     * up with what the writer records.
     */
    public subscribeOnKeyFields(
        key: TKey,
        mask: number,
        handler: TOIMEventHandler<void>
    ): () => void {
        const carrier = this.carrierProvider.getOrReserveCarrier(key);
        // The filter lives in the handler, not in the emitter: by the time this
        // runs the carrier still holds the mask for the frame being delivered.
        const filtered = () => {
            const written = carrier.dirtyFields ?? ALL_FIELDS;
            if ((written & mask) === 0) return;
            handler();
        };
        return this.subscribeOnKey(key, filtered);
    }
}
