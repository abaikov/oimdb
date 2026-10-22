# The in-place arm of the entity updater

It mutates the existing entity instead of building a new merged object, skipping
the per-update allocation and copy of the default merge updater
(`{ ...prev, ...draft }`) — the single biggest data-layer cost on update-heavy
workloads.

What it costs: the stored entity reference stays stable across updates, so
reference-comparison bindings never see the change — React's `Object.is` /
`useSyncExternalStore`, `React.memo` on entities, prev/next diffing, time-travel.
Use it only where every reader is subscription-driven, and pair it with a
signal-driven binding that re-reads the entity on the keyed notification
(`@oimdb/react`'s `*Signal` hooks).
