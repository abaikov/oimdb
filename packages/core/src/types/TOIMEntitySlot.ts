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
};

export type TOIMAnyEntitySlot<TPk extends TOIMKey> = TOIMEntitySlot<
    object,
    TPk
>;

export type TOIMEntitySlotResolver<TPk extends TOIMKey> = (
    pk: TPk
) => TOIMAnyEntitySlot<TPk> | undefined;
