import { TOIMKey } from './TOIMKey';

export type TOIMEntitySlot<
    TEntity extends object,
    TPk extends TOIMKey,
> = {
    pk: TPk;
    item: TEntity | undefined;
    /**
     * Per-pk subscribers, attached lazily by the slot-based keyed emitter so
     * notification needs no per-key map lookup. The slot is retained while this
     * is non-empty (even with `item: undefined`) so a subscription survives a
     * remove → re-add of its entity. Undefined when nothing is subscribed.
     */
    subscribers?: Set<() => void>;
    /**
     * Dirty-batch membership, owned by the keyed emitter. Declared here because
     * the slot IS the collection's carrier — the emitter has always written it
     * through its `IOIMSubscribable` constraint, and the collection now reads it
     * to decide whether a field mask starts fresh or accumulates.
     */
    dirty?: boolean;
    /**
     * Bitmask of fields written since this slot entered the pending batch, set
     * only on collections built with a field registry. Meaningless while `dirty`
     * is false: the first write of a flush overwrites it rather than OR-ing, so
     * nothing leaks between flushes.
     */
    dirtyFields?: number;
    /**
     * The entity as it stood when this slot first went dirty in the current
     * flush, kept so a field that changed and changed back can be recognised and
     * dropped before delivery. A reference, never a copy — which is exactly why
     * a field-tracking writer refuses an in-place updater.
     */
    flushBase?: object;
    /**
     * Whether the last write to this slot changed anything worth telling anyone
     * about. Written by the slot writer, read once by the reactive collection
     * immediately afterwards; `false` only ever comes from a writer that
     * compares values.
     */
    published?: boolean;
    /**
     * Which flush `flushBase` belongs to. Comparing it against the writer's
     * counter is how a slot knows its base is stale without anyone having to
     * walk every slot touched last frame and reset it.
     */
    flushGeneration?: number;
};

export type TOIMAnyEntitySlot<TPk extends TOIMKey> = TOIMEntitySlot<
    object,
    TPk
>;

export type TOIMEntitySlotGetter<TPk extends TOIMKey> = (
    pk: TPk
) => TOIMAnyEntitySlot<TPk> | undefined;
