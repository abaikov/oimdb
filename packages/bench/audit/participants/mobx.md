---
participant: "mobx"
version: "7.0.6"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "6136d9b119ec9d1f"
verdict: "idiomatic"
summary: "MobX 7's documented store shape: rows, owners and pair records are class instances annotated with makeObservable (accessors on the instance, no Proxy) held in observable.maps, a computed per view with the shipped compareShallow comparer, an autorun per consumer, every write in an action and every script frame in one runInAction. The chain, the diamond and the view switch are computeds and boxes over observables, nothing derived by hand."
wirings:
  bind: { verdict: "idiomatic", note: "computed + autorun per view over an observable.set bucket of row observables (adapters/mobx.ts:122-141). Rows are MobxRow instances (mobx.ts:51-71, created at mobx.ts:166) whose constructor calls makeObservable with group, rank, label and note annotated observable; id is a plain field. makeObservable goes through asObservableObject on the instance (node_modules/mobx/src/api/makeObservable.ts:22-34), which defines cached accessors directly on it (src/types/observableobject.ts:358-403, 676-688) rather than building the Proxy observable({ ...row }) builds in MobX 7 (src/api/observable.ts:209-216; src/types/dynamicobject.ts:54-60). The window computed uses compareShallow (mobx.ts:129; src/utils/comparer.ts:15-17), so a recompute that selects the same row objects in the same order does not re-run the autorun (src/core/computedvalue.ts:259-283). For a key already held all four fields are assigned unconditionally (mobx.ts:171-175); the no-change check is MobX's own prepareNewValue_ (src/types/observablevalue.ts:116-131, reached from src/types/observableobject.ts:155-178)." }
  bindPerGroup: { verdict: "idiomatic", note: "The same body with fifty views (mobx.ts:1005), each computed over its own group's bucket, so the dependency sets are disjoint." }
  frame: { verdict: "idiomatic", note: "frame is runInAction around the script's writes (mobx.ts:47-49; src/api/action.ts:93-95; dist/mobx.cjs.development.js:2472, cited at mobx.ts:46), used by every wiring (mobx.ts:274, 408, 649, 834, 939). Each write method is itself a runInAction, which nests, so reactions wait for the frame's outermost action and settle is a no-op on the window wiring (mobx.ts:275)." }
  churn.row: { verdict: "idiomatic", note: "One autorun per subscriber over a resolved row observable (mobx.ts:338-349, 448-452). The body reads all four atoms of the row (wholeRow, mobx.ts:353-356) because MobX tracks per property and the row shape subscribes to the whole row (SCENARIOS.md, churnColumn: 'on one column instead of the row'); declared in departure (mobx.ts:965-972). The autorun stores its read per slot on every run including the first, and unmount clears it (mobx.ts:342, 494), which is what the verify pass's read fold checks." }
  churn.wide: { verdict: "idiomatic", note: "One autorun whose body reads every one of the CHURN_WIDE rows whole and keeps the first one's label (mobx.ts:453-459), so MobX registers it on every source atom; the first label is what churnWide's model expects." }
  churn.column: { verdict: "idiomatic", note: "autorun reading row.label alone (mobx.ts:463-466); a MobX property is its own atom, so this is the column with nothing standing for it." }
  churn.chain: { verdict: "idiomatic", note: "depth computeds stacked, built inside the mount (mobx.ts:467-481): the bottom one reads the count roots whole (types.ts / SCENARIOS.md: derivations 'over several rows') and returns chainLevelOf(joined labels, 1), level k returns chainLevelOf(level k-1, k), and the autorun reads the head (harness/derivations.ts:1-13)." }
  churn.diamond: { verdict: "idiomatic", note: "Two computeds over the root row read whole (types.ts:69-70, 'two derivations over root row from') deriving diamondLeftOf / diamondRightOf of its label, one computed over both (diamondJoinOf), and the autorun on the join (mobx.ts:482-488). MobX computeds are glitch-free and the reaction runs at the end of the outermost action, so the join and the autorun run once per write. Read, not run." }
  reads.byKey: { verdict: "idiomatic", note: "One ObservableMap.get per key outside any reaction (mobx.ts:630-638), nothing resolved in advance." }
  reads.byWindow: { verdict: "idiomatic", note: "The offset is an observable.box written in an action (mobx.ts:517, 640-642); the paged computed re-runs a top-(offset+window) selection over the group bucket with compareShallow, and the autorun reads the offset itself (mobx.ts:530-540, 551-554). MobX keeps no ordered index, so the re-selection is the library's cost." }
  reads.byTwoAxes: { verdict: "idiomatic", note: "onAxis computed with compareShallow (mobx.ts:541-548): a group move of a row the second predicate excludes leaves the selected objects unchanged, so view B's autorun does not re-run." }
  reads.bySwitch: { verdict: "idiomatic", note: "The group view A selects from is a second observable.box (pagedGroup, mobx.ts:518) that the paged computed reads (mobx.ts:530-540); switchGroup sets it and the offset to 0 in one runInAction (mobx.ts:643-648), so view A's autorun runs once, at the end of the action. View B's computed never reads the box. Read, not run." }
  relations: { verdict: "idiomatic", note: "Owners and pair records are MobxOwner and MobxPair instances, makeObservable with only name and mark annotated (mobx.ts:73-95), held in observable.maps (mobx.ts:767-774, 793); holdRelation resolves them once and mints pair records untimed (mobx.ts:779-814); writePair composes the key per call and does one pairs.get (mobx.ts:826-833)." }
  single: { verdict: "idiomatic", note: "observable.box plus autorun (mobx.ts:887-959), MobX's documented scalar; an equal set is dropped by the box's default compareDefault (src/types/observablevalue.ts:71, 131)." }
