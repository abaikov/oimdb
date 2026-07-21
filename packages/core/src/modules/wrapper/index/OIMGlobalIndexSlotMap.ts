import { TOIMKey } from '../../../types/TOIMKey';
import { TOIMPk } from '../../../types/TOIMPk';
import { TOIMAnyEntitySlot } from '../../../types/TOIMEntitySlot';
import { TOIMEventHandler } from '../../../types/TOIMEventHandler';
import { IOIMGlobalIndexSlotSource } from '../../../interfaces/IOIMGlobalIndexSlotSource';

/**
 * Stable slot→object memo over a keyless (whole-collection) set/array index —
 * the keyless counterpart of {@link OIMIndexSlotMap}.
 *
 * `create(slot)` runs once per canonical slot; every later read returns the
 * **same** object reference for the same slot, so a consumer can re-read on each
 * notification and still hand reference-equal objects to `React.memo` /
 * `Object.is` diffing, or reuse the same view-model.
 *
 * The cache is a `WeakMap` keyed by the slot object, so a mapped object is
 * reclaimed by GC once its slot is dropped. There is no teardown callback and
 * none is needed for plain values; if your mapped objects hold resources needing
 * explicit cleanup, drive an ordered command stream (whose `remove` / `set` /
 * `reset` commands are the exact removal signal) instead.
 *
 * Thin wrapper: no queue, no standing subscription of its own — `subscribe` is a
 * passthrough to the index.
 */
export class OIMGlobalIndexSlotMap<TPk extends TOIMKey, TMapped> {
    private readonly index: IOIMGlobalIndexSlotSource<TPk>;
    private readonly create: (slot: TOIMAnyEntitySlot<TPk>) => TMapped;
    private readonly cache = new WeakMap<
        TOIMAnyEntitySlot<TPk>,
        TMapped
    >();

    constructor(
        index: IOIMGlobalIndexSlotSource<TPk>,
        create: (slot: TOIMAnyEntitySlot<TPk>) => TMapped
    ) {
        this.index = index;
        this.create = create;
    }

    /** The mapped object for a slot, created once and cached by slot identity. */
    public get(slot: TOIMAnyEntitySlot<TPk>): TMapped {
        let mapped = this.cache.get(slot);
        if (mapped === undefined && !this.cache.has(slot)) {
            mapped = this.create(slot);
            this.cache.set(slot, mapped);
        }
        return mapped as TMapped;
    }

    /**
     * Mapped objects for every slot in the index, with stable references. For a
     * set-based global index the order is unspecified (as the set is); for an
     * array-based one it follows the index order.
     */
    public getAll(): TMapped[] {
        const result: TMapped[] = [];
        for (const slot of this.index.getSlots()) {
            result.push(this.get(slot));
        }
        return result;
    }

    /**
     * Chain another projection. `map(f)` returns a slot map over the SAME index
     * whose objects are `f(this.get(slot))`, cached by slot identity — both
     * levels hand back stable references and each `create` runs once per slot.
     */
    public map<TNext>(
        create: (mapped: TMapped) => TNext
    ): OIMGlobalIndexSlotMap<TPk, TNext> {
        return new OIMGlobalIndexSlotMap<TPk, TNext>(this.index, slot =>
            create(this.get(slot))
        );
    }

    /** Subscribe to the index's changes — passthrough to the index. */
    public subscribe(handler: TOIMEventHandler<void>): () => void {
        return this.index.subscribe(handler);
    }
}
