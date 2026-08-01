import { TOIMKey } from '../../../types/TOIMKey';
import { TOIMAnyEntitySlot } from '../../../types/TOIMEntitySlot';
import { IOIMIndexSlotSource } from '../../../interfaces/IOIMIndexSlotSource';
import { IOIMKeyedSubscription } from '../../../interfaces/IOIMKeyedSubscription';

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
 * own. Subscribe through `slotMap.emitter`, which IS the index's emitter —
 * the wrapper adds mapping, not a second subscription surface.
 *
 * ## Do NOT map a slot to its entity
 *
 * ```ts
 * createOIMIndexSlotMap(index, slot => slot.item);   // WRONG — silently stale
 * ```
 *
 * The cache is keyed by SLOT IDENTITY, and a slot deliberately OUTLIVES the
 * entity in it: an upsert assigns `slot.item = entity` and keeps the same slot
 * object, because that object is the canonical anchor for the pk. So `create`
 * would run once, pin whichever entity happened to be there first, and keep
 * returning it after every later write — no error, just a stale read.
 *
 * Entities already have their mapper, and it is cheaper than any cache:
 * `index.getEntitiesByKey(key)` reads `slot.item` directly (a field load, and
 * its reference already changes exactly when the entity changes, which is what
 * `Object.is` / `React.memo` want). For a value DERIVED from an entity, the
 * cache key must be the entity, not the slot — that is what `OIMComputed` and
 * the selectors are for, and they invalidate on write.
 *
 * Map here only what is bound to the slot's IDENTITY and must SURVIVE entity
 * updates: a view-model, a row object, a DOM node.
 */
export class OIMIndexSlotMap<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TMapped,
> {
    private readonly index: IOIMIndexSlotSource<TKey, TPk>;
    /** The index's own emitter — not a copy, not a wrapper. */
    public readonly emitter: IOIMKeyedSubscription<TKey>;
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
        this.emitter = index.emitter;
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

}
