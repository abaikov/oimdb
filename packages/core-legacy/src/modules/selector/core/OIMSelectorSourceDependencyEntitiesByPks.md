# `OIMSelectorSourceDependencyEntitiesByPks` — prose moved out of the source

Every block below stood in `OIMSelectorSourceDependencyEntitiesByPks.ts` and is reproduced
verbatim, with the declaration or statement it stood over.

## Over `export abstract class OIMSelectorSourceDependencyEntitiesByPks`

Keeps a selector woken by BOTH halves of an "entities of an index" read: the
index's own membership, and the entities currently in it.

The index tells us WHICH pks; the collection tells us when one of those pks
changes. So every membership change has to re-point the collection
subscription at the new pk set — that dance (compare, drop, re-subscribe,
skip when empty) is identical for every index flavour and lived in four
copies before this class.

What genuinely differs is only how a flavour reads its pks and how it
subscribes, so those are the two abstract members below. Each concrete
subclass answers them for exactly one index shape — no branch here ever asks
what it was handed.

## Over `protected abstract readPks()`

The pks this dependency currently covers, as a positional array.

## Over `protected abstract subscribeToIndex(onUpdate)`

Subscribe to the index this dependency watches. Returns unsubscribe.

## Inside `subscribe`, over the first `resubscribeCollection()` call

initial subscription to collection keys
