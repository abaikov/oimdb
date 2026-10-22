# Bench entry points

## bundle

### What one public API costs an application that never calls it

No gate, no refusal, no controls about the machine, and that is not an omission:
the same source through the same bundler emits the same bytes on a loaded laptop
and an idle one. The controls here are about the TOOLCHAIN — that unreachable
code is dropped and that the minifier ran — the two ways this can be silently
wrong.

The `field-machinery` piece bundles ONE consumer twice, the second time against
`packages/core/src` with the apparatus taken out in memory by named rules. An arm
built that way is a COUNTERFACTUAL: a bound on what a split would save, not a
reading of a package anybody can install.

## price-worker

### Why one pair gets a process to itself

Anything that shares a process shares a heap, a set of inline caches and whatever
tier V8 has decided the shared code deserves — two byte-identical copies of one
library, in one process, differed by 32% at the minimum, the measurement
recorded in `harness/README.md#measure`.

### Nothing is summed

Each side is one body timed as a body, because summing separately-measured
micro-benchmarks is the mistake this harness has already made: each one carried its
own call overhead, and their total came out well above the same path timed as a
path.

### Why several passes are never folded into one sample

Folding would hide a GC pause from the minimum and put the untimed `reset` out of
reach of the sides that need one before every pass.

## retained

### What an option holds, in bytes, for the life of the process

A timing ratio says nothing about what is left: retention is not slow, it is
present, and no stopwatch reports it.

## worker

### Why one process

Isolation is correctness, not tidiness. Libraries with global reactivity state
leak between scenarios — Legend-State stops re-running newly registered
`observe` callbacks once an earlier batch of them is live, which silently turned
one of its rows into a measurement of nothing — and a process that has already
run something else carries its JIT and GC state into whatever runs next.

### What the memory baseline holds

In the baseline, and therefore not in the delta: the dataset and its load copy;
the module graph of the one adapter the worker loads through `loadParticipant`;
and the row STRINGS, so the delta counts the structure a store builds around the
values, not the text of the values.

In the delta: what the library keeps plus what the adapter had to keep in order
to write to it, which are not separable, as the report says.

`global.gc()` is called TWICE on each side: a second mark-compact collects what
only became unreachable during the first.

### What the proof pass covers

A timing process has different JIT state, a different heap and a sampling loop
behind it, so "the same code path as verify" is an assumption rather than
evidence; and `check` alone is the script's own statement about its own counters,
which a store can satisfy while rendering the wrong rows. Nothing in it may enter
the timed region — a check inside the clock would change what is measured.
