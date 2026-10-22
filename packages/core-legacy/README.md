# @oimdb/core-legacy

**The key-addressed engine. Kept only so the current one can be measured against it.**

This is `@oimdb/core@3.12.1` — the key-addressed implementation, the counterpart of
the identity-addressed `@oimdb/core@4.0.0`. It exists for one reason:

> `packages/bench` runs both engines through the same scripts, against the same
> dataset, ending at the same consumer, and checks that they agree on the same
> digest. That comparison needs the key-addressed engine to exist as code, not as a
> commit hash.

## Rules

- **Not published.** `private: true`. Nothing is published from here.
- **Built for the benchmark only.** `npm run build --workspace @oimdb/core-legacy`
  (tsup, no keepNames) emits `dist/index.js`, which
  `packages/bench/src/adapters/oimdb-legacy.ts` imports, so the legacy rows
  carry no tsx `__name` wrappers. Rebuild before a bench run.
- **Not to be imported by anything except `packages/bench`.** It is a fossil kept
  for a measurement, not a supported package, and it will not be maintained,
  fixed, or kept in step with `@oimdb/core`.
- **Not a dependency of any other workspace package** for the benchmark's sake.

## If you are looking for the library

Use [`packages/core`](../core/README.md). It is not a drop-in replacement for this
code: the model differs, not just the names. The docs site describes it.
