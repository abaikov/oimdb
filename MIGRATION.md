# Migration Guide: From oimdb to @oimdb packages

## Overview

The `oimdb` package has been split into two separate packages for better modularity and tree-shaking:

- **`@oimdb/core`** - Core functionality (collections, indices, events)
- **`@oimdb/dx`** - Developer Experience API (simple database interface)

## Migration Steps

### 1. Uninstall old package
```bash
npm uninstall oimdb
```

### 2. Install new packages
```bash
npm install @oimdb/core @oimdb/dx
```

### 3. Update imports

#### Before (old package):
```typescript
// Core functionality
import { OIMCollection, OIMIndex } from 'oimdb';

// DX API
import { createDb } from 'oimdb/dx';
```

#### After (new packages):
```typescript
// Core functionality
import { OIMCollection, OIMIndex } from '@oimdb/core';

// DX API
import { createDb } from '@oimdb/dx';
```

## Package Contents

### @oimdb/core
Contains all the foundational classes and interfaces:
- `OIMCollection`, `OIMIndex`, `OIMEventQueue`
- All event schedulers and coalescers
- Type definitions and enums
- Abstract classes and interfaces

### @oimdb/dx
Contains the high-level API:
- `createDb()` function
- `OIMDxDb` class
- All the convenience methods for collections and indices

## Benefits of the Split

1. **Better tree-shaking** - Only import what you need
2. **Smaller bundles** - DX users don't pay for core internals
3. **Independent versioning** - Core and DX can evolve separately
4. **Clearer dependencies** - DX explicitly depends on core

## Backward Compatibility

The old `oimdb` package is marked as deprecated and will show a warning when installed. All functionality remains available through the new packages.

## Support

If you encounter any issues during migration, please:
1. Check that both packages are installed
2. Verify import paths are correct
3. Open an issue on GitHub
