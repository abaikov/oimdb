// THE MEMORY PASS: `worker.ts`'s fourth mode — build, collect, read `heapUsed`, load
// the population, collect, read again. A mode and not a scenario, because a heap
// figure has no digest, no `check()` and no reference answer, and must NOT go through
// a min-of-samples estimator: the smallest of several heaps is the luckiest
// collection, not the smallest store. Why it signs a standing record anyway, and what
// it cannot have, are in `README.md#memorypass`.
import { assertAnswersSaySomething, met, notMet } from './standard';
import type { TItemStanding, TStandardItems } from './standard';

// What stands in the worker's scenario slot when there is no scenario: passing a
// scenario key would say the figure belongs to that row of the report.
export const NO_SCENARIO = '-';

// The thirteen declarable items, answered for the memory pass. MOST ARE NOT MET, and
// that is the record rather than a defect in it — the items were written for a TIMING
// and this pass starts no clock.
export const MEMORY_PASS_STANDING: TStandardItems = {
    A1: notMet(
        'this pass times nothing, so the item\'s subject is absent rather than satisfied. What stands ' +
            'where a clock would be is a check: after the load, `worker.ts` requires exactly one distinct ' +
            'render from each of the two consumers and a full window in view A, reads them BEFORE the ' +
            'binding is given back, and reports `failed` rather than a figure when either is wrong — so a ' +
            'store that quietly held nothing cannot post the smallest number in the table. That refuses an ' +
            'empty store; it does not put a consumer at the end of a timed operation, because there is no ' +
            'timed operation for it to end. `undrivenRowsOf`, which asks this per row of a stored piece, ' +
            'has no counters to read on a weighed row.'
    ),
    A2: notMet(
        'no delivery counter travels with the figure. The `weighed` arm of `TWorkerResult` carries ' +
            '`baseline` and `held` and nothing else; the consumers\' `deliveries`, `distinct` and ' +
            '`redundant` exist in the worker, are read once for the load check, and die with the process. ' +
            'So `firstFoldedRedundancy` — the arithmetic that holds the SUITE to A2 on every timing row, ' +
            '`deliveries === distinct + redundant` — has nothing to run over here. A store that woke its ' +
            'two views fifty times to reach the state one wake would have reached weighs exactly the same ' +
            'in this table, and nothing in the piece could show it.'
    ),
    A3: notMet(
        '`BenchOracle` is never constructed in this mode, and could not answer if it were: the reference ' +
            'model is a plain-Map derivation whose product is the RENDERED STATES, and it holds no opinion ' +
            'about how many bytes a store should occupy. There is no independent model of a heap here and ' +
            'no second implementation to disagree with the first. The stored state is checked for ' +
            'EXISTENCE — one distinct render per view, a full window in A — and not walked row by row ' +
            'against a model, because the mode runs no script for a model to replay.'
    ),
    A4: notMet(
        'the item pairs two things and this pass produces only one of them. A4 is met elsewhere BY ' +
            'CONSTRUCTION — `worker.ts` emits `status: "ok"` only downstream of `proveThisPass`, so a ' +
            'timing process cannot publish a number it did not also verify — and this mode reaches its ' +
            '`weighed` emit by another path entirely. The half that exists is in the right place: the load ' +
            'check runs in the same process, on the same binding, between the two heap readings, and the ' +
            'binding is disposed only after the second one, so nothing it holds can have been collected ' +
            'before it was weighed. But there is no timing to be separate from, and a MET would be ' +
            'claiming a property of a number this pass does not produce.'
    ),
    B1: met(
        'an adapter weighed under a wiring or a population other than the one every other row gets, or ' +
            'this table falling to a single row. The mode calls `adapter.bind`, `binding.write(loadRows)` ' +
            'and `binding.settle()` and nothing else, so a per-adapter shortcut in any of the three would ' +
            'make this column two different jobs; and a comparison needs two sides, which is the same ' +
            'condition `assertAgreesWithTheCode` throws on for a script — here it is derived rather than ' +
            'thrown, because how many rows this table has is a fact about the piece and B5 reports it. ' +
            'The asymmetry that does exist prints under the table: the id → signal map preact-signals ' +
            'and alien-signals keep, and jotai\'s ids atom, named there as bookkeeping the library does ' +
            'not do for itself.'
    ),
    B2: met(
        'either anchor ceasing to be weighed here. B2\'s subject in this report is the ANCHOR PAIR — ' +
            '`baseline-array`, which keeps no group index, and `baseline-array-indexed`, which keeps one ' +
            'and differs in nothing else — and this pass weighs BOTH as full rows, under the same `bind` ' +
            'and the same population as every library beside them, which is the strongest position any ' +
            'table in this report holds on B2: the write and read tables have both anchors, the churn, ' +
            'relation and single tables have one. So the bytes a group index costs are readable directly ' +
            'off two rows of this table. What is NOT claimed here is that anything is DIVIDED by them — ' +
            'that is B4, and it is NOT MET.'
    ),
    B3: met(
        'an adapter whose `bind` held values its library does not hold, with nothing under this table ' +
            'naming it. This is the column where that departure is least escapable and most invisible: ' +
            'bookkeeping a library forces on its user costs no milliseconds in a table that pays for it ' +
            'and costs bytes here. A row whose `admission` line stopped describing where its values live ' +
            'would put those bytes in the column with no way for a reader to attribute them.'
    ),
    B4: notMet(
        'no floor takes the consumer\'s share of this figure, and `floorKeyFor` has nothing to hand a ' +
            'table that is not a scenario — which is the same condition it throws on for a script ' +
            'declaring B4 MET. The consumers themselves are outside the delta: `makeConsumers` and ' +
            '`makeGroupConsumers` run at module scope, before this mode\'s first collection, so the ' +
            'preallocated line buffers — the two-view set and the fifty-view set alike — are in every ' +
            'adapter\'s baseline and in no adapter\'s delta, and the worker says so. What is NOT outside ' +
            'it is the load\'s own render: `BenchConsumer.row` builds a formatted string per visible row ' +
            'and stores it in the buffer, so one window of freshly allocated lines per view is still ' +
            'reachable when the second reading is taken and is inside `held` for every row. Every adapter ' +
            'renders the same window of the same text — that is what the digest comparison establishes in ' +
            'the verify pass, which this mode does not run — so it is a constant of the column rather than ' +
            'a difference between rows. Nothing measures it, and there is nothing to subtract it from.'
    ),
    C1: met(
        'the memory piece printing its conditions line only when something was wrong, or judging "busy" ' +
            'against the gate it was permitted rather than against the default one. Like every other ' +
            'piece it goes through `run.load.refusal()` before a single worker is spawned, stores ' +
            '`load.summary()` in the piece it writes, and prints through `busyForTheDefaultGate`. This is ' +
            'MET only in the sense C1 is met anywhere in this report — that the conditions were RECORDED ' +
            '— and it inherits the first two entries of `STANDARD_GAPS` whole, since the gate cannot ' +
            'police its own threshold for a memory worker either.'
    ),
    C2: notMet(
        'every row of this column is ONE reading from ONE process, and a single observation is not an ' +
            'estimator. The rule is uniform and the table states it, so the column does not MIX — and ' +
            '`firstEstimatorMismatch`, which holds a timing column to one stored plan, has no plan and no ' +
            'per-row `repeat` or `samples` to read here. "The minimum of `samples` runs, and the minimum ' +
            'over `processes`", which is the estimator every other column in this report is read under, is ' +
            'not in force and must not be: the smallest of several heaps is the luckiest collection rather ' +
            'than the smallest store. The item has no answer for a column that estimates nothing, and a ' +
            'MET would import a sentence a reader would then apply to these numbers.'
    ),
    C3: notMet(
        'nothing measures the variation. One process and one reading per row, so there is no spread and no ' +
            'drift beside these numbers. What prints instead is a BOUND and not a dispersion: V8 compiles each ' +
            'library\'s write path between the two readings and compiled code counts in `heapUsed`, so the ' +
            'table says two rows that close together have not been told apart. A second process would ' +
            'produce a different figure and this table would not know by how much.'
    ),
    C4: met(
        'two adapters weighed inside one process. C4 is taken on trust everywhere in this report and ' +
            'enforced upstream — a worker is spawned with ONE adapter name — and here that spawn is ' +
            'visible in the loop itself: every row is its own ' +
            '`runWorker(name, NO_SCENARIO, "memory", …)`, and therefore a fresh V8 with exactly one ' +
            'library\'s write path compiled in it. Folding that loop into a single process would both ' +
            'teach one call site two shapes and weigh a heap that already holds somebody else\'s store.'
    ),
    C5: notMet(
        'no control is weighed beside these rows. C5 is answered for a script by asking whether every ' +
            'arm of `CONTROLS` supplies its wiring; the controls are bodies over a store driven by a ' +
            'SCRIPT, and this pass runs none, so there is no wiring for them to supply and the question ' +
            'has no form here. What the table prints in place of an attestation is an argument — compiled ' +
            'code counts in `heapUsed`, so two rows that close together have not been told apart — and an ' +
            'argument is a bound on the instrument, not a reading of it. The missing instrument exists one ' +
            'directory away: `retained/retainedControls.ts` weighs a KNOWN number of references at two ' +
            'sizes and voids its report unless both land on the same platform constant, and ' +
            '`control-noise.identical-populations` is its byte floor. It cannot be lifted across ' +
            'unaltered. `npm run retained` compares two bodies in ONE process, built to be as alike as ' +
            'they can be made, which is what lets an absolute reading\'s error cancel between them; a row ' +
            'per library, each in a process of its own, has no such premise, and a byte floor measured ' +
            'between two IDENTICAL populations is not a floor between two different ones. Nothing in this ' +
            'pass has been attested at the scale of a `held` figure.'
    ),
};

