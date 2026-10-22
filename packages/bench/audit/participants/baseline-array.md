---
participant: "baseline-array"
version: "0"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "0c97088bc92c9512"
verdict: "idiomatic"
summary: "The naive hand-written anchor as it says it is: a Map, one dirty flag and a full top-k rescan of the population per view per settle; the churn store is callback arrays per row id, its chain body applies every level of the derivation to the first root's label, and its diamond body computes both sides and the join once per settle."
wirings:
  bind:
    verdict: "idiomatic"
    note: "Map of copied rows (baseline-array.ts:115-128), one dirty flag set by every write including patchNote (142-146), and a settle that rescans the whole population for every view through the shared top-k helper (87-96, 187-193). Re-delivering view B for a group-A write and both views for a note or re-send is the declared naive behaviour (header 45-48), not an accident. pin keeps the Map's own objects (162-175), which the cellDelivery standing allows. Both cell views are delivered on every dirty settle (102-109). frame calls run() (186): there is no library and nothing to batch."
  bindPerGroup:
    verdict: "idiomatic"
    note: "The same body with fifty views (baseline-array.ts:988), so one settle is fifty full-population rescans. That is the declared absence of a group index (header 50-54); the index is priced by baseline-indexed."
  churn.row:
    verdict: "idiomatic"
    note: "Array of callbacks per row id, push to mount, indexOf plus splice to unmount (join 460-464, mountOnRows 574-582, unmount 638-650). The settle walks each written row's subscriber list and probes the `label` column map with the row id (531-554, probe at 539-542), one Map miss per written row in row-shaped scripts, named in departure (962-971). The mount resolves row `from` once and the body reads its label off that object (466-473); every churn script writes by patchLabel, which mutates in place, so the held object cannot go stale. Under the churn read fold (auditChurnReads, scenarios.ts:1900) every standing slot's read is checked: churnList mounts slot `at` on row `at` (scenarios.ts:2279) and the body reads exactly that row. frame calls run() (520)."
  churn.wide:
    verdict: "idiomatic"
    note: "Joins 64 per-row lists, body reads the first row alone (574-582), as departure states."
  churn.column:
    verdict: "idiomatic"
    note: "A second Map of the label column's subscribers keyed by row id (432, 583-588), woken from the settle's probe (539-542): a column identity a hand-writer would build."
  churn.chain:
    verdict: "idiomatic"
    note: "No derivation object is built; the body (594-618) reads every root once, keeps the first root's label, then applies chainLevelOf for levels 1..depth, so the delivered text is chainHeadOf(label, depth) (harness/derivations.ts:3-7). The mount pays nothing for the chain; churnChain declares B1 not met for exactly this asymmetry, and as the floor that is its role. chainFrameWrite (scenarios.ts:2390-2505) mounts the same chains before the clock and times the frame alone."
  churn.diamond:
    verdict: "idiomatic"
    note: "One callback on the root row's list (620-637) that computes diamondLeftOf and diamondRightOf of the label and diamondJoinOf of both, guarded by a settle counter (settleCount, 446, incremented at 532) so it runs at most once per settle even if the row was written twice in the frame: recompute on settle, one join per frame, what a person writes by hand for a two-sided derivation over one row. churnDiamond (scenarios.ts:2507-2593) mounts on row 0 and expects every slot to read diamondHeadOf(label), which this body produces. Not run."
  reads.byKey:
    verdict: "idiomatic"
    note: "One Map get per key, nothing resolved in advance (357-365)."
  reads.byWindow:
    verdict: "idiomatic"
    note: "scrollTo moves a number and sets dirty (369-372); the settle rescans the population for top-(offset+window) and delivers the tail (286-301). frame calls run() (347)."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "The same rescan with the axis clause (295-300, visibleOnAxisInto at 297), always over view.groupA."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "switchGroup sets the group view A selects on (pagedGroup, 283), offset 0, and dirty (373-377); the next settle rescans the population for the new group, exactly as a scroll settles. View B stays on group A and is re-delivered on the same flag with unchanged content, so viewSwitch (scenarios.ts:4459-4559) counts one redundant B delivery per step; its check asks only that B's distinct renders stay 0, which holds. Not run."
  relations:
    verdict: "idiomatic"
    note: "Separate rows, owners and pairs Maps (702-705); owners and pair records resolved once in holdRelation (813-835); writePair composes the joined key per call and probes the Map (pairKey 735, writePair 851-855), as TRelationBinding.writePair requires. Both views re-render on any write (860-865), declared in the header (696-699). frame calls run() (796)."
  single:
    verdict: "idiomatic"
    note: "Two variables, a dirty flag, one delivery per dirty settle, no value comparison (904-951); frame calls run() (931)."
improvements: []
---

## What this row is

`baseline-array` declares itself the naive anchor (`packages/bench/src/adapters/baseline-array.ts:28-55`,
`admission` at 972-975): a `Map<string, TRow>` that is the store, one `dirty` boolean, and a settle
that re-derives every view from the whole population. Version `"0"` is the adapter's own
`version` (955); there is no library to compare against `node_modules`. There is no
`baseline-array.md` beside the adapter; the header points at `baseline-array-indexed.md` for the
other anchor (34).

`frame` is `run()` in all five bindings (186, 347, 520, 796, 931). With no library there is no
batching API to enter, and every write already only marks state that the next settle reads.

## Is it artificially slow

- The full rescan per view per settle (87-96) and the redundant deliveries for writes no view reads
  are the declared design (45-48), and the sibling `baseline-indexed` exists to price the index this
  row lacks.
- `bindPerGroup` multiplies that rescan by fifty (988).
- The churn settle probes the `label` column map for every written row (539), even in scripts that
  mount no column subscriber; one `Map.get` keyed by the row id the loop already holds, disclosed in
  `departure` (962-971).
- Unmount is `indexOf` plus `splice` (638-650). `churnColumn`'s standing names this as what a
  person writes, so it is not a handicap.

## Is it artificially fast

- `pin` keeps the stored object and writes through it (162-185); `patchPinnedLabel` skips the
  `byId.get` that `patchLabel` pays. The cellDelivery standing states this and accepts it.
- `holdRelation` resolves owner objects and pair records once (813-835); `writePair` still composes
  and probes per call (851-855).
- `churn.chain` builds no derivation; the body still applies every level per wake. churnChain's B1
  is declared not met for the mount.
- `churn.diamond` computes the two sides inline in the one callback; there is no node per side to
  build or tear down, which is the hand-written shape and the mount cost a library is read against.
  churnDiamond's B1 is declared not met for exactly this (scenarios.ts, churnDiamond standing B1).
- `readKeys` resolves nothing in advance (357-365).

No place was found where this binding skips work a scenario's `check` or oracle demands.

## Not verified

- Nothing was run. The churnDiamond and viewSwitch checks were read against this wiring
  (see the two notes above), not executed.
- `departure` (962-971) says "three things" and then names four (wide body, chain, diamond, column
  probe); the content is accurate, the count is not.
