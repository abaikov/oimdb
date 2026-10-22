# `OIMSelector` — prose moved out of the source

Every block below stood in `OIMSelector.ts` and is reproduced verbatim, with the
declaration or statement it stood over.

## Over `export abstract class OIMSelector`

A watchable value derived from reactive sources, delivered on flush and only
when it actually changed.

The graph work — holding dependencies, subscribing, collapsing several
invalidations in one frame into one run, scheduling by topological level — is
an {@link OIMEffect}. This class owns only what is selector-specific: the
listeners, the last delivered value, and the equality that decides whether a
new value is worth delivering.

It used to reimplement the effect rather than compose it, and the copies
drifted: a fix to how invalidations are deduplicated within a flush landed in
the effect and silently did not land here. One node type, one place to fix.

## Over `private readonly effect: OIMEffect`

Built once, then activated and deactivated as watchers come and go — a
selector nobody watches holds no subscriptions and cannot fire.

## Over `public watch(onValue)`

Start watching this selector. The callback is called immediately with the
current value, then coalesced and delivered on `queue.flush()` whenever the
value changes.

## Inside `watch`'s returned disposer, over `this.effect.deactivate()`

Last watcher gone: stop listening, and forget the delivered value
so the next watcher is greeted with a fresh read rather than a
comparison against something nobody has seen for a while.

## Inside `deliver`, over the `areEqual` early return

Equality belongs to the selector: the sources report that something
moved, this decides whether that means anything to a watcher.