// B5, DERIVED FROM WHAT WAS WEIGHED and not from what may decline: `bind` carries no
// `absent`, so a missing row is a worker that produced no figure. It also carries B1's
// arithmetic, which cannot be known at load time here.
export const memoryCoverageStandingOf = (
    asked: number,
    weighed: number,
    unweighed: readonly string[]
): TItemStanding => {
    if (weighed === 0) {
        return notMet(
            `nothing was weighed: ${asked} libraries were asked and none produced a figure. A table ` +
                'with no rows covers no field, and B1 above has no second side to be about.'
        );
    }
    if (weighed === 1) {
        return notMet(
            `1 library of ${asked} produced a figure. A table of one row covers almost none of the ` +
                'field, and — the part that matters more — B1 above says MET, which is a statement ' +
                'about a comparison, and a comparison needs two sides. Read that MET as void while ' +
                'this stands: it is the condition `assertAgreesWithTheCode` throws on for a script.'
        );
    }
    if (weighed === asked) {
        return met(
            'a worker that failed to weigh a library, which would drop this table below the field ' +
                'without a word of this record changing — the count is derived from what the piece ' +
                'holds and from `ADAPTERS`, and is written down in neither.'
        );
    }
    return notMet(
        `${weighed} of ${asked} libraries have a row in this table. Missing: ` +
            `${unweighed.join(', ')} — not a decline, since \`bind\` carries no \`absent\` and no library ` +
            'can refuse this pass; each is a worker that produced no figure, and its reason is printed ' +
            'as UNWEIGHED above the table.'
    );
};

