# What an autorun is told, and whose check skips the re-send

Companion to `packages/bench/src/adapters/mobx.ts`. The row's admission and
departure statements: see `packages/bench/PARTICIPANTS.md`.
https://mobx.js.org/computeds.html
https://mobx.js.org/reactions.html#autorun

## When reactions run, and what is tracked

A `computed` with no observer notifies nobody; the `autorun` is what mounts it and
keeps it pushed, at the end of the outermost action rather than on a microtask — which
is why `settle()` is a no-op and why every write here is in an action. `frame` is
`runInAction` around the script's writes, so the per-method actions inside it nest and
the reactions run once, when the frame's action ends. MobX runs an `autorun` body once
on creation, and that run IS the mount. Reading a property inside an action but outside
a reaction is untracked, so a page being asked for wakes no computed.

`byGroup.get(group)` inside a computed is tracked even while the group does not exist
(`get` calls `has`, which registers the key in `hasMap_`). The store binds EMPTY, so
that is what makes the load reach the views at all.

## Chain, diamond and view switch

All three are MobX's own `computed`. A chain is `depth` computeds stacked: the bottom
one reads the `label` atom of every root row and returns `chainLevelOf(label, 1)`, level k returns
`chainLevelOf(level k−1, k)`, and the autorun reads the head, so the text it reads is
`chainHeadOf(label, depth)`. Both derivation families are functions of a label
(`harness/derivations.ts`), so every adapter reads only the label here. A diamond is two
computeds over the root row's `label` (`diamondLeftOf`,
`diamondRightOf`), and a third over both (`diamondJoinOf`), with the
autorun on the third; MobX's computeds are glitch-free, so the join and the autorun run
once per action. The view switch is a second `observable.box` beside the offset, holding
the group the paged computed selects from; `switchGroup` sets it and the offset to 0 in
one action, so the autorun runs once.

## Whose comparison the re-send rows measure

For a key already held, every field is assigned unconditionally; the value check is
MobX's own (`prepareNewValue_`), so a re-send writes 4 × n properties and notifies on
none.

The window computeds use `comparer.shallow`, which MobX ships: a recompute that selects
the same row objects in the same order keeps the previous array and does not re-run the
autorun. Each recompute still returns a fresh array — a buffer mutated in place would
compare equal to itself. A visible change still reaches the consumer, because the
autorun tracks `rank` and `label` of the delivered rows itself, through `deliver`.
The paged read view reads the offset in its autorun rather than packing it into the
computed's result, so the computed's value is an array the comparer can see into.

## Why this row's floor is not the others'

mobx is the ONE registered adapter that hands `deliver` something other than a plain
object (`new MobxRow(row)` in `write`, held in the bucket, selected by `visibleOf`), so
two of the consumer's three property loads a row (`rank`, `label`) are MobX accessor
calls here and plain loads everywhere else; `id` is a plain field, because it never
changes and is not annotated.

`MobxRow` is a class whose constructor calls `makeObservable(this, { group, rank, label,
note: observable })` — the store shape MobX documents
(https://mobx.js.org/observable-state.html). In MobX 7 `{ proxy: false }` is gone
(node_modules/mobx/CHANGELOG.md:75-77) and `observable({ ...row })` always builds a
Proxy (src/api/observable.ts:209-216, src/types/dynamicobject.ts:54-60).
`makeObservable` instead goes through `asObservableObject` on the instance itself
(src/api/makeObservable.ts:22-34), which defines the cached getter/setter descriptors
directly on it (src/types/observableobject.ts:358-403, 676-688): no `Proxy` `get` trap
in front of the accessors. Row shapes here never gain or lose a property, which is the
one thing a proxy adds. Owners and pair records are classes of the same kind
(`MobxOwner`, `MobxPair`), with only `name` and `mark` annotated.

`deliverableRows` hands back the window computed's own array of `MobxRow`s. A floor
measured over THAT array is the floor mobx's rows should be scaled by, and the audit
may not spread, copy or re-read it: the shape audit compares the array's elements
with the delivered ones BY IDENTITY and fails exactly that mistake. Plain rows are built
from the observables through MobX's accessors, so a write MobX decided was not a change
shows up as the old value rather than the intended one — a stashed row would have
reported the intent, which is what the audit exists to disbelieve.

The single-value wiring uses `observable.box` and no row object, which is why the
delivered-shape caveat that singles mobx out elsewhere in this report does not reach
those two tables.
