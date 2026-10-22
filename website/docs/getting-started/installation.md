---
sidebar_position: 1
description: Why npm install gives the previous engine, how to work from the repository instead, which packages are stubs, and how to verify a change.
---

# Installation

:::danger[An install does not fail — it hands you the previous engine]

`npm install @oimdb/core` does not install the engine these pages describe,
and it does not error either. The name on npm belongs to the engine this one
replaced: the highest version published on the registry is 3.12.1, against 4.0.0 here.
That is the same code the benchmark measures separately under the
name `oimdb-legacy`. The same holds for `@oimdb/react` (3.0.0 here, 2.2.0 on
npm), `@oimdb/redux-adapter` (3.0.0 / 2.2.0), `@oimdb/persist` (4.0.0 / 3.2.0)
and `@oimdb/exodra` (1.0.0 / 0.7.1). None of those installs fails; each hands
you something else.

Everything below is therefore about working in this repository. It does not
cover adding a dependency to a project.

:::

## Working in the repository

```bash
git clone https://github.com/abaikov/oimdb.git
cd oimdb
npm install
```

The engine lives in `packages/core`. Inside the workspace, `npm install` links
`node_modules/@oimdb/core` to `packages/core`, so an import names the engine this
site describes. The package's `exports` point at `dist/`, so code that runs against
it needs the package built first:

```bash
npm run build:core
```

The other packages have the same kind of script (`build:react`, `build:persist`,
`build:persist-localstorage`, `build:persist-idb`, `build:persist-async-kv`,
`build:persist-json`, `build:persist-memory`, `build:redux-adapter`,
`build:devtools`, `build:mcp`). A package that depends on the core needs
`build:core` to have run first. To build every package in the workspace with one
command:

```bash
npm run build:core
npm --workspaces --if-present run build
```

The root `npm run build` is not that command: it bundles the deprecated `oimdb`
umbrella package, which only re-exports `@oimdb/core`. With the core built, import the engine:

```typescript
import { OIMDB, createOIMEntityService } from '@oimdb/core';

const db = new OIMDB();
const cardService = createOIMEntityService<{ id: string }>(db, { keyOf: (card) => card.id });
const cards = cardService.createStoreSlot(db);
```

The other packages (`packages/react`, `packages/persist` and its backends,
`packages/redux-adapter`, `packages/exodra`, `packages/devtools`) sit next to it and
import the core the same way.

Run the documentation site locally:

```bash
cd website
npm start
```

## The two stubs

`@oimdb/async` is a deprecated stub: its `src/index.ts` is `export {}` and it
declares no dependency on the core. Do the waiting outside the store: `await`
your network or IndexedDB read, then write the result in with
`entityService.upsertEntities(storeSlot, ...)`.

`@oimdb/snapshot-manager` is likewise `export {}`. See
[Snapshot Manager](/docs/packages/snapshot-manager).

## Requirements

- Every `@oimdb` library ships both formats. `@oimdb/core`, `@oimdb/react`,
  `@oimdb/persist` and its five backends, `@oimdb/redux-adapter`,
  `@oimdb/exodra` and `@oimdb/devtools` each declare `"type": "module"`, build
  both ESM and CommonJS through `tsup`, and publish an
  `exports` map carrying `types`, `import` and a nested `require`. So `import`
  resolves to `dist/index.js` with `dist/index.d.ts`, and `require` to
  `dist/index.cjs` with `dist/index.d.cts`, which keeps a CommonJS
  consumer's declarations and its runtime agreeing on the module shape. `main`
  names the CommonJS bundle for the older resolver; the `.cjs` extension makes it
  CommonJS whatever the `"type"` field says. A bundler configured for either
  needs nothing more.

  Choose one of the two for `@oimdb/core` and stay with it across your whole
  process. If you `import` the core in one file and `require` it in another, you
  load two copies of the engine, and the two share nothing: not the channel
  classes, not `OIMDefaults`. The core refuses that at load time: its entry point
  registers itself under `Symbol.for('@oimdb/core')` on `globalThis`, and the second
  copy to load throws `@oimdb/core is loaded twice in this process` (see
  `oimRegisterCoreInstance`). Two installed copies of the core in one bundle fail the
  same way. `@oimdb/react` loaded twice fails at the first render instead: every
  hook throws
  `useOIMDB: no <OIMDBProvider db={...}> above this component.`
  with the provider plainly above it, because a React context's identity is its lookup key. The
  same applies to any package that hands core objects around, which is all of
  them.

  `@oimdb/mcp` is a CLI rather than a library you import: its `bin/*.cjs` entry
  points `require('../dist/index.cjs')` inside the package. It depends on no
  other `@oimdb` package.
- Node.js 18+ for development.
- TypeScript 5+. The whole surface is typed off the entity you name, and
  `TOIMEntityColumnName<TEntity>` is where the column-name checking comes from: a
  misspelled column handed to `OIMSlotContentEntityService.deleteEntityColumns` or to
  `@oimdb/react`'s `useOIMField` is a compile error naming the valid ones.

## Bundle size

What each consumer ships, bundled from source with esbuild (minified, tree-shaken,
ESM). `npm run size` measures it and fails when this table no longer matches;
`npm run size:write` rewrites it.

{/* bundle-size:begin */}
| Consumer | Minified | Minified + gzip |
|---|---:|---:|
| Everything `@oimdb/core` exports | 102689 B | 25093 B |
| One entity store slot: `OIMDB`, `createOIMEntityService`, `upsertEntity`, `getSlotByKey` | 41128 B | 10585 B |
| The same, plus one effect and `db.flush()` | 49617 B | 12713 B |
| The same, plus one index: `createOIMIndexService` | 71095 B | 17506 B |
| An ordered bucket with commands: `createOIMBucketService`, `OIMSlotContentBucketServiceArrayDriven`, `OIMBucketCommands` | 55713 B | 13767 B |
{/* bundle-size:end */}

## Verifying a change

The repository's own rule, before declaring any change to docs, config or package
structure done:

```bash
npm run verify
```

In short, `verify` is lint → type-check → test → build. The script runs these
steps, in this order: `lint`, `clones`, `check-structure`, `build:core`, `type-check`,
`check:docs`, `size`, `test`, the bench's own tests, then the `build` of every
workspace. `check:docs` type-checks every `ts` block on these
pages against the current source, and `size` fails when the bundle table above no
longer matches. The type-check step
(`npm --workspaces --if-present run type-check`) is the only one that reads the
test tree as TypeScript: Jest transpiles under `isolatedModules`, so a test run
alone sees no type error.

## Where to next

<DocCards>
<DocCard to="/docs/getting-started/quick-start" title="Quick Start">A complete, type-checked program.</DocCard>
<DocCard to="/docs/core/model" title="The model">The engine model in one page.</DocCard>
</DocCards>
