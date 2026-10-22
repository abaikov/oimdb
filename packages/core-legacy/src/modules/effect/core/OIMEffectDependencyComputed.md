# `OIMEffectDependencyComputed` — prose moved out of the source

The block below stood over `export class OIMEffectDependencyComputed` in
`OIMEffectDependencyComputed.ts` and is reproduced verbatim.

Effect dependency on a computed. Carries the computed itself (`source`) so the
runtime can look up its topological depth — the level lives in the runtime,
not on this dependency.
