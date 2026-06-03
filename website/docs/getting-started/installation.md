---
sidebar_position: 1
---

# Installation

OIMDB is published as scoped npm packages. Install only what your project needs.

## Core

The core library is required for all other packages:

```bash
npm install @oimdb/core
```

## React

```bash
npm install @oimdb/react @oimdb/core
```

## Redux Adapter

```bash
npm install @oimdb/redux-adapter @oimdb/core redux
```

## Async

For IndexedDB, remote stores, or other async backends:

```bash
npm install @oimdb/async @oimdb/core
```

## Persist

For durable persistence with memory, `localStorage`, IndexedDB, or custom strategies:

```bash
npm install @oimdb/persist @oimdb/core
```

## Snapshot Manager

```bash
npm install @oimdb/snapshot-manager @oimdb/core
```

## Requirements

- **Node.js** 18+ for development (Node 20+ recommended)
- **TypeScript** 5+ recommended for full type inference
- **React** 18+ when using `@oimdb/react`

## Monorepo Development

If you are working on OIMDB itself:

```bash
git clone https://github.com/abaikov/oimdb.git
cd oimdb
npm install
npm test
npm run build
```

Run the documentation site locally:

```bash
npm run docs:dev
```
