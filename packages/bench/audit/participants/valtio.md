---
participant: "valtio"
version: "2.3.2"
auditedAt: "2026-10-21"
auditedBy: "claude-opus-5-5 (churn.chain and churn.diamond declined and summary re-read 2026-10-21; other wirings from 2026-10-17, their line numbers not re-checked; churnOne and churnShared verified)"
digest: "41abb324b0f756d8"
verdict: "idiomatic"
summary: "One vanilla `proxy` state per wiring mutated in place, every consumer a `subscribe` or `subscribeKey` with the sync flag because the default microtask arm never runs in a worker that does not yield, each listener marking its view and `settle` rendering the marked ones; there is no batch, a subscription hears its whole subtree, and valtio's per-property `Object.is` makes a re-send silent. valtio 2.3.2 ships no derivation primitive and `derive-valtio` is not installed, so `churn.chain` and `churn.diamond` are declined: either would be a derivation written in the adapter, and the diamond would also need the adapter to dedup its wake in `settle`, which B3 forbids."
wirings:
  bind:
    verdict: "idiomatic"
    note: "One `proxy({ rows, byGroup })` (valtio.ts:151-155) holding each row proxy under the population and under its group bucket (:93-132). Each view is `subscribe(bucket, mark, true)` (:157-174); `settle` delivers each marked view once through `visibleOf` over the bucket's values (:247-270). The sync arm is the only one that runs here: the default arm defers to a microtask (node_modules/valtio/vanilla.js:210-216), the flag calls back inside the set (:206-208). `frame` calls its function directly (valtio.ts:52-54); the vanilla entry exports no batch (vanilla.js:278-285). A subscription hears its whole bucket, so a note write or a write below the window marks the view and delivers text it already shows. The cell wiring (`pin`, valtio.ts:203-236) is `subscribeKey` on `label` and `note` of each pinned row proxy (vanilla/utils.js:5-17), so a label write marks the label view only."
  bindPerGroup:
    verdict: "idiomatic"
    note: "Same body with fifty bucket subscriptions (valtio.ts:738). A write reaches only the listeners of the bucket its row is filed in; a parent with no listener is never wired to its children (vanilla.js:120-133), so the population record costs nothing per write."
  churn.row:
    verdict: "idiomatic"
    note: "`subscribe(row, body, true)` on the row proxy resolved at `holdChurnRows` (valtio.ts:312-343). The read is taken from the proxy at mount and is not a wake; `woke` is counted only in the body; `unmount` releases the listener and clears the read slot (:359-365). The churn and application scripts driven through this wiring write rows with `patchLabel` (harness/scenarios.ts:1883, :1888, :2484, :3040-3044), so a whole-row subscription wakes exactly the subscribers on the written rows; a write to another column of the row would wake it too, which is what a row subscription means."
  churn.wide:
    verdict: "idiomatic"
    note: "`subscribe` takes one proxy (vanilla.js:193-225), so the subscriber is one `subscribe` per source sharing one body, released together on unmount (valtio.ts:320-346); the rendered text is the first source's label. Mount pays `count` listener registrations, which is what a valtio user over several proxies writes."
  churn.column:
    verdict: "idiomatic"
    note: "`subscribeKey(row, 'label', body, true)` (valtio.ts:344-356), the shipped per-property subscription: a whole-proxy `subscribe` whose callback runs only when `Object.is` says `label` moved (vanilla/utils.js:9-13). The adapter compares nothing."
  churn.chain:
    verdict: "declined"
    note: "Declined by the adapter (valtio.ts:357, reason at 707-713). valtio 2.3.2 ships no derived value: `derive` moved to the separate `derive-valtio`, which is not installed (no node_modules/derive-valtio), the 2.3.2 utils are listed at vanilla/utils.js:575-583, and a getter is unmemoised with no change signal (README.md:300-313). A chain would be plain proxies the adapter rewrites level by level inside its own sync `subscribe` callbacks, which B3 of churnChain (scenarios.ts:2279-2283) forbids. Removes valtio from churnChain and chainFrameWrite."
  churn.diamond:
    verdict: "declined"
    note: "Declined by the adapter (valtio.ts:358, reason at 714-720). Nothing in `valtio/vanilla` computes a value from two others. Hand-written, the join is rewritten once per branch and holds a glitched value in between, so a single wake needs the adapter to hold the wake back and dedup it in `settle`, the case B3 of churnDiamond and diamondFrameWrite (scenarios.ts:2489-2492, 2571-2574) forbids. Removes valtio from churnDiamond and diamondFrameWrite."
  reads.byKey:
    verdict: "idiomatic"
    note: "One `rows[id]` property read through the proxy per key, nothing resolved in advance and nothing written (valtio.ts:417-426)."
  reads.byWindow:
    verdict: "idiomatic"
    note: "View A's cursor is a `cursor` proxy in the same state (valtio.ts:383-387). View A listens to the cursor (:401) and to the bucket of the cursor's group (`subscribePagedBucket`, :397-399). A scroll is one set of `cursor.offset` (:427-429), which marks view A through its `cursor` subscription; `settle` takes the top `offset + window` of the cursor's bucket with `visibleInto` and delivers the page at the offset (:436-454). View B listens to group A's bucket only and is not marked by a scroll. The selection is a top-k walk, not a re-sort."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "View B is `subscribe(groupA bucket, mark, true)` (valtio.ts:402-408), delivered through `visibleOnAxisInto` (:455-468). Any write into group A marks it, including rows its predicate excludes, and those deliveries are redundant."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "`switchGroup` releases view A's bucket subscription, subscribes to the new group's bucket, and sets `cursor.group` and `cursor.offset` (valtio.ts:430-435): two notifications on the cursor proxy, one delivery at `settle` of the new group's bucket at offset 0. A write to any other group does not mark view A. The re-subscription is inside the timed switch and pays what valtio charges for it: the first listener on a bucket wires every row proxy in it (`addListener`, vanilla.js:142-152), and the last listener leaving unwires them (vanilla.js:153-163); group A's bucket keeps view B's listener, so switching back to it wires nothing."
  relations:
    verdict: "idiomatic"
    note: "Owners and pairs are two records of one state (valtio.ts:482-486). The line sources are resolved once at `holdRelation` and the two views are `subscribe(owners)` and `subscribe(pairs)` with the sync flag, delivered at hold and then at `settle` when marked (:583-592). An owner write does not mark the pair view and a pair write does not mark the owner view. `writePair` composes its key per call and looks it up through `pairs`."
  single:
    verdict: "idiomatic"
    note: "One `proxy({ value, bystander })` and two `subscribeKey` listeners (valtio.ts:608-673). A write of `value` runs both listeners, because both are subscriptions to the same proxy, and only the `value` callback passes `Object.is` (vanilla/utils.js:9-13), so the bystander is not delivered. A re-send of the stored value is a no-op in the set trap (vanilla.js:56-58) and wakes neither."
