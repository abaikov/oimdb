# OIMDB Examples

This directory contains practical examples demonstrating how to use OIMDB.

## Examples

### `basic-usage.ts` - Basic Usage
- Creating collections and indexes
- Subscribing to updates
- Basic CRUD operations
- Manual event flushing
- Database lifecycle management

### `index-usage.ts` - Index Functionality
- Building and querying indexes
- Index comparison strategies
- Cross-collection relationships
- Event coalescing demonstration

### `scheduler-comparison.ts` - Scheduler Comparison
- Different event scheduling approaches
- Performance characteristics
- Use case recommendations

## Running Examples

### Individual Examples
```bash
# Run basic usage example
npx tsx examples/basic-usage.ts

# Run index usage example
npx tsx examples/index-usage.ts

# Run scheduler comparison
npx tsx examples/scheduler-comparison.ts
```

### Run All Examples
```bash
npx tsx examples/run-all.ts
```

## Prerequisites

- Node.js 18+
- TypeScript
- tsx (for running TypeScript files directly)

## Notes

- Examples use the DX layer for simplicity
- All examples include proper cleanup
- Examples demonstrate real-world usage patterns
- Performance characteristics may vary by environment