improvements: []
---

## Version

`version` is `7.0.6` (adapters/mobx.ts:963) and `node_modules/mobx/package.json`
declares `7.0.6`. MobX 7 now has an `exports` map; its `node` condition (listed before
`import`) and its `default` both resolve to `dist/index.js`, which picks
`mobx.cjs.production.min.js` only when `NODE_ENV === 'production'`. The worker sets
`NODE_ENV: 'production'` (harness/measureBatch.ts:201). The package ships its
TypeScript source, and line references below are to `node_modules/mobx/src`.

## What MobX documents and what the adapter does

MobX's recipe is observable state, `computed` for derivations, a reaction to push them
out, and writes inside actions (cited `docs`: mobx.js.org/reactions.html#autorun). Its
store shape is a class whose constructor calls `makeObservable`
(mobx.js.org/observable-state.html). The adapter follows it in every wiring:

- Rows are `MobxRow` instances (mobx.ts:51-71): the constructor copies the five fields
  and calls `makeObservable(this, { group, rank, label, note: observable })`. `id` is
  not annotated, because nothing ever writes it. Owners and pair records are `MobxOwner`
  and `MobxPair` (mobx.ts:73-95) of the same kind.
- Every write method wraps its assignments in `runInAction` (e.g. mobx.ts:160-230), so
  reactions run once at the end of the outermost action. `frame` is one more
  `runInAction` (mobx.ts:47-49); see the `frame` wiring. The no-change check is MobX's
  own (`prepareNewValue_`, src/types/observablevalue.ts:116-131), not the adapter's,
  which is what the re-send rule in `TBinding.write` requires.
- The group index (`byGroup`, an `observable.map` of `observable.set`s, mobx.ts:106-118)
  is maintained by the adapter on insert, move and removal. MobX has no index of its
  own, so this is user code a MobX application writes, and it holds the row
  observables, not copies of values.
- The window computed calls the shared `visibleOf` over the bucket (mobx.ts:122-130,
  harness/render.ts:313-354). Inside it MobX tracks `group` of every bucket row and
  `rank` of the rows `compareRows` touches (dataset.ts:423-424), not `label` or `note`;
  `id` is a plain field and tracks nothing. The autorun around it tracks `rank` and
  `label` of the delivered rows (render.ts:31-43). So a label patch outside the window
  wakes nothing, and a `note` patch wakes nothing at all.

## Chain, diamond and view switch

All three use MobX's own `computed`, as the contract asks:

- **Chain** (mobx.ts:467-481). `depth` computeds, the bottom one over the `count` roots,
  each level applying `chainLevelOf` with its own level number, so the head carries
  `chainHeadOf(label, depth)`. The bottom computed reads each root whole (`wholeRow`,
  mobx.ts:353-356), the same four-atom read as the row shape; declared in `departure`.
- **Diamond** (mobx.ts:482-488). Two computeds read the root row whole (`wholeRow`), as
  types.ts:69-70 defines the shape ("two derivations over root row `from`"), and derive
  from its `label`; a third reads both, the autorun reads the third. Declared in
  `departure`.
- **View switch** (mobx.ts:518, 530-540, 643-648). The paged computed reads the group
  from an `observable.box`. The box and the offset are written in one action, so the
  autorun, which reads both the offset and the computed, runs once.

## makeObservable rows and the shallow comparer

**Non-proxy objects.** MobX 7 "now always uses Proxy-backed observable objects and
arrays", and `{ proxy: false }` is "no longer supported" (node_modules/mobx/CHANGELOG.md:
75-77): `observable(obj)` goes through `observable.object`, which always builds
`asDynamicObservableObject`, a `Proxy` (src/api/observable.ts:209-216,
src/types/dynamicobject.ts:54-60). `makeObservable` on a class instance does not: it
calls `asObservableObject(target)` (src/api/makeObservable.ts:22-34), and the
`observable` annotation defines the cached getter/setter descriptors on the instance
itself (src/types/observableobject.ts:358-403, 676-688). A read is the accessor and the
administration's `getObservablePropValue_`, with no `Proxy` `get` trap in front.

