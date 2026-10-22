# VOID — nothing in this directory may be cited

The pair that produced these readings did not measure what it says it measured.
Established by arithmetic over its own constants, not by opinion:

- every pass replayed the previous pass's `(slot, rank)` pairs, so the writes were
  discarded before `OIMChannel.write` and the shipped arm derived nothing;
- fan-out was exactly one, so the arm labelled "deduped in the channel" never
  deduplicated once;
- neither fixture had a subscriber, so the shipped arm skipped the dependent walk that
  every real consumer forces through `OIMEffect`.

The two directories also differ in machine load as well as in code, so the difference
between them prices neither.

What the pair must have before it is re-run is the inverse of the three faults
above — writes that reach `OIMChannel.write`, a fan-out above one, and a
subscriber on each fixture — with both arms taken on the same machine under the
same load. The rows built to that specification are in
`packages/bench/src/price/alternativePairsComputedDedup.ts`.