// C6, TWO QUESTIONS IN ORDER, the blunt one first. Deliberately STRICTER than
// `c6StandingOf` in `standard.ts`; the divergence is named in `README.md#memorypass`.
export const memoryArtifactStandingOf = (
    hasPiece: boolean,
    absence: string,
    recordedTimingArtifacts: readonly string[]
): TItemStanding => {
    if (recordedTimingArtifacts.length === 0) {
        return notMet(
            'no directory under `measurements/` was written by this harness, so no number in this ' +
                'table is a published figure however clean its piece — the same sentence the C6 ARTIFACT ' +
                'banner prints above every timing table. The memory piece lives in `results/`, which is ' +
                'an intermediate a run is reassembled from and is overwritten by the next run of the ' +
                `same point; it is not a citation. ${hasPiece ? 'A usable piece exists' : `And ${absence}`}.`
        );
    }
    return hasPiece
        ? met(
              'a piece whose stored record no longer matches the point, the sources or the machine it ' +
                  'is read at — it is then named stale and not printed, and this item goes over with it.'
          )
        : notMet(
              `no usable memory piece — ${absence}. Any figure quoted for what a store holds would name ` +
                  'no artifact that can be re-derived or refuted.'
          );
};

// Checked at module load in every process that knows the pass exists.
assertAnswersSaySomething('the memory pass', MEMORY_PASS_STANDING);
