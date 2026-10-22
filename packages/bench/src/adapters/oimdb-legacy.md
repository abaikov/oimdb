# The previous engine: where its source comes from, and what configuring it costs

Companion to `packages/bench/src/adapters/oimdb-legacy.ts`.

## Where the source comes from, and what a subscription reserves

Imported as the built bundle `packages/core-legacy/dist/index.js` (no tsx `__name`
wrappers, like the current engine from `core/dist`), built from the source restored
from git at `bbfe0a1`. Rebuild with `npm run build --workspace @oimdb/core-legacy`
before a bench run. Nothing else in the repository imports it, and nothing should.

Without a subscriber a carrier is never marked at all (`markUpdatedCarrier`
returns early), which is why the bucket subscription is taken in `bind`.

## The opt-ins, and what the first one costs

3.12.1 ships these as options where 4.0.0 made the equivalents mandatory, so
leaving them off would compare a configured engine against an unconfigured one
and call the difference a rewrite.

`compareEntities` is the documented way to order a derived array index by more
than one column. WHAT IT COSTS IS A FINDING, NOT AN ARTEFACT: with a custom
sorter the index cannot tell whether a write moved an entity's position, so
`orderChanged` is set unconditionally and any write routed to it re-sorts the
whole bucket. `orderBy` caches one scalar per pk and avoids that. It takes a
single value, but compares it with `<` and `>`
(`core-legacy/src/core/OIMDerivedCollectionIndexArrayBased.ts`, `compareSlots`),
so a string of a zero-padded rank joined to the id would express rank-then-id
for non-negative ranks. Not wired and not measured: whether every rank a script
writes is non-negative, and whether the cached scalar beats `compareEntities`
here, are both open.

`OIMSlotWriterFieldMasked` is required by `deps` — the index constructor throws
on a plain writer rather than ignoring the declaration — and it compares values,
which is what makes the re-send scenario a no-op. The default merge updater is
kept: it allocates a new entity per write, which is what 3.12.1 does unless told
otherwise, and the field-masked writer refuses an in-place updater outright. So
the harness's own row objects are never written through, and what a pin saves is
the map read, not the field load.

## The composite key this row answers for and no other does

3.12.1's `OIMCollectionStoreTrieDriven` is declared over `TOIMKeyPath =
readonly TOIMPk[]` and backed by `OIMTrieMap`, so `['o3', 'k00000003']` built
fresh resolves to the slot an equal tuple was stored under. 4.0.0's tree store
keys on a chain of COLLECTION SLOTS and has no scalar form at all, which is why
`compositeKeyWrite`'s description says the scalar case is not measured on that
row. It is measured on THIS one.

## The churn binding: no kit, a field emitter, and nodes it can release

The churn binding constructs `OIMReactiveCollection` itself. The kit is that
same constructor plus an index factory, selectors and a dispose scope
(`core-legacy/src/dx/OIMCollectionKit.ts`), and its options type is
`TOIMCollectionOptions` (`core-legacy/src/types/TOIMCollectionKit.ts`), which
has no `createUpdateEmitter`. Passing that option installs
`OIMCarrierKeyedFieldEmitter`, a subclass that adds `subscribeOnKeyFields` and
leaves `subscribeOnKey` and `subscribeOnKeys` as they are, so the row and wide
shapes go through the same path they did under the kit.

The column shape is `subscribeOnKeyFields(pk, mask, handler)`, with the mask
taken from the registry the field-masked writer was given, which is what makes
the bits agree (`core-legacy/src/core/OIMCarrierKeyedFieldEmitter.ts`).

The chain shape builds what the script asks for: one `OIMComputed` over
`on.collection` for each of the roots, deriving `chainLevelOf(label, 1)`,
`depth - 1` more stacked over `on.computed`, level k deriving
`chainLevelOf(level k−1, k)`, and an `OIMEffect` on the head, all on
`getOIMComputeRuntime(queue)`, the runtime the kit itself uses. The diamond is
two `OIMComputed` over the one root's `on.collection` (`diamondLeftOf`,
`diamondRightOf`), a third over both through `on.computed` (`diamondJoinOf`),
and an `OIMEffect` on the join. The runtime schedules by topological level and
an effect already scheduled is not scheduled again
(`core-legacy/src/modules/effect/core/OIMEffect.ts`, `onComputedInvalidate`), so
the join runs once per flush. Both are constructed directly rather than through
`kit.computed` and `kit.effect` because those register every node in the kit's
`OIMDisposeScope`, which has `add` and `destroy` and no removal
(`core-legacy/src/core/OIMDisposeScope.ts`). A component-lifetime derivation
that unmounts there would stay registered until the kit is destroyed. Unmount
destroys the effect and then the computeds, head first.

## The view switch

`switchGroup` drops view A's `index.emitter` subscription, subscribes on the
other group's key, and resets the page start; the settle re-reads that bucket
and re-points the window's keyed subscriptions, as a scroll does. The derived
index maintains every group's bucket already, so nothing is filled on switch.

## `frame`

3.12.1 has no batch or transaction call. A write updates its slot at once and
marks its carrier; nothing is delivered until `queue.flush()`
(`core-legacy/src/core/OIMEventQueue.ts`, `flush`), which the binding calls in
`settle`. The writes of one frame are therefore already coalesced, and `frame`
calls `run()` and nothing else.
