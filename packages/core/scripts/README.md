# `packages/core/scripts`

Two scripts, both wired into commands that actually run.

| script | command | when |
|---|---|---|
| `check-structure.mjs` | `npm run check-structure` | inside the root `npm run verify`, as `npm --workspaces --if-present run check-structure` |
| `mark-type-only-exports.mjs` | last step of `npm run build` | every build |

## What `check-structure.mjs` checks

The mechanical half of the file rules: one file, one named export, named after it.
It reads every `.ts` under `src/` except `src/index.ts` (the barrel) and anything
under a `tests/` directory (the style rules do not apply to tests):

- one file, one named export;
- the filename is exactly the exported name;
- `class` → `OIM`, `interface` → `IOIM`, `type` → `TOIM`, `enum` → `EOIM`;
- the file sits under `src/engine`, `src/facade` or `src/factories`, which is
  all `src/` is allowed to hold.

Which domain a file belongs to is a judgement about meaning, so no check reads it.
