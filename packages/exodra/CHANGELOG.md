# Changelog

## 3.0.0

### Added

- `OIMExodraPlugin.destroyParkedNode(parkedSlots, slot)`.

### Changed

- Exodra peers: `@exodra/core` and `@exodra/dom` ^0.4.1.
- `withOIMBucketList` → `withOIMBucketChildren`, `TOIMBucketListOptions` → `TOIMBucketChildrenOptions`.
- `selectChildList` → `childrenPort`.
- `selectBucketSlot(c, db)` → `selectBucketSlot(params)`; the bucket is switched by `wireExoNode`.
- A parked node is ended with `destroyExoNode` instead of `unmount`.
- Parked member nodes are kept across a bucket switch and destroyed when the slot is released or the node's effects stop.

## 2.0.2

### Changed

- Exodra peers: `@exodra/core` and `@exodra/dom` ^0.4.0.

## 2.0.1

### Changed

- README: index option `keyOf` → `selectKey` (`@oimdb/core` 4.10).

## 2.0.0

- Rewritten as an Exodra plugin over `@oimdb/core` 4.9: `OIMExodraPlugin`, `OIM_EXODRA_PLUGIN_CONTEXT_TOKEN`,
  `resolveOIMExodraPlugin`, `withOIMEffects`, `withOIMBucketList`.
- Removed: the 1.x bindable API (`exoBinding`, `exoSource`, `exoList`, `exoRows`, …).
