# `OIMReactiveIndexSetBased` — prose moved out of the source

The block below stood over `export abstract class OIMReactiveIndexSetBased` in
`OIMReactiveIndexSetBased.ts` and is reproduced verbatim. The source file carries no
comment line: three lines of code leave no room under the ceiling.

Reactive wrapper over a set-based keyed index.

It carries no members of its own: naming `Set<TPk>` / `ReadonlySet<slot>` as
the read shapes IS the whole job, and {@link OIMReactiveIndex} already
delegates against those. The class stays because callers name it in
signatures ("a reactive index whose reads are sets") — that distinction is
static, resolved by the type checker, never by probing a value at runtime.
