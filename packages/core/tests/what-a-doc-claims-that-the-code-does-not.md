# What this guard pins, and what it leaves alone

The same claims live on three hand-synced surfaces — `llms.txt`, `packages/core/README.md`
and `website/docs/**` — plus two files derived from the first. Nothing checked any of
them against the source, so a removed export stayed documented and a copy stayed stale
with no signal. `what-a-doc-claims-that-the-code-does-not.test.ts` is that signal.

## What it checks

1. **No surface names a symbol the workspace does not have.** Every `OIM…`, `IOIM…`,
   `TOIM…`, `EOIM…`, `createOIM…` and `oim…` identifier inside an inline code span —
   and every one inside a fenced code block — must be an exported name of some
   package's `src/index.ts`, or the basename of a file under some package's `src/`,
   or carry an entry in `documentedAsGone`.
2. **The allow-list cannot rot in either direction.** An entry whose symbol comes back
   fails; an entry no surface names any more fails. So the list shrinks by itself.
3. **A stated export count is the real one.** Any `**N names` statement must equal the
   number of names `packages/core/src/index.ts` exports, and at least two such
   statements must exist — deleting the line is not a way to pass.
4. **`website/static/llms.txt` is `llms.txt`.** Line-for-line, with the first
   difference named.
5. **`llms-full.txt` still carries the `llms.txt` it was generated from.** Located by
   the master's first line, then compared line-for-line.

After editing `llms.txt`, 4 and 5 go red until `cp llms.txt website/static/llms.txt`
and `node scripts/build-llms-full.mjs` have run. That is the point of them.

## Why `core-legacy` and `bench` are excluded from the known set

`packages/core-legacy/src` is a frozen record of an engine that is not here, and it
exports many of the names the current docs mark as gone. Counting it as "known" would
make every one of those mentions pass, which is the rot this guard exists to catch.
`packages/bench/src` names the same legacy symbols in recorded measurement prose and
is excluded for the same reason.

## What it deliberately does not check

- **Signatures, options fields, defaults and behaviour.** Those are the other three
  rot classes and no regex settles them; they are verified by reading. This test
  catches the one class a machine can decide.
- **Method and field names after a dot.** `OIMDefaults.COLUMN_OWNER` is checked as
  `OIMDefaults`; the accessor is not.
- **Prose outside backticks.** A symbol written without code formatting is invisible
  here, as it should be — the surfaces format every symbol they mean.
- **`packages/bench/src` prose.** It carries recorded measurements and is not a doc
  surface; a mention of a deleted symbol there is part of the record.

## The allow-list

`documentedAsGone` maps a symbol to the reason a surface may still name it although the
workspace has no such export. The test fails when an entry is not needed: the symbol exists
again, or no surface names it. The two entries today are `OIMCollection`, named only in
readings taken against a surface the core does not have, and `OIMDB_UPDATE`, the string
*value* of `EOIMReduxReducerActionType.UPDATE` rather than an exported name.
