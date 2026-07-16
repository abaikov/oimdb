import { TOIMPk } from '../../../types/TOIMPk';
import { TOIMAnyEntitySlot } from '../../../types/TOIMEntitySlot';
import { TOIMEventHandler } from '../../../types/TOIMEventHandler';
import { IOIMIndexSlotSource } from '../../../interfaces/IOIMIndexSlotSource';

/**
 * Stable slot→object memo over a keyed set/array index.
 *
 * `create(slot)` runs once per canonical slot; every later read for the same
 * slot returns the **same** object reference. That lets a consumer re-read a
 * key's members on each notification and still hand reference-equal objects to
 * `React.memo` / `Object.is` diffing, or reuse the same view-model instance.
 *
 * Identity is the slot object (which a collection-bound index keeps canonical
 * and shared per pk). The cache is a `WeakMap`, so a mapped object is reclaimed
 * by GC once its slot is dropped and unreferenced — there is no lifecycle
 * callback and none is needed for plain values. If your mapped objects hold
 * resources that need explicit teardown (DOM nodes, subscriptions), drive an
 * ordered command stream instead — its `remove` / `set` / `reset` commands are
 * the exact removal signal you tear down on.
 *
 * This is a thin wrapper: it holds no queue and no standing subscription of its
 * own — `subscribeOnKey` is a passthrough to the index.
 */
export class OIMIndexSlotMap<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
    TMapped,
> {
    private readonly index: IOIMIndexSlotSource<TKey, TPk>;
    private readonly create: (slot: TOIMAnyEntitySlot<TPk>) => TMapped;
    private readonly cache = new WeakMap<
        TOIMAnyEntitySlot<TPk>,
        TMapped
    >();

    constructor(
        index: IOIMIndexSlotSource<TKey, TPk>,
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
     * Mapped objects for every slot under `key`, with stable references. For a
     * set-based index the order is unspecified (as the set is); for an
     * array-based index it follows the index order.
     */
    public getByKey(key: TKey): TMapped[] {
        const result: TMapped[] = [];
        for (const slot of this.index.getSlotsByKey(key)) {
            result.push(this.get(slot));
        }
        return result;
    }

    /**
     * Chain another projection. `map(f)` returns a slot map over the SAME index
     * whose objects are `f(this.get(slot))`, cached by slot identity — so both
     * levels hand back stable references and each `create` runs once per slot.
     * Mirrors the command stream's `.map()`.
     */
    public map<TNext>(
        create: (mapped: TMapped) => TNext
    ): OIMIndexSlotMap<TKey, TPk, TNext> {
        return new OIMIndexSlotMap<TKey, TPk, TNext>(this.index, slot =>
            create(this.get(slot))
        );
    }

    /** Subscribe to a key's changes — passthrough to the index. */
    public subscribeOnKey(
        key: TKey,
        handler: TOIMEventHandler<void>
    ): () => void {
        return this.index.subscribeOnKey(key, handler);
    }

    /** Subscribe to several keys — passthrough to the index. */
    public subscribeOnKeys(
        keys: readonly TKey[],
        handler: TOIMEventHandler<void>
    ): () => void {
        return this.index.subscribeOnKeys(keys, handler);
    }
}
