# Testing

The rules every test in this repository is held to.

They exist for one reason: a suite is read far more often than it is written, and
the thing a reader needs first is *which file answers my question*. A name that
is a subject area — `collection`, `frame`, `graph` — cannot answer that, because
a subject area has no boundary. Every rule below follows from giving each file a
boundary you can see from its name.

---

## 1. Where tests live, and what the extension means

Tests live in `packages/<package>/tests/`. Each package owns a
`jest.config.cjs` with the right environment and matcher; the root config only
delegates to them.

**Why the root config delegates rather than restating a generic one.** A single
root `testMatch` limited to `.ts` files silently skipped every JSX suite, so
`npm test` reported green while `react` — and the JSX suites of `redux-adapter`
and `persist-integration-tests` — never ran at all.

**Why the root config caps workers.** jest's default of (cores − 1) is enough to
take the whole machine down, so the root sets `maxWorkers: '50%'` and
`workerIdleMemoryLimit: '300MB'`. **A limit above anything a worker reaches never
recycles one**, which is the whole reason the number below is the number it is.
Under `--maxWorkers=2 --logHeapUsage` over all 274 suites a worker's
heap climbs from 43 MB to **500 MB** and never shrinks, so the footprint is
workers × 500 MB and four workers is 2 GB. The limit decides where that climb is
cut, and cutting it costs wall clock because a restarted worker re-transpiles
everything it had:

| limit | median heap | peak heap | wall clock |
|---|---|---|---|
| 512 MB (never fired) | 358 MB | 500 MB | 27 s |
| 400 MB | 294 MB | 393 MB | 35 s |
| **300 MB** | **206 MB** | **322 MB** | **31 s** |
| 150 MB | 66 MB | 284 MB | 135 s |

300 MB is the knee: 36% off the peak for 14% more time, where 150 MB buys almost
nothing further and costs 5×. All four columns were green at 274/274 suites.

**No suite leaves 500 MB behind, and this table does not say one does.** That
reading was chased and the climb is not ours. Three facts, each from the
installed source:

1. **The numbers are un-collected heap.** `--logHeapUsage` reports
   `process.memoryUsage().heapUsed` after `globalThis.gc?.()`
   (`node_modules/jest-runner/build/runTest.js:415-418`), and `globalThis.gc`
   exists only under `--expose-gc` — which nothing in this repository sets, and
   which workers cannot acquire on their own because they inherit the parent's
   `execArgv`
   (`node_modules/jest-worker/build/workers/ChildProcessWorker.js:138`). jest
   says so itself where it needs the function:
   *"Cannot find `global.gc` function. Please run node with `--expose-gc`"*
   (`node_modules/@jest/core/build/collectHandles.js:134-142`). The idle limit
   reads the same un-collected number
   (`node_modules/jest-worker/build/workers/processChild.js:94`). So "never
   shrinks" is the shape of a V8 old space under no pressure, not evidence of
   retention.
2. **Nothing of ours can survive a suite.** Each test file gets its own
   `TestEnvironment` and `Runtime`, both torn down when it ends
   (`node_modules/jest-runner/build/runTest.js:236,265,285-286`), and
   `teardown()` clears every module registry
   (`node_modules/jest-runtime/build/index.js:1248-1272`). Module-level state in
   `src` is therefore per-suite by construction; what bounds it *within* a suite
   is pinned by
   `packages/core/tests/what-a-module-keeps-between-calls.test.ts`.
3. **What does accumulate for a worker's whole life is jest's own transform
   cache.** `const projectCaches = new Map()`
   (`node_modules/@jest/transform/build/ScriptTransformer.js:154`) keys a
   `transformedFiles` map per project and never evicts from it
   (written at `:713` and `:736`), holding the compiled JS and inline source map
   of every file that worker has transformed; ts-jest keeps its compiler and
   dependency graphs beside it in a static
   (`node_modules/ts-jest/dist/legacy/ts-jest-transformer.js:32,36`). `core`
   alone is 336 source files and 1.6 MB of TypeScript, so a worker that takes
   more suites holds strictly more — which is also why a recycled worker costs
   wall clock in the table above: it re-transpiles everything it had.

