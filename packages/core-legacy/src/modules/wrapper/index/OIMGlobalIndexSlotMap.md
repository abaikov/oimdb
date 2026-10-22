# `OIMGlobalIndexSlotMap` — prose moved out of the source

Every block below stood in `OIMGlobalIndexSlotMap.ts` and is reproduced verbatim, with the
declaration it stood over.

## Over `export class OIMGlobalIndexSlotMap`

Stable slot→object memo over a keyless (whole-collection) set/array index —
the keyless counterpart of {@link OIMIndexSlotMap}.

`create(slot)` runs once per canonical slot; every later read returns the
**same** object reference for the same slot, so a consumer can re-read on each
notification and still hand reference-equal objects to `React.memo` /
`Object.is` diffing, or reuse the same view-model.

The cache is a `WeakMap` keyed by the slot object, so a mapped object is
reclaimed by GC once its slot is dropped. There is no teardown callback and
none is needed for plain values; if your mapped objects hold resources needing
explicit cleanup, drive an ordered command stream (whose `remove` / `set` /
`reset` commands are the exact removal signal) instead.

Thin wrapper: no queue, no standing subscription of its own. Subscribe through
`slotMap.emitter`, which IS the index's emitter — the wrapper adds
mapping, not a second subscription surface.

### Do NOT map a slot to its entity

`createOIMGlobalIndexSlotMap(index, slot => slot.item)` reads correctly once
and is stale forever after: the cache is keyed by slot identity, and a slot
survives entity updates on purpose (`slot.item = entity`, same slot object).
Use `index.getEntities()` for entities — a field read, no cache needed — and
`OIMComputed` / selectors for values derived from entity data, which key on
the entity and invalidate on write. See {@link OIMIndexSlotMap} for the full
explanation.

## Over `public readonly emitter`

The index's own emitter — not a copy, not a wrapper.

## Over `public get(slot)`

The mapped object for a slot, created once and cached by slot identity.

## Over `public getAll()`

Mapped objects for every slot in the index, with stable references. For a
set-based global index the order is unspecified (as the set is); for an
array-based one it follows the index order.

## Over `public map<TNext>(create)`

Chain another projection. `map(f)` returns a slot map over the SAME index
whose objects are `f(this.get(slot))`, cached by slot identity — both
levels hand back stable references and each `create` runs once per slot.
