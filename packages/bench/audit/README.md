# `audit/` — is each participant written the way its library wants, and is each scenario worth timing

A benchmark table answers "who is faster" only if two other questions were
answered first, and the timing harness cannot answer either of them:

1. **Is every participant composed optimally?** An adapter that uses a library
   against the grain of its documentation measures the adapter, not the library.
   One that does the library's job by hand measures the harness.
2. **Is every scenario representative?** A script that no application performs,
   or one shaped so that a single design always wins, is a chosen result.

Each question gets one card per subject, here, as markdown with a frontmatter
header that `npm run audit` parses and the docs site renders.

| directory | one card per | file name |
|---|---|---|
| `participants/` | row of `src/harness/registry.ts` `ADAPTERS` | `<participant name>.md` |
| `scenarios/` | entry of `src/harness/scenarios.ts` `SCENARIOS` | `<scenario key>.md` |

## A card is tied to the code it was written against

Every card carries a `digest`. `npm run audit -- digests` prints the digest the
code has now; a card whose digest differs is **stale** and is shown as stale on
the docs site until somebody re-reads the code and stamps it.

| subject | what the digest covers |
|---|---|
| participant | the adapter's own source file and the exact version of every library it bundles |
| scenario | its key, label, description, step count, wiring flags, and the source of `prepare`, `restore`, `run`, `check` and `oracle` |

A scenario's digest does not cover the helpers its functions call. A change to a
shared helper in `scenarios.ts` or `dataset.ts` leaves the card current; the
person changing a helper re-reads the cards of the scenarios that call it.

A new card is written with `digest: unstamped`. **Stamping is the act of saying
"this card was read against this code and it holds"**. A stamp means every claim was
re-read against the code and the installed libraries, and every `file:line` the card
cites into the repository was checked to exist. A card stamped on less says so in its
own body.

```bash
npm run audit --workspace @oimdb/bench -- status          # current / stale / unstamped / missing
npm run audit --workspace @oimdb/bench -- stamp mobx      # after reading mobx.md against adapters/mobx.ts
npm run audit --workspace @oimdb/bench -- publish         # website/src/data/bench/audit.json
```

## Participant card

```markdown
---
participant: mobx                 # the registry name
version: 6.16.1                   # must equal the adapter's `version`
auditedAt: 2026-10-16
auditedBy: "<model or person>"    # who read it
digest: unstamped
verdict: idiomatic                # idiomatic | improvable | handicapped | advantaged
summary: One sentence a reader of the results table needs before reading this row.
wirings:
  bind:          { verdict: idiomatic, note: "…" }
  bindPerGroup:  { verdict: idiomatic, note: "…" }
  churn.row:     { verdict: improvable, note: "…" }
  churn.wide:    { verdict: idiomatic, note: "…" }
  churn.column:  { verdict: declined, note: "…" }
  churn.chain:   { verdict: idiomatic, note: "…" }
  reads.byKey:   { verdict: idiomatic, note: "…" }
  reads.byWindow:  { verdict: idiomatic, note: "…" }
  reads.byTwoAxes: { verdict: idiomatic, note: "…" }
  relations:     { verdict: idiomatic, note: "…" }
  single:        { verdict: idiomatic, note: "…" }
improvements:
  - A concrete change, with the file and line it applies to, and which rows it would move.
---

Free prose: how the library's own documentation says to do each thing, how the
adapter does it, and every place they differ — each claim with a `file:line` in
the adapter or under `node_modules/`.
```

| verdict | meaning |
|---|---|
| `idiomatic` | the way the library's documentation recommends, on its fast path |
| `improvable` | correct, but a documented, faster way exists and is not used |
| `handicapped` | the adapter makes the library do work an ordinary user of it would not |
| `advantaged` | the adapter does part of the library's job, or skips work the script asks for |

## Scenario card

```markdown
---
scenario: patchColumn
auditedAt: 2026-10-16
auditedBy: "<model or person>"
digest: unstamped
verdict: representative           # representative | narrow | synthetic | misleading
models: The user action or application event this script stands for.
measures: The property of a store that decides this row.
favours:
  - Which design wins this by construction, and why.
biases:
  - Anything in the script that tilts the row, and in whose favour.
summary: One sentence a reader of the results table needs before reading this row.
---

Free prose, with `file:line` evidence in `src/harness/scenarios.ts` and `dataset.ts`.
```

| verdict | meaning |
|---|---|
| `representative` | an application does this, at roughly this size, often enough to matter |
| `narrow` | real, but one corner of a larger behaviour; read beside its siblings |
| `synthetic` | an instrument (a floor, a control, an isolation of one cost), not a workload |
| `misleading` | as written, it rewards something an application would not want; fix or drop |
