# `OIMDerivedCollection` — prose moved out of the source

Every block below stood in `OIMDerivedCollection.ts` and is reproduced verbatim, with the
declaration or statement it stood over. One block stayed in the source: the note on
`updateEntity` in the `super()` call, which says why the derived collection replaces rather
than merges.

## Over `compare?` in `TOIMDerivedCollectionOptions`

Skip a downstream update when a source change leaves the re-derived entity
equal. Default `Object.is` (a fresh object each derive → always different,
so it propagates every source change; pass a shallow/field compare to
memoize finer).

## Over `store?`

Custom store — pass a trie-driven store when the source PK is composite.

## Over `buildInitial?`

Build from the source's current contents at construction (default true).

## Over `export class OIMDerivedCollection`

A reactive collection whose entities are derived one-to-one from a source
collection: `derived[pk] = derive(source[pk])`, keyed by the SOURCE pk. It
listens to the source and keeps itself in sync — add / update / remove.

It is a first-class `OIMReactiveCollection`, so it can be indexed, selected,
and derived-from again — a CHAIN of one-to-one projections, not a join. There
is deliberately no multi-source variant: a joined row would need a primary key
nobody references, and an identity nobody uses is not an identity. Combine
across collections with one `OIMComputed`, or, if something really does
reference the combined thing, give it its own collection and write to it.
Maintenance runs on the source's
synchronous UPDATE channel, so a chain of derivations stays consistent within
the same flush; delivery to keyed subscribers is batched on flush as usual.

Parallels `OIMDerivedCollectionIndex*`: the source stays the single source of
truth, and this needs no compute runtime — it is driven purely by the source's
update events.

## Inside `rebuildFromSource`, over the first loop

Drop derived entries whose source is gone, then (re)derive the rest.

## Inside `onSourceUpdate`

`pks` always enumerates exactly the changed keys (clear() lists every
removed key), so removals flow through the normal per-key path below.

## Inside `syncPk`, over the `compareDerived` early return

Memoize: a source change that leaves the derived value equal is not
propagated downstream.
