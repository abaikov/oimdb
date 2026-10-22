# Retained harness

## measureRetainedArm

### Why no absolute reading is printed

`v8.getHeapStatistics().used_heap_size`, and nothing else. `used_heap_size` after
a full collection is near the live set but not equal to it, and that error is
SHARED by two arms that built the same population in the same order. Hence: the
arms of a pair must be as alike as they can be made.

Neither package under test uses `FinalizationRegistry` or `WeakRef` (checked, not
assumed), so the settle loop can be synchronous.

## retainedControls

### The floor the whole table is read under

It is not the only floor: every claim row also carries its own — its `off` arm
built twice, once before the `on` arm and once after, over the real population —
and the stricter of the two decides it. The run-wide control is deliberately
built from plain objects and nothing from the library, because a floor that moved
when the engine changed would be a floor the engine's own rows could not be
judged against.

## retainedPairsChangedFields

### Why two rows and not one

"~2x entity memory" is a RATIO and no single delta can settle it. One row
measures what the option holds, the other what an entity holds, and the report
prints both figures so the reader takes the quotient.

The multiple is a property of the row shape, and any single number for it — 2x
included — is a number for one shape: `updateEntitySnapshot` stores
`{ ...entity }`, and a spread copies REFERENCES, so the clone pays for a shell
and shares every string.

## retainedPairsDerivations

### The run this family answers, and why fan-in three

The run that was never written down priced the two arms in TIME: ×1.14 to ×1.20
for the pair at fan-in 3 and 8, level at fan-in 1.

Fan-in three, because that recorded run found the arms LEVEL at fan-in 1 (×0.96),
where the array is one element. `createOIMComputedCollectionBucketMemo` cannot be asked
this question at all: its derivations take exactly ONE source, the bucket slot,
so a per-slot arm over it would store one reading and the fork would have nothing
to decide.

### The two rows

`retained.clock.derivation-as-shipped` weighs the shipped derivation: the
denominator. `retained.clock.per-slot-readings` builds the same derivations on
both arms and adds, on `on`, one pre-sized array of `FAN_IN` readings per
derivation (`readingsPerSource`) — the K×N a per-slot clock would keep. The
second row divided by the first is the fraction the per-slot arm adds; the time
half of the same decision is `alternativePairsClock` in `src/price/`.

### What the global arm costs, for the reader taking the difference

Nothing beyond the object in the first row. `ranAtRevision` and `ranAtEpoch` are
two SMI fields declared on `TOIMDerivation`
(`packages/core/src/engine/computed/types/TOIMDerivation.ts`), which `TOIMComputedSlot`
includes, so they are inside the first row's per-derivation figure and allocate
nothing of their own. That asymmetry IS the comparison.
