# Migration Guide: From `oimdb` to `@oimdb/*`

## Overview

The deprecated `oimdb` umbrella package has been split into scoped packages for better modularity and tree-shaking:

- **`@oimdb/core`** - Collections, indexes, event queue, selectors, and DX factories
- **`@oimdb/react`** - React hooks and context helpers
- **`@oimdb/redux-adapter`** - Redux synchronization utilities
- **`@oimdb/async`** - Async collections and PK indexes
- **`@oimdb/snapshot-manager`** - Snapshot persistence utilities

## Migration Steps

### 1. Uninstall old package
```bash
npm uninstall oimdb
```

### 2. Install new packages
```bash
npm install @oimdb/core
```

### 3. Update imports

#### Before (old package):
```typescript
import { OIMReactiveCollection, OIMEventQueue } from 'oimdb';
```

#### After (new packages):
```typescript
import {
    createOIMCollectionModel,
    OIMEventQueue,
} from '@oimdb/core';
```

## Package Contents

### @oimdb/core
Contains all the foundational classes and interfaces:
- `OIMCollection`, `OIMReactiveCollection`, `OIMEventQueue`
- `OIMCollectionRelations` and `createOIMCollectionModel`
- Set-based, Array-based, ordered, and derived indexes
- Selector primitives and collection selector DX
- All event schedulers and coalescers
- Type definitions and enums
- Abstract classes and interfaces

## Benefits of the Split

1. **Better tree-shaking** - Only import what you need
2. **Smaller bundles** - Integration users don't pay for packages they do not use
3. **Independent versioning** - Core and integrations can evolve separately
4. **Clearer dependencies** - React, Redux, async, and snapshot support are explicit packages

## Backward Compatibility

The old `oimdb` package is marked as deprecated and remains a thin `@oimdb/core` re-export for older consumers. New code should import directly from `@oimdb/core` and the integration packages it uses.

## Support

If you encounter any issues during migration, please:
1. Check that both packages are installed
2. Verify import paths are correct
3. Open an issue on GitHub
