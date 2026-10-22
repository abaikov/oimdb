# Participants

Every row of the comparison is declared by its adapter in `src/adapters/`, in the order
`src/harness/registry.ts` `ADAPTERS` presents it. Each declares `name`, `version`,
`docs`, `admission` (where the values live and what emits the change signal) and
`departure` (what it does that the cited documentation does not describe), and every
wiring as a builder or a written reason there is none.

| you want | where |
|---|---|
| the strings themselves, as the code holds them now | the adapter file, or the docs site page **Benchmarks → Participants**, rendered from them by `npm run bench -- publish` |
| whether the adapter uses its library the way the library intends | the audit card `audit/participants/<name>.md` |
| why a row came out where it did | [WHY-EACH-ROW.md](WHY-EACH-ROW.md) |