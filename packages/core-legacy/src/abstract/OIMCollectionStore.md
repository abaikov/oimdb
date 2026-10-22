# `OIMCollectionStore` — prose moved out of the source

Every block below stood in `OIMCollectionStore.ts` and is reproduced verbatim, with the
declaration it stood over.

## Over `abstract getOrReserveSlotByPk`

Returns the canonical slot for `pk`, creating a reserved empty slot
(`item: undefined`) if no entity exists yet. The reserved slot is a stable
reference that fills in when the entity is later written, so indexes can
hold it ahead of the entity's arrival without crashing.

## Over `abstract findSlotByPk`

Returns the existing slot for `pk` (live or reserved) without creating
one. Used by the slot-based emitter to resolve a slot for delivery /
unsubscribe without side effects.

## Over `abstract getManyByPks`

Length-aligned with `pks`: `undefined` wherever a pk has no entity. A missing entity is a real
state of the store, so the read surfaces it instead of deciding for the caller — the same
contract as {@link OIMIndex.getEntitiesByKey} and every selector.

## Over `abstract getManyByPksCompact`

The same read with holes filtered out, so the result may be SHORTER than `pks`. Deliberate and
separately named: silently swallowing a missing entity is exactly what makes torn state hard to
find. Safe when the pks come from a derived index (dense by construction).
