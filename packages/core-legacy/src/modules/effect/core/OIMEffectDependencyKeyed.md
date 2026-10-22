# `OIMEffectDependencyKeyed` — prose moved out of the source

The block below stood over `export class OIMEffectDependencyKeyed` in
`OIMEffectDependencyKeyed.ts` and is reproduced verbatim.

Depends on updates to ONE key of a keyed source. The key argument is the whole
key — a composite key `[a, b]` is one key, never split — so there is no
`key | key[]` ambiguity to guess at. To depend on several keys, use several
dependencies (an effect already takes a `deps` array).