**Shallow comparer on the window computeds.** `computed` defaults to `compareDefault`
(`Object.is`), and `visibleOf` returns a fresh array per recompute (render.ts:350-354),
so without a comparer any recompute would re-run the autorun even when it selected the
same rows. `compareShallow` (src/utils/comparer.ts:15-17) is `deepEqual(a, b, 1)`, which
compares the arrays element by element at depth zero, where two distinct objects are
unequal (src/utils/eq.ts:23-28, 112-114). When it says equal, `trackAndCompute` keeps the
previous value (src/core/computedvalue.ts:259-283), so `deliverableRows` still returns
the array last delivered. `compareShallow` is the MobX 7 name for `comparer.shallow`
(CHANGELOG.md:79-93).

## Churn read fold

Every churn subscriber is an autorun that stores what it read per slot on every run
(mobx.ts:338-349) and is cleared on unmount (mobx.ts:494), so the verify pass's fold
over every standing subscriber (harness/render.ts:124-141) checks each one's own source.

## Declared departures, checked

- The row-shaped churn subscriber, the bottom computed of each chain and the two sides
  of each diamond read all four atoms (mobx.ts:353-356). That is the row in MobX's
  terms; reading one property is the column shape (mobx.ts:463-466), which has its own
  table. Declared (mobx.ts:965-972).
- The timed teardown disposes reactions only (mobx.ts:315-320, 496-501); the maps are
  per binding and left to the collector. Declared.

## Hoisting

`pin` resolves the pinned observables once and replaces the window autoruns with two
column autoruns (mobx.ts:234-261). `holdChurnRows` and `holdRelation` resolve
observables once (mobx.ts:439-447, 779-797). All three are the "handle for a key" the
contract allows. `readKeys` resolves nothing in advance (mobx.ts:630-638).

## Not determined

- The time effect of `makeObservable` rows against Proxy-backed `observable({...})`
  rows, and of the chain, diamond and switch wirings. Nothing was run.
- `digest` above was not recomputed against this code.
- Whether `compareShallow` changes any digest. By the reading above it removes only
  deliveries whose text equals the previous one, which the digest does not fold
  (harness/consumer.ts:46-49); not executed.
- Which build a bundled or ESM-loaded worker would pick if resolution did not take the
  `node` condition; the `import` condition points at `dist/mobx.mjs`.
