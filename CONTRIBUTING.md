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

A push releases: CI publishes every package whose version is not on npm yet. So the
`pre-commit` and `pre-push` hooks refuse a change to what a package ships (`src/`,
`README.md`, `CHANGELOG.md`, `bin/`, `ui/`, or `package.json` beyond its version) while
that package's version is already on npm. Bump the version and add the CHANGELOG line.
They also refuse an `@oimdb/*` peer range that is not a concrete semver range or does not
cover that package's version in the repo, and an `@oimdb/*` package listed under
`dependencies` instead of `peerDependencies`, so one copy of the core is installed.
`npm run check:version-bumped` runs the same checks by hand.

The documentation site:

```bash
cd website
npm start
```

The benchmark: `npm run bench`, see [`packages/bench`](packages/bench/).
