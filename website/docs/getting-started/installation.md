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

→ [React guide](/docs/packages/react)

## Redux Adapter

```bash
npm install @oimdb/redux-adapter @oimdb/core redux
```

→ [Redux Adapter guide](/docs/packages/redux-adapter)

## Async

For IndexedDB, remote stores, or other async backends:

```bash
npm install @oimdb/async @oimdb/core
```

## Persist

`@oimdb/persist` is the storage-agnostic engine; the concrete storage backends ship as separate packages. Install the engine plus the backend(s) you need:

```bash
# in-memory (tests, SSR)
npm install @oimdb/persist @oimdb/persist-memory @oimdb/core

# localStorage
npm install @oimdb/persist @oimdb/persist-localstorage @oimdb/core

# IndexedDB
npm install @oimdb/persist @oimdb/persist-idb @oimdb/core

# JSON dump (SSR dehydrate/hydrate transport)
npm install @oimdb/persist @oimdb/persist-json @oimdb/core

# async key-value (React Native AsyncStorage, Cordova native storage)
npm install @oimdb/persist @oimdb/persist-async-kv @oimdb/core
```

→ [Persist guide](/docs/packages/persist) · [SSR guide](/docs/guides/ssr)

## Snapshot Manager

```bash
npm install @oimdb/snapshot-manager @oimdb/core
```

→ [Snapshot Manager guide](/docs/packages/snapshot-manager)

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