The limit is therefore the right instrument and not a stopgap: it caps a cache
that lives outside this repository and has no cap of its own.

What used to balloon was ts-jest's
type-checking: every project maps `@oimdb/core` to `../core/src`, so each worker
built a TypeScript program over the whole core tree and the react suite alone
peaked at 233 MB of heap. Every project now transpiles under `isolatedModules`
(the `transform` in each package's `jest.config.cjs`), which took that same suite
to 118 MB. **The two limits are the safety net, not the fix** — and the same
`isolatedModules` is why nothing in a jest run type-checks, which is what
`npm --workspaces --if-present run type-check` is for. The gate that runs both,
in order, is `npm run verify` — lint, type-check, test, build. Reaching for
`npm test` alone is how a tree with two dozen type errors passed as green.

| extension | run by | passes when |
|---|---|---|
| `.test.ts` | jest | its assertions hold at run time |
| `.test.tsx` | jest, in `jsdom` | same, for suites that render JSX |
| `.type-test.ts` | `npm run type-check` — **not jest** | the file type-checks |

A `.type-test.ts` contains **no `it()` at all**. Its assertions are
`@ts-expect-error` directives: each one marks a line the compiler is required to
refuse, and the file fails by compiling clean. jest never sees it — `testMatch`
is `**/*.test.ts`, which `.type-test.ts` does not match — and it is reached
instead by `tsconfig.all.json`, which puts `src/**/*`, `tests/**/*` and
`scripts/**/*.ts` into one program that CI checks before the suites run.

Shared fixtures go in `tests/support/` (`assertConsistent.ts`,
`orderedListConsumer.ts`). They are not tests and are not named like tests.

**Which file answers my question** is not answered by this document, and cannot
be: these are the rules, not the contents. A test file is named with the claim it
asserts, so the directory listing is the index, and a hand-written one beside it
only rots.

**The censuses ship.** They sit flat in `packages/core/tests/` with everything
else: a rule with an enforcement nobody else can run is a rule kept by whoever
happens to remember it.

**The comment ceiling is not measured.** A source file carries at most 20%
comment lines, and that is kept by whoever is reading it; no census counts it.

**Out of scope.** `packages/core-legacy/` is frozen: it tests an engine that no
longer exists and does not compile against the current core. None of these rules
apply to it, and nothing in it is to be renamed or moved.

### What CI runs, and on which branches

`.github/workflows/ci.yml` fires on **every** branch, not just the default one.
A `branches: [master, main]` filter means the type-check job — the only thing
that type-checks a test file — does not run on a work branch at all, so type
errors accumulate there behind a green local `npm test`. A gate that fires only
after the merge is a gate that reports history.

*What was there:* `branches: [master, main]`, with `main` listed so that renaming
the default branch would not silently stop CI. An unfiltered `push` answers that
outright — a renamed default is just another branch — so the filter and its
reason went together.

**There is no `pull_request` trigger, and that is the second half of the same
decision.** With `push` unfiltered, a PR branch would fire both events on every
commit — two runs of the same jobs on the same commit. Trying to collapse them
with one concurrency group made it worse rather than cheaper: `head_ref` is set
only on a pull_request and `ref_name` on a push is the same branch, so
`${{ github.head_ref || github.ref_name }}` names ONE group for both, and
`cancel-in-progress` then has the pair killing each other — a race whose loser
may be the check a merge is waiting on. Dropping `pull_request` leaves one run
per commit and a group of `${{ github.ref_name }}` that means what it says.

*What this costs:* a pull request from a FORK never fires `push` in this
repository, so it would get no CI at all. Nothing here is published and there
are no outside contributors, so that case does not arise today; it is the
condition under which the trigger comes back.

---

## 2. What a test file is named

**A test file is named with a sentence about the engine, never with a label.**

The sentence takes one of two forms, and which one is not a matter of taste:

- **A question** — when the file's job is to *establish an answer* that is
  legitimately allowed to be several things, and the cases are that answer's
  parts.
  `what-a-detach-takes-off-a-shared-identity.test.ts`,
  `where-a-reference-is-taken-and-given-back.test.ts`,
  `who-may-say-a-bucket-is-in-order.test.ts`.

- **A statement** — when the file's job is to *defend one proposition* that must
  never stop being true, and the cases are attempts to break it.
  `a-chain-is-a-key-once.test.ts`,
  `two-lists-and-never-a-third.test.ts`,
  `everyone-out-at-once-and-not-one-at-a-time.test.ts`.

### The test that decides, without asking anyone

**Can the engine make this filename a lie?**

A statement can be falsified — and that is the point of choosing one. You write
a statement when you *want* the name itself to become false the day the rule
breaks, because the name **is** the rule. `a-chain-is-a-key-once` is not a topic;
it is the claim under test, and if a chain ever becomes a key twice the filename
is the first thing that is wrong.

A question cannot be falsified; only its answer moves. You write a question when
the answer is allowed to evolve — `what-a-frame-promises` stays true whatever
the frame comes to promise, and the cases below it are free to change with it.

There is a corollary worth keeping: if you write a statement and then find
yourself adding cases that are not all about that one statement, the name was
wrong. It was a question, and the file has been collecting an answer.

### What is banned, and why

A bare noun or topic label — `collection`, `frame`, `graph`, `bulk`,
`positions`, `subscription`, `identity`. No file here carries one. A label names
an *area*, and an area has no edge, so nothing about the name tells you whether
the case in your hand belongs in it.

The cost is not hypothetical. While a file named for the bare noun `frame` and
`what-a-frame-promises.test.ts` both existed, they drifted into asserting the
same promises in different words — a write refused during a flush, a re-entrant
`flush()` named, handlers that flush each other ending in an error rather than a
hang — because neither name could refuse a case the other had already taken.
Naming a file for the sentence it settles is what makes that question answerable.

A symbol name is a label too. A file named after the export under test — the
class, the binding, the helper bag — names that export rather than the claim
being made, and a file named for an export grows to hold everything that export
can do. Three files here carried such a name and all three were renamed; none
survives to be cited, which is the point.

Write the name in words a reader of the library would use, not in the names of
the classes it happens to construct.

---

## 3. What a `describe` and an `it` are named

**The file name, the `describe` and the `it` read as one sentence, in that
order.** This is not a stylistic preference — it is what makes a jest failure
line legible on its own.

The `describe` restates the file's sentence as prose. The `it` is a **predicate
that completes it**: it opens with a third-person verb and says what the engine
*does*. The `it` never restates the subject.

```
what-a-build-that-throws-after-keeping-a-source-leaves-behind.test.ts
└── describe('what a build that throws after keeping a source leaves behind')
    └── it('leaves no hold on the source it kept')
```

reads as: *what a build that throws after keeping a source leaves behind —
leaves no hold on the source it kept.*

Where a file has several `describe`s, each names a **sub-claim** under the file's
subject, and the file name is what they have in common:

```
what-a-write-wakes.test.ts
├── describe('a write wakes the effects of the slot it touched, once')
│   └── it('runs the body on the flush and not on the write')
└── describe('a removed slot is let go of by the last thing that referred to it')
```

A statement-named file may put the **question** in the `describe` and let the
file name be the answer:

```
two-lists-and-never-a-third.test.ts
└── describe('how many arrays a frame of effects costs')
    └── it('runs 50 frames of 64 effects out of exactly one array')
```

---

## 4. The categories a test belongs to

Four. A file's category is its **primary method** — the one its name has to
announce. A behaviour file may close with a single seeded property case without
becoming an oracle (`what-the-ordered-list-diff-emits.test.ts` does, in
"reproduces the target exactly and never exceeds the optimal move count, over
500 seeded rounds"); a file is named an ORACLE when the replay *is* the method,
not a coda to it.

The distinction is what tells a reader how to read a failure. A red BEHAVIOUR or
ORACLE file means the engine is broken. A red CENSUS means a pinned list or count
moved and somebody has to decide whether the edit was meant and then restate the
pin — nothing ran, and the engine may be perfectly well. The index carries, per
census, **what it pins and where the pinned value lives**, which is the only
thing a reader needs at that moment.

### BEHAVIOUR

The ordinary test. It drives the public API and asserts what came back. Most
files are this. `what-a-detach-takes-off-a-shared-identity.test.ts`.

Ninety of core's files, listed in the index under twelve subjects — the frame,
effects, derivations, identity, keys, the write path, what a bucket holds, order,
positional lists, the auto-index, errors, the consumer's boundary. The subject
headings are where a new file finds out whether its sentence is already owned.

### ORACLE

Replays the engine against a **reference model too simple to be wrong**, over
generated or seeded batches, comparing after every step.

It exists because an example-based test can only catch the mistakes its author
already had in mind. The model is written to have no bookkeeping that could be
wrong — a plain array and a `splice`, an object and an assignment — so any
divergence is the engine's.

Named `<subject>-against-<the reference>`, and the suffix is load-bearing:

- `positional-against-a-naive-model.test.ts`
- `standalone-record-against-a-naive-model.test.ts`
- `the-move-count-against-a-brute-force-optimum.test.ts`

An oracle's seeds are fixed, so a failure is reproducible; the seed goes in the
case name (`(seed ${seed})`).

There are nine in core. The index names, for each, the model it is checked
against — which is the half of an oracle a reader cannot get from the filename.

### CENSUS

Asserts a property of **the source itself**, by reading `src/` off disk.

It exists where a rule has no runtime symptom — a rule about who is *allowed* to
do something cannot be broken by any input, only by an edit. `slot.linkCount`
lost a decrement at four separate call sites; no runtime test can see the fifth
one being added, but a census that pins the list of files permitted to write the
field can. (`linkCount` itself is not in `packages/core/src` any more — it went
with the per-index cell. It is kept here as the
incident this kind of test was written for; the census tests listed below are
live and pin live fields.)

- `who-may-say-a-bucket-is-in-order.test.ts` — one service writes the order
  verdict, and the census names every site.
- `where-a-reference-is-taken-and-given-back.test.ts` — every file that takes a
  reference or gives one back, pinned by shape.

Those are two of ten, and the other eight are the ones that surprise people.
The index lists all of them, and for each **what it pins and where the pinned
value lives** — an inline table with its line number, or a ledger beside it.
That column is what a reader needs the moment a census goes red, and it is the
reason the index exists rather than a longer list here.

**Every pin needs a home a reader can find without grepping.** Most live inline,
in a `PINNED`-shaped constant near the top of the file; one lives in a ledger
next to it. Either is fine; implicit is not.

**A census reads `src/`, never `tests/`.** That is a rule, not an accident: it is
what keeps a test file free to be renamed. If a census ever needs to know a test
filename, it holds it as data in a checked-in ledger next to it, and renaming
that test means editing the ledger in the same change.

One census reads `dist/` instead. That is a stated exception and not a loophole:
the defects it pins are in the build and are not in `src/` at all, and the file
argues it in its own header. A census reading anything but `src/` owes the same
argument in the same place.

A census may print a diagnostic on failure —
`a-write-through-a-local-is-still-a-write.test.ts` prints the pin list as the
tree stands, to paste back. Printing *instead of* asserting is a different thing
and is banned — see §7.

### TYPE

`.type-test.ts`. Asserts the **compiler** refuses something. No `it()`, no
assertions at run time; see §1.

Three in core, listed in the index with the refusal count of each — which is the
only measure a file with no cases has, and the number that must not quietly fall.

---

## 5. What one file covers

**A file owns one subject, and a subject has exactly one owner.**

The file's name *is* the subject. If a case does not belong under that sentence,
it belongs in another file — and if there is no file whose sentence covers it,
that is a new file, not a paragraph appended to the nearest one.

Two files may name the same subject in exactly one situation: **they differ in
method, and the name says which.**

- a behaviour file and its oracle —
  `what-a-consumer-that-diffs-its-own-bucket-gets.test.ts` and
  `ordered-commands-against-a-naive-model.test.ts` are the worked examples and
  the generated replay of one promise. Another such pair says so in the
  oracle's own header (`positional-against-a-naive-model.test.ts`):
  *"`what-each-positional-edit-does-to-a-list.test.ts` next door is a list of
  cases somebody already knew about. This is the other half."*
- a behaviour file and the same contract driven through a different arrangement —
  `what-a-frame-promises.test.ts` holds the frame's contract over bare slots,
  `what-a-frame-promises-through-a-real-collection.test.ts` re-asks it through
  the `OIMEntityCollection` + `OIMChannel` arrangement a consumer actually
  builds, so a promise that holds for `channel.write(slot)` but not for
  `rows.updateByKey(...)` fails somewhere.
- a runtime file and a census over the same rule.

Anything else is two owners for one subject, and it fails in a specific way: the
next case that arrives has no home, so it goes wherever its author looked first,
and the two files drift into asserting the same thing in different words.

### What admits a case into a "through a real X" file

**A second case asserting the same promise earns its place only if it reaches
that promise by a different path in the source.** The arrangement has to be *in*
the path, not in how the case got there.

This is the rule that keeps the second file of a pair from becoming the first one
with a fancier fixture, and it is the only rule that can: a file whose name says
"through a real collection" will otherwise take any case at all, because every
case in it does technically involve a collection.

Ask it as a question about lines, not about wording. *Which function does this
case reach that its twin does not?* A body that calls `channel.flush()` reaches
`OIMChannel.flush`'s `isRunning` guard by the same route whether the frame was
opened by `rows.updateByKey(...)` or by `channel.write(slot)` — the collection
changed how the frame was opened and nothing about what is being asserted, so
that case is a duplicate and it goes. A body that calls `rows.updateByKey(...)`
reaches `OIMSlotContentOwner.assertWritable` first, which is a second guard
in front of a write that would otherwise half-land — a different path, and the
case stays.

Two things bound it, and they are what stop the rule from being a licence to
delete:

- **A promise may not lose its last assertion.** Where the duplicate asserts
  something extra — a stronger message check, an extra count, an ordering — that
  assertion moves into the surviving twin in the same change. Delete only what is
  already asserted somewhere.
- **Some assertions cannot move.** A stored value, an owner, a bucket's slots: a
  bare-slot file has no room for them, so a case asserting one is not a duplicate
  however familiar its mechanism looks.

---

## 6. What a file's header comment is for

Headers here are long, and the long ones are among the best documentation in the
repository. Length is earned by carrying **what the code cannot say** — never by
restating it.

A header earns its length with these, and only these:

1. **What the mechanism is, and why it is easy to get wrong.** The thing a
   reader cannot reconstruct by reading the assertions.
2. **Why this method.** Especially for an oracle: *why* an example-based test
   was not enough here.
3. **What this file cannot catch.** The limits of its own assertion.
   `where-a-reference-is-taken-and-given-back.test.ts` lists what its census is
   blind to by construction — that it pins a shape and never a balance, so a
   leak of two increments against one decrement passes it.
4. **A deleted test leaves nothing in the source.** No header, comment or
   register says what a deleted case asserted; the reason for the deletion goes
   into the task that deletes it.

A header does **not** earn its length by restating the assertions below it, by
narrating how the file came to be written, or by praising the design.

---

## 7. What may not be in a test

- **No case without an assertion.** A case that runs code and asserts nothing
  passes for reasons unrelated to the engine. (The assertion may live in a
  shared helper the case calls — `assertConsistent`, an oracle's replay — but it
  must exist.)
- **No case that prints instead of asserting.** A diagnostic printed *on the way
  to failing* is fine; `console.log` standing where an `expect` should be is not.
- **No benchmark.** Timings live in `packages/bench`, under the rules in
  `BENCHMARKING.md`. A test may assert a **count** — allocations, wakes,
  comparisons, arrays — because a count is deterministic; it may never assert a
  duration.
- **No name that fails to say what breaks.** `it('works')`,
  `it('handles the edge case')` name nothing. The name must be the sentence that
  stops being true when the case fails.
- **No `.only`, and no case disabled without a reason.** `describe.only` and
  `it.only` do not reach the default branch. A `.skip`, `.todo` or `.failing`
  needs a header paragraph saying what it costs and why it is on the record
  rather than deleted.
- **No test of a private path that has a public door.** Drive the API a consumer
  drives; a census is how a rule with no public symptom gets asserted.

---

## 8. Deleting a test

Removing a case is a decision, and it is not made until the task that deletes it
states what measures the claim now, or that nothing does and why nothing needs
to, and what the case *bought*. The source keeps nothing of it: no note in
the header, no note in the file that took over the subject, no register.