improvements:
  - "churn.chain and churn.diamond (valtio.ts:357-358, 706-721): install `derive-valtio`, the pmndrs package valtio's `derive` moved to, and supply both shapes through its `derive`, so the rows price a published derived-value primitive. Adds valtio to churnChain, chainFrameWrite, churnDiamond and diamondFrameWrite."
---

## Version and recipe

`node_modules/valtio/package.json` is `2.3.2`, the same as `version`
(valtio.ts:777). The adapter imports `proxy` and `subscribe` from
`valtio/vanilla` and `subscribeKey` from `valtio/vanilla/utils`
(valtio.ts:1-2). The recipe is the README's "Use it vanilla" (README.md:260-273):
a `proxy` mutated in place and `subscribe` on it.

## The store and its notification

`proxy` wraps an object; the `set` trap compares the new value with the old by
`Object.is` and returns without notifying when they match, otherwise wraps a
plain object value in its own proxy, wires it to this proxy's listeners and
notifies (vanilla.js:53-68). Notification bumps a global version and calls this
proxy's listeners; a child proxy is wired to a parent only while the parent has
listeners (vanilla.js:120-165), so it climbs only through subscribed ancestors.
`subscribe` with `notifyInSync` calls back inside the set (vanilla.js:206-208);
without it, once per microtask (vanilla.js:210-216).

## Why each listener marks and `settle` renders

No worker yields between a write and its settle, so the default arm's microtask
never runs before the audit reads the consumers: the sync flag is the only arm
that can drive a consumer here. Delivering inside every sync callback would
render each intermediate state of a batch — the load is one notification per row
— where the library's default arm coalesces them. Marking in the callback and
rendering at `settle` is that coalescing at the harness's frame boundary; a view
the library did not notify is never rendered (valtio.ts:247-270, :436-469,
:583-592, :658-667).

## Writes

A new row is assigned as a copy and becomes a proxy (vanilla.js:63); an existing
row gets `Object.assign` of the incoming row (valtio.ts:56-63, :103-117), so only
properties whose value moved notify. A group move sets `group`, deletes the row
from its old bucket and assigns it into the new one (valtio.ts:95-100,
:124-131). A removal deletes from the population and the bucket
(valtio.ts:116-123). Point writes are one property set on the row proxy found
through `rows[id]` (valtio.ts:68-83).

## Batching

None exists in 2.3.2: the vanilla entry's exports are `getVersion`, `proxy`,
`ref`, `snapshot`, `subscribe` and three `unstable_` hooks (vanilla.js:278-285).
`frame` calls `run()` (valtio.ts:52-54); every set inside it runs the sync
listeners of its proxy and of each subscribed ancestor.

## Unverified

The `{ rows, byGroup }` shape is this adapter's choice; the README does not
prescribe a layout, and a single `rows` record with a group filter at render
would wake every view on every write. Whether the per-row Proxy allocation of
the load, the two-parent wiring of each row, or `Object.values` through the
`ownKeys` trap dominates any row is not measured. Getters as "computed
properties" were not built as a chain arm. Nothing here was run.

A React user of valtio reads through `useSnapshot`, which tracks the properties
a render touched (proxy-compare, a dependency of valtio, vanilla.js:3) and skips
a re-render when only untracked ones moved; the vanilla `subscribe` the adapter
is limited to has no such filter, so the window views here are delivered on note
writes and below-window writes that a `useSnapshot` component would ignore. That
is redundant delivery, which the harness permits, and it is the vanilla API's
behaviour rather than something the adapter adds; it was not measured.