# Contributing

```bash
git clone https://github.com/abaikov/oimdb.git
cd oimdb
npm install
npm run build:core
```

The packages import `@oimdb/core` from its `dist/`, so build the core before
running or type-checking anything that depends on it. `npm run build:packages`
builds every workspace in dependency order.

Before calling a change done:

```bash
npm run verify
```

It runs lint, clone detection, structure checks, type-check, the docs examples
check, the bundle size check, tests with coverage, the bench's tests and the build.
Jest transpiles under `isolatedModules`, so `npm test` alone type-checks nothing.

The documentation site:

```bash
cd website
npm start
```

The benchmark: `npm run bench`, see [`packages/bench`](packages/bench/).
