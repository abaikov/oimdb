---
sidebar_position: 1
description: How to install @oimdb/core and the packages around it, and what the install requires.
---

# Installation

```bash
npm install @oimdb/core
```

Add the packages you use next to it:

| Package | Install |
|---|---|
| React hooks | `npm install @oimdb/react @oimdb/core` |
| Redux adapter | `npm install @oimdb/redux-adapter @oimdb/core redux` |
| Persistence to IndexedDB | `npm install @oimdb/persist @oimdb/persist-idb @oimdb/core` |
| Persistence to localStorage | `npm install @oimdb/persist @oimdb/persist-localstorage @oimdb/core` |
| Exodra bridge | `npm install @oimdb/exodra @oimdb/core` |
| Devtools | `npm install @oimdb/devtools --save-dev` |

These pages describe `@oimdb/core` 4.x. The 3.x line is the previous engine with a
different API.

## From a CDN

No build step: import the ESM build from jsDelivr.

```html
<script type="module">
  import { OIMDB, createOIMEntityService } from 'https://cdn.jsdelivr.net/npm/@oimdb/core@4.0.0/+esm';

  const db = new OIMDB();
  const userService = createOIMEntityService(db, { keyOf: (user) => user.id });
  const users = userService.createStoreSlot(db);
</script>
```

Pin the exact version. jsDelivr resolves `@oimdb/react@3.0.0/+esm` to
`@oimdb/core@4.0.0/+esm`, and a page that imports the core from any other URL,
`@oimdb/core@4/+esm` included, loads a second copy (see below).

```html
<script type="module">
  import { OIMDB } from 'https://cdn.jsdelivr.net/npm/@oimdb/core@4.0.0/+esm';
  import { OIMDBProvider, useOIMEntity } from 'https://cdn.jsdelivr.net/npm/@oimdb/react@3.0.0/+esm';
</script>
```

## Requirements

- TypeScript 5+.
- Any bundler or Node.js: every package ships ESM and CommonJS with types for both.

## One copy of the core

Load `@oimdb/core` once per process: either `import` or `require`, not both, and
one installed version. A second copy throws at load time:
`@oimdb/core is loaded twice in this process`. Two copies of `@oimdb/react` show
up as `useOIMDB: no <OIMDBProvider db={...}> above this component.` with the
provider in place.

## Where to next

<DocCards>
<DocCard to="/docs/getting-started/quick-start" title="Quick Start">A complete, type-checked program.</DocCard>
<DocCard to="/docs/core/model" title="The model">The engine model in one page.</DocCard>
</DocCards>
