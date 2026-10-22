/**
 * WHERE EACH SCENARIO STANDS AGAINST THIS SUITE'S OWN PUBLISHED STANDARD —
 * signed in the scenario, checked against the code at load, counted by the report.
 *
 * WHY A TYPE AND NOT A PARAGRAPH.
 * `website/docs/performance/how-a-benchmark-earns-belief.md` states the
 * requirements and answers for the SUITE. Almost every item is actually a property
 * of a SCRIPT — whether a consumer was driven inside the clock, whether there is a
 * population left to audit, whether the resolution control was asked for this
 * wiring — and a page answering "MET" for the suite while one of its scripts
 * cannot meet the item is the marketing that page opens by refusing.
 *
 * NO COUNT IS WRITTEN HERE. A header carrying a number is a number nobody
 * recomputes. {@link standardCensus} derives it from `SCENARIOS` and `ADAPTERS`
 * every time the report runs, per item and per scenario.
 *
 * ─── THE THREE THINGS THAT MAKE A STANDING MORE THAN A WORD ────────────────
 *
 * 1. A SIGNATURE. A standing carries the scenario keys it was WRITTEN FOR
 *    ({@link signedFor}). Using one for a scenario it does not name throws, and so
 *    does naming a scenario that does not use it — the list and the set of
 *    scenarios holding that exact object have to agree. This is what stops a
 *    thirty-seventh scenario being given thirteen METs by writing
 *    `standing: ORDINARY_SCRIPT`.
 *
 * 2. A FALSIFIER ON EVERY MET. `met(wrongIf)` takes what would make the answer
 *    wrong — the standard's own framing on `website/docs/performance/index.md`:
 *    "the artifact exists, it names the machine, and it says what would have made
 *    it wrong." A blank one throws, and so do thirteen identical ones.
 *
 * 3. AGREEMENT WITH THE CODE, for the items where the code can answer. These are
 *    the checks that catch a STALE signature: one that was true when it was
 *    written and stopped being true when something else displaced.
 *
 * WHICH ITEMS THE CODE ANSWERS AND WHICH A READER TAKES ON TRUST is the
 * `checked by` column of the table in `BENCHMARKING.md` §3. Each check in this
 * file says at its own line what it can and cannot see; an item with no check
 * here has none in this module at all.
 *
 * WHAT "MET" IS ALLOWED TO MEAN: that the item's requirement holds for THIS
 * script, in the code, today. Not that it will, not that a repair is planned, not
 * that the gap is small. Where the item cannot be met because of what the script
 * IS rather than because of an omission, it is NOT MET with the reason, and the
 * reason says which of the two it is.
 *
 * THE MEMORY PASS RUNS NO SCRIPT AND PUBLISHES A TABLE, so it is held to
 * {@link assertAnswersSaySomething} — the rule about the RECORD — and to nothing
 * else here, because everything else here reads a SCRIPT. Its answers are in
 * `memoryPass.ts` and `BENCHMARKING.md` §2 says what its unsigned record costs.
 * Its unmet count is printed on its own, outside the (scenario × item) census: a
 * total may not include something its own name excludes.
 */
import { FLOOR_SCENARIO_KEYS, UNBOUNDED_BECAUSE, floorKeyFor, isFloorScenario, stepDeliveryOf } from './floor';
import { baselineArrayAdapter as ANCHOR_LEAN } from '../adapters/baseline-array';
import { baselineArrayIndexedAdapter as ANCHOR_INDEXED } from '../adapters/baseline-array-indexed';
import { controlHeavyAdapter, controlLeanAdapter, controlWriteAdapter } from './control';
import { wiringFor, wiringNameOf } from './types';
import type { TAdapter } from './types';

const CONTROLS: readonly TAdapter[] = [controlLeanAdapter, controlHeavyAdapter, controlWriteAdapter];
import type { TScenario, TScenarioKey } from './types';

/** One item's answer for one scenario. */
export type TItemStanding =
    | {
          met: true;
          /**
           * WHAT WOULD MAKE THIS ANSWER WRONG, in one sentence, in the scenario's
           * own terms — the observation, the code change or the measurement that
           * would turn this MET into a NOT MET. Required, non-trivial, and
           * distinct from the other twelve; `assertStandingSigned` throws
           * otherwise.
           */
          wrongIf: string;
      }
    | {
          met: false;
          /**
           * What is missing, in one sentence, in the scenario's own terms.
           * Required and non-empty — `assertStandingSigned` throws otherwise.
           */
          missing: string;
      };

export const met = (wrongIf: string): TItemStanding => ({ met: true, wrongIf });

export const notMet = (missing: string): TItemStanding => ({
    met: false,
    missing,
});

/**
 * THE THIRTEEN DECLARABLE ITEMS A SCENARIO ANSWERS FOR. What each demands is the
 * `demand` line beside its key in `STANDARD_ITEMS` below.
 *
 * No optional field and no index signature, deliberately: every field required
 * makes leaving an item out a compile error rather than a silent MET.
 */
export type TStandardItems = {
    A1: TItemStanding;
    A2: TItemStanding;
    A3: TItemStanding;
    A4: TItemStanding;
    B1: TItemStanding;
    B2: TItemStanding;
    B3: TItemStanding;
    B4: TItemStanding;
    C1: TItemStanding;
    C2: TItemStanding;
    C3: TItemStanding;
    C4: TItemStanding;
    C5: TItemStanding;
};

/**
 * THE THIRTEEN PLUS THE NAMES OF THE SCRIPTS THEY WERE WRITTEN FOR.
 *
 * The signature is part of the record rather than a field on `TScenario` because
 * it is a property of the ANSWERS, not of the script: a shared standing is one
 * document signed by several scripts, and the document has to say who signed it.
 */
export type TStandardStanding = TStandardItems & {
    readonly signedFor: readonly TScenarioKey[];
};

/**
 * SIGN THIS SET OF ANSWERS FOR THESE SCRIPTS.
 *
 * NOT A DEFAULTS OBJECT, which would let a call site say nothing about ten items
 * and be given MET for them: the spread is over a record whose thirteen fields
 * are all required. What it adds is the one field a spread cannot forge past the
 * load check — the list of scripts this document is signed for, which
 * `assertStandingSigned` compares against the scripts actually holding it.
 */
export const signedFor = (
    keys: readonly TScenarioKey[],
    items: TStandardItems
): TStandardStanding => ({ ...items, signedFor: keys });

/**
 * The items in the order the standard states them. Each `demand` is printed
 * beside the standing that answers it, so a reader does not have to hold the
 * published page open beside the report.
 */
export const STANDARD_ITEMS: readonly {
    key: keyof TStandardItems;
    demand: string;
}[] = [
    { key: 'A1', demand: 'every timed operation ends in a consumer that would have re-rendered' },
    { key: 'A2', demand: 'redundant deliveries counted, not just total ones' },
    { key: 'A3', demand: 'checked against an independent model, over the STORED state' },
    { key: 'A4', demand: 'verification and timing are not separate runs' },
    { key: 'B1', demand: 'both sides do the same job; asymmetry printed on the row it affects' },
    { key: 'B2', demand: 'the hand-written floor is what a competent person would write' },
    { key: 'B3', demand: "no adapter does the library's job for it, and departures print here" },
    { key: 'B4', demand: "the consumer's own cost is measured and kept out of the reading" },
    { key: 'C1', demand: 'machine interference refused, and recorded when permitted' },
    { key: 'C2', demand: 'one stated estimator for every row of a column' },
    { key: 'C3', demand: 'variation over the threshold is not presented as a result' },
    { key: 'C4', demand: 'two arms of a comparison do not share a compiled call site' },
    { key: 'C5', demand: 'the instrument attests its resolution at the scale of these rows' },
];

/**
 * B5's demand. DERIVED, not declared — see the header, and
 * {@link coverageStandingOf} for the answer.
 */
export const B5_DEMAND =
    'the row covers the whole field, and a coverage under it prints with the number';

/** C6's demand. Derived from the pieces on disk, not declared — see the header. */
export const C6_DEMAND = 'every published figure names an artifact';

/**
 * How short a falsifier may be before it is a shrug. Not measured and not
 * derivable — chosen once so that changing it is one edit.
 */
const SHORTEST_USEFUL_ANSWER = 30;

/* ── B5: how much of the field a row covers ─────────────────────────────── */

/**
 * WHICH DECLARATION FAMILY A SCRIPT BELONGS TO, for the one question B5 asks that
 * a single row cannot answer: is this table narrower than its NEIGHBOURS?
 *
 * `churnColumn` and `churnShared` are read against each other — that is what the
 * churn family is FOR — and since the per-shape split they no longer cover the
 * same libraries. A reader comparing them is comparing two populations, and the
 * only place that can be said is beside the number.
 *
 * THE FLOORS ARE THEIR OWN FAMILY. A floor needs no store, so it is measured in
 * one named adapter's process and the rest were never asked; folding it in with
 * the scripts it scales would report declines that nobody made.
 */
export const declarationFamilyOf = (scenario: TScenario): string => {
    if (isFloorScenario(scenario)) return 'floor';
    const name = wiringNameOf(scenario);
    if (name === '') return 'bind';
    const dot = name.indexOf('.');
    return dot === -1 ? name : name.slice(0, dot);
};

/** How many of `ADAPTERS` have a row in this scenario's table, and who does not. */
export type TCoverage = {
    asked: number;
    covered: number;
    /** Those without a row here, each with a written reason above the tables. */
    declined: readonly string[];
    family: string;
    /** The widest table of the same family — what a neighbouring row covers. */
    familyPeak: number;
    /** A storeless script: measured in one process, the rest never asked. */
    neverAsked: boolean;
};

const coveredCountOf = (scenario: TScenario, adapters: readonly TAdapter[]): number =>
    isFloorScenario(scenario)
        ? 1
        : adapters.filter(adapter => wiringFor(adapter, scenario).build !== undefined)
              .length;

export const coverageOf = (
    scenario: TScenario,
    scenarios: readonly TScenario[],
    adapters: readonly TAdapter[]
): TCoverage => {
    const family = declarationFamilyOf(scenario);
    const covered = coveredCountOf(scenario, adapters);
    let familyPeak = covered;
    for (const other of scenarios) {
        if (declarationFamilyOf(other) !== family) continue;
        const at = coveredCountOf(other, adapters);
        if (at > familyPeak) familyPeak = at;
    }
    return {
        asked: adapters.length,
        covered,
        declined: isFloorScenario(scenario)
            ? []
            : adapters.filter(
                  adapter => wiringFor(adapter, scenario).build === undefined
              ).map(adapter => adapter.name),
        family,
        familyPeak,
        neverAsked: isFloorScenario(scenario),
    };
};

/**
 * B5's ANSWER FOR ONE SCRIPT, computed rather than declared.
 *
 * A ratio over fourteen rows and a ratio over seventeen are different claims about
 * different populations. The text names the two counts and the family's widest
 * table, so the comparison a reader is about to make is priced in the same block
 * the NOT MET entries print in.
 */
export const coverageStandingOf = (
    scenario: TScenario,
    scenarios: readonly TScenario[],
    adapters: readonly TAdapter[]
): TItemStanding => {
    const coverage = coverageOf(scenario, scenarios, adapters);
    if (coverage.neverAsked) {
        return notMet(
            `this table has ONE row of ${coverage.asked}. The script needs no store, so it is measured ` +
                `in one named adapter's process and the other ${coverage.asked - 1} were never asked — ` +
                'that is not a decline and nobody is missing from it. It is still a population of one, ' +
                'and the tables this number scales are populations of fourteen to seventeen.'
        );
    }
    const declaration = wiringNameOf(scenario);
    if (coverage.covered === coverage.asked) {
        return met(
            `an adapter declining \`${declaration || 'bind'}\` would drop this table below ` +
                `${coverage.asked} rows without changing a word of this record — which is why the ` +
                'count is derived from the registry here and not written down.'
        );
    }
    const neighbour =
        coverage.familyPeak > coverage.covered
            ? `, where the widest table of the \`${coverage.family}\` family has ` +
              `${coverage.familyPeak} — so a reader comparing this row against its neighbour is ` +
              'comparing two populations'
            : '';
    return notMet(
        `${coverage.covered} of ${coverage.asked} libraries have a row in this table${neighbour}. ` +
            `Declined by: ${coverage.declined.join(', ')}; each reason is printed above the tables ` +
            `under \`${declaration}.absent\`.`
    );
};

/* ── the load-time check ────────────────────────────────────────────────── */

const fail = (scenarioKey: string, message: string): never => {
    throw new Error(`${scenarioKey}: ${message}`);
};

/**
 * WHAT THE CODE ITSELF CAN ANSWER, asked of the declaration rather than trusted.
 *
 * A declaration disagreeing with the code is a throw rather than a paragraph
 * nobody re-reads. Seven items are checked here, in the order they appear below:
 * A1 against the teardown flag, A3 and C5 against the wiring a script is driven
 * through, B1 against how many rows the table has, B2 against whether an anchor
 * supplies that wiring, B4 against the floor its family is scaled by, and B3's
 * coarseness claim against how many scripts share one declaration. These are the
 * checks a STALE signature fails.
 *
 * EVERY CHECK IS IN THE `MET` DIRECTION unless it is named otherwise, and that is
 * deliberate. NOT MET is the conservative answer: it costs the script a line in the
 * compliance block and claims nothing. MET is the answer somebody gets something
 * for, so MET is the one the code has to agree with.
 */
const assertAgreesWithTheCode = (
    scenario: TScenario,
    scenarios: readonly TScenario[]
): void => {
    const storeless = isFloorScenario(scenario);

    /**
     * A1 asks that the timed operation END IN A CONSUMER. A script that gives the
     * screen back has no consumer left to end in — its whole assertion is that
     * NOTHING was delivered, during the timed region and after it — so a MET here
     * would be a claim contradicted by the script's own `check`.
     *
     * THE `MET` DIRECTION ONLY: a script that DOES drive a consumer can still
     * declare A1 NOT MET for a narrower reason of its own — `churnResident` does,
     * because it cannot isolate a mount from the population standing behind it. So
     * the absence of a teardown flag proves nothing and is not asserted.
     *
     * WHAT THIS CANNOT SEE: whether a PARTICULAR adapter drove a consumer inside
     * the clock. A store that compares before it notifies delivers nothing on
     * `singleResend` and is CORRECT to; that is a fact about a row rather than
     * about the script, so it is counted from the stored counters and printed
     * under the table ({@link undrivenRowsOf}) rather than thrown here.
     */
    if (scenario.populationDestroyed === true && scenario.standing.A1.met) {
        fail(
            scenario.key,
            'standing.A1 says MET and this script sets `populationDestroyed`. A teardown step gives a ' +
                'screen back: a consumer that re-rendered inside its clock would be a FAILURE and not a ' +
                'result, so the timed region ends in no consumer by construction. What drives a consumer ' +
                'here is the untimed proof frame afterwards, and a proof frame is not the timed operation.'
        );
    }

    /**
     * A3 asks for an audit over the STORED state. A script with no store, none
     * left at the end, or a binding that keeps no grouping cannot supply one.
     *
     * A SINGLE SCRIPT IS AUDITABLE AND HAS NEITHER A POPULATION NOR A GROUPING,
     * which is why it is a branch and not a clause. Its stored state is TWO
     * VALUES, both read back through the library and compared against the model's
     * (`firstSingleMismatch` in `oracle.ts`, called from `auditStore`). That is
     * the whole of what this family holds, so the audit covers it in full — and
     * this branch becomes false if that call ever leaves `worker.ts`.
     */
    const auditable =
        scenario.single === true ||
        (!storeless &&
            scenario.populationDestroyed !== true &&
            scenario.churn === undefined &&
            scenario.relation !== true);
    if (scenario.standing.A3.met !== auditable) {
        fail(
            scenario.key,
            `standing.A3 says ${scenario.standing.A3.met ? 'MET' : 'NOT MET'} and the script says the ` +
                `opposite: storeless=${storeless}, populationDestroyed=${scenario.populationDestroyed === true}, ` +
                `churn=${scenario.churn ?? 'none'}, relation=${scenario.relation === true}, ` +
                `single=${scenario.single === true}. A3 is met by a script that leaves a population AND ` +
                'a grouping for the audit to walk, or by a single script, whose whole stored state is ' +
                'the two values the audit reads back.'
        );
    }

    /**
     * C5 asks for a control at the scale of these rows. The controls are bodies
     * over a store, and each declines the wirings it cannot attest in writing, so
     * "is this table attested" is a question about `CONTROLS` and not an opinion.
     */
    const attested =
        !storeless &&
        CONTROLS.every(control => wiringFor(control, scenario).build !== undefined);
    if (scenario.standing.C5.met !== attested) {
        const declining = CONTROLS.filter(
            control => wiringFor(control, scenario).build === undefined
        ).map(control => control.name);
        fail(
            scenario.key,
            `standing.C5 says ${scenario.standing.C5.met ? 'MET' : 'NOT MET'} and the registry says the ` +
                `opposite: storeless=${storeless}, controls declining \`${wiringNameOf(scenario) || 'bind'}\`: ` +
                `${declining.length === 0 ? 'none' : declining.join(', ')}. A table is attested when all ` +
                `${CONTROLS.length} control arms supply its wiring, and not otherwise.`
        );
    }

    /**
     * B2 asks whether THE HAND-WRITTEN FLOOR is what a competent person would
     * write. The hand-written floor in this report is the ANCHOR PAIR — `lean`,
     * which keeps no group index, and `indexed`, which keeps one and re-renders only
     * the windows a write can change — and a table neither of them has a row in has no hand-written
     * row for the item to be about.
     *
     * ONE ANCHOR IS ENOUGH TO HAVE A SUBJECT and is not enough to price the index:
     * `indexed` declines the churn, relation and single wirings, so `indexed − lean`
     * is printed in the write and read tables and nowhere else. That is a gap in
     * what those tables can be read FOR, not a gap in this check, and it is the B1
     * entry of {@link STANDARD_GAPS}.
     *
     * THE FLOORS ARE EXEMPT: a floor is not an anchor, keeps no store, and the
     * anchor has its own row in every table the floor scales.
     */
    if (!storeless && scenario.standing.B2.met) {
        const anchors = [ANCHOR_LEAN, ANCHOR_INDEXED].filter(
            anchor => wiringFor(anchor, scenario).build !== undefined
        );
        if (anchors.length === 0) {
            fail(
                scenario.key,
                `standing.B2 says MET and neither anchor supplies \`${wiringNameOf(scenario) || 'bind'}\`. ` +
                    `${ANCHOR_LEAN.name} and ${ANCHOR_INDEXED.name} ARE the hand-written floor of this ` +
                    'report; with neither in the table there is no hand-written row here to be competent ' +
                    'or otherwise, and the item is being answered about a row that is not printed.'
            );
        }
    }

    /**
     * B4 asks that the CONSUMER'S OWN COST be measured and kept out of the reading.
     * What measures it is the floor {@link floorKeyFor} hands this table, so a MET
     * whose family has no floor scenario is an item answered by a number nothing
     * takes.
     *
     * THE MAPPING ITSELF IS CHECKED, once per script, because the failure it would
     * have is silent. Only `isFloorScenario` routes `mountFloor`,
     * `relationFloor` and `singleFloor` to themselves — none of the six floors sets
     * the `churn`, `relation` or `single` flag — so a floor dropped from
     * `FLOOR_SCENARIO_KEYS` would not stop being measured. It would fall through to
     * `consumerFloor` and scale its family by a window delivery, which is the exact
     * wrong-scale arithmetic the six-floor design exists to prevent, and every
     * multiple in those tables would still print.
     */
    if (scenario.standing.B4.met) {
        const guardKey = floorKeyFor(scenario);
        // A FAMILY MAY HAVE NO FLOOR, AND THE ABSENCE IS DECLARED. `floorKeyFor`
        // answers `undefined` for a step shape nothing bounds — a script whose
        // correct answer delivers nothing, and the mount pair, which rows of its own
        // family beat. The declaration is the check: an absence with an entry in
        // `UNBOUNDED_BECAUSE` is a decision, an absence without one is a shape
        // somebody forgot to route, and those two must not read alike.
        if (guardKey === undefined) {
            const shape = stepDeliveryOf(scenario);
            if (!UNBOUNDED_BECAUSE.has(shape)) {
                fail(
                    scenario.key,
                    `standing.B4 says MET, \`floorKeyFor\` hands this table no floor, and its step ` +
                        `shape \`${shape}\` has no entry in \`UNBOUNDED_BECAUSE\` saying why. An ` +
                        'undeclared absence is indistinguishable from a shape nobody routed.'
                );
            }
        } else {
            const guard = scenarios.find(other => other.key === guardKey);
            if (guard === undefined || !isFloorScenario(guard)) {
                fail(
                    scenario.key,
                    `standing.B4 says MET and \`floorKeyFor\` hands this table \`${guardKey}\`, which ` +
                        `${guard === undefined ? 'is not among the scripts this report runs' : 'is not a floor scenario'}. ` +
                        "Nothing then measures this family's share of the consumer, no row of it can be " +
                        'marked against its multiple, and the gate B4 asks for is dead in this table.'
                );
            }
            // THE FLOOR'S STEP MUST BE THIS SCRIPT'S STEP. Checking that the key
            // exists is not enough, and the gap was not hypothetical: a script whose
            // correct answer delivers NOTHING was scaled by a floor whose step is one
            // window delivery, so the rows that answered it correctly came out far
            // below their own floor and the rows that failed it ranked.
            else if (stepDeliveryOf(guard) !== stepDeliveryOf(scenario)) {
                fail(
                    scenario.key,
                    `standing.B4 says MET and this table is divided by \`${guardKey}\`, whose step is a ` +
                        `\`${stepDeliveryOf(guard)}\` where this script's step is a ` +
                        `\`${stepDeliveryOf(scenario)}\`. The multiple would be a ratio between two ` +
                        'different measurements.'
                );
            }
        }
    }
    for (const key of FLOOR_SCENARIO_KEYS) {
        if (scenarios.some(other => other.key === key)) continue;
        fail(
            scenario.key,
            `\`${key}\` is listed in FLOOR_SCENARIO_KEYS and is not among the scripts this report runs. ` +
                'The list is what `floorKeyFor` short-circuits on; a floor missing from the scripts while ' +
                'still named there leaves its family scaled by whichever branch it falls through to, ' +
                'which for the mount, relation and single families is `consumerFloor` — a window delivery, ' +
                'at the wrong scale, printed without a word.'
        );
    }

    /**
     * B3's ONLY unmet cause in this suite is a declaration too coarse to decline
     * in: one entry covering several scripts, so a library able to answer one of
     * them and not another has to decline all of them. That is countable. A B3 NOT
     * MET on a script whose declaration is its own alone is a reason that has
     * expired — which is what happened to the three read scripts when `TReadEntry`
     * became one entry PER SHAPE.
     *
     * A future B3 NOT MET with a different cause would fail here, and widening this
     * check is then a deliberate edit with that cause named in it. The alternative
     * is a NOT MET nobody can trace to anything.
     */
    if (!scenario.standing.B3.met) {
        const name = wiringNameOf(scenario);
        const sharing = scenarios.filter(
            other => wiringNameOf(other) === name
        ).length;
        if (sharing < 2) {
            fail(
                scenario.key,
                `standing.B3 is NOT MET, and the only cause this check knows is a declaration too coarse ` +
                    `to decline in — but \`${name || 'bind'}\` is this script's alone (${sharing} script uses ` +
                    'it), so no library can be forced to decline a shape it could have answered. Either the ' +
                    'reason expired when the declaration was split, or B3 has failed here for a new cause ' +
                    'that this check has to be widened to name.'
            );
        }
    }
};

/**
 * EVERY STANDING IS SIGNED, EVERY ANSWER SAYS SOMETHING, AND THE ANSWERS THE CODE
 * CAN READ AGREE WITH IT — at module load, in every process, before anything is
 * measured.
 *
 * The type forces all thirteen items to be present. What it cannot force is that
 * somebody MEANT them for this script, that a MET names what would make it wrong,
 * or that either survives a change somewhere else. Those are throws.
 */
export const assertStandingSigned = (
    scenario: TScenario,
    scenarios: readonly TScenario[]
): void => {
    const standing = scenario.standing;

    if (!standing.signedFor.includes(scenario.key)) {
        fail(
            scenario.key,
            `this script holds a standing signed for ${standing.signedFor.join(', ')} and NOT for itself. ` +
                'A record of answers is a document somebody signed for named scripts; using it for another ' +
                'one is the copy this signature exists to be distinguishable from. Add this key to the ' +
                'signature if the answers were meant for it, and read all thirteen again while doing it.'
        );
    }

    /**
     * THE OTHER HALF, and the half a copier does not think of: the signature may
     * not name a script that does not hold this document. Otherwise a key left
     * behind by a deleted or re-signed scenario keeps vouching for nothing.
     */
    const holders = scenarios
        .filter(other => other.standing === standing)
        .map(other => other.key);
    for (const signed of standing.signedFor) {
        if (!holders.includes(signed)) {
            fail(
                scenario.key,
                `the signature names \`${signed}\`, which does not hold this standing. The scripts holding ` +
                    `it are: ${holders.join(', ')}. A signature that names a script it does not cover is a ` +
                    'claim about answers nobody gave.'
            );
        }
    }
    for (const holder of holders) {
        if (!standing.signedFor.includes(holder)) {
            fail(
                scenario.key,
                `\`${holder}\` holds this standing and the signature does not name it. Every script under a ` +
                    'shared record is a script somebody has to have read the thirteen answers for.'
            );
        }
    }

    assertAnswersSaySomething(scenario.key, standing);

    assertAgreesWithTheCode(scenario, scenarios);
};

/**
 * EVERY ANSWER SAYS SOMETHING — the half of the check that is about the RECORD and
 * not about the script underneath it.
 *
 * THE FALSIFIER DISCIPLINE AND NOTHING ELSE: a NOT MET owes a reason, a MET owes
 * what would make it wrong, no falsifier is the item's own demand read back, and
 * no two items in one record are overturned by one identical sentence. Everything
 * that reads the SCRIPT stays in {@link assertAgreesWithTheCode}.
 *
 * SEPARATED OUT so that a measurement which is not a scenario can be held to the
 * identical rules rather than to a second copy of them: the memory pass has no
 * signature to check and no wiring for the agreement checks to read, and exactly
 * the same duty to say what is missing and what would make a MET wrong. `subject`
 * is what the throw names — a scenario key, or the pass this record belongs to.
 */
export const assertAnswersSaySomething = (
    subject: string,
    standing: TStandardItems
): void => {
    const falsifiers: string[] = [];
    for (const item of STANDARD_ITEMS) {
        const answer = standing[item.key];
        if (!answer.met) {
            if (answer.missing.trim().length === 0) {
                fail(
                    subject,
                    `standing.${item.key} is NOT MET with an empty reason. An item this script cannot meet ` +
                        'owes the reader one sentence naming what is missing; a blank one is the silence ' +
                        'the record exists to make inexpressible.'
                );
            }
            continue;
        }
        const wrongIf = answer.wrongIf.trim();
        if (wrongIf.length < SHORTEST_USEFUL_ANSWER) {
            fail(
                subject,
                `standing.${item.key} is MET and says nothing about what would make it wrong. The demand is ` +
                    `"${item.demand}" — name the observation, the code change or the measurement that would ` +
                    'turn this answer over. An assurance nobody can imagine being wrong is one nobody checked.'
            );
        }
        if (wrongIf === item.demand.trim()) {
            fail(
                subject,
                `standing.${item.key}'s falsifier is the item's own demand read back. What would make this ` +
                    'answer wrong is not what the item asks for.'
            );
        }
        if (falsifiers.includes(wrongIf)) {
            fail(
                subject,
                `standing.${item.key} repeats a falsifier another item in this record already gave. Thirteen ` +
                    'items asking thirteen different things cannot be overturned by one identical event; a ' +
                    'repeated sentence is a block filled in rather than answered.'
            );
        }
        falsifiers.push(wrongIf);
    }
};

/**
 * Every item this record does not meet, in standard order, for the report.
 *
 * TAKES THE THIRTEEN AND NOT THE SIGNED DOCUMENT, because the signature has no
 * bearing on which items came out unmet, and a measurement that is not a scenario
 * has no signature to offer.
 */
export const unmetItemsOf = (
    standing: TStandardItems
): readonly { key: keyof TStandardItems; demand: string; missing: string }[] => {
    const unmet: { key: keyof TStandardItems; demand: string; missing: string }[] = [];
    for (const item of STANDARD_ITEMS) {
        const answer = standing[item.key];
        if (answer.met) continue;
        unmet.push({ key: item.key, demand: item.demand, missing: answer.missing });
    }
    return unmet;
};

/* ── what a stored piece can be asked, per row ──────────────────────────── */

/**
 * The three counters `BenchConsumer` keeps for one view, as a stored row carries
 * them. Structural rather than imported: the runner and `duel.ts` ask these
 * questions, and neither should have to hand over a `TMeasuredRecord` to ask
 * about three integers.
 */
export type TCountersRead = {
    deliveries: number;
    distinct: number;
    redundant: number;
};

/** One row of a timing table, reduced to what the standard can interrogate. */
export type TRowRead = {
    name: string;
    repeat: number;
    samples: number;
    a: TCountersRead;
    b: TCountersRead;
};

/**
 * A2, ASKED OF A STORED ROW RATHER THAN OF A SENTENCE.
 *
 * `BenchConsumer.end` counts ONE delivery and then EITHER one distinct render OR
 * one redundant one — never both, never neither — so `deliveries` is exactly
 * `distinct + redundant` on every row any honest path produced. A row where it is
 * not is a row whose redundancy was folded into the total or lost on the way here,
 * which is the failure A2 exists to name: a store that routes and one that rescans
 * then look alike.
 *
 * IT IS A CHECK ON THE ARTIFACT AND NOT ON THE LIBRARY. Nothing an adapter can do
 * breaks this equation; only the harness can, by counting one number where it owes
 * two. A2 is a promise the SUITE makes, and this is the arithmetic that holds it.
 */
export const firstFoldedRedundancy = (
    rows: readonly TRowRead[]
): string | undefined => {
    for (const row of rows) {
        for (const [view, counters] of [
            ['A', row.a],
            ['B', row.b],
        ] as const) {
            const total = counters.distinct + counters.redundant;
            if (counters.deliveries === total) continue;
            return (
                `${row.name}, view ${view}: ${counters.deliveries} deliveries against ` +
                `${counters.distinct} distinct + ${counters.redundant} redundant = ${total}. ` +
                '`BenchConsumer.end` counts one delivery and then exactly one of the other two, so ' +
                'these cannot differ unless a counter was folded or lost. The split IS A2, and one ' +
                'number cannot carry both halves.'
            );
        }
    }
    return undefined;
};

/**
 * C2, ASKED OF A STORED PIECE: ONE STATED ESTIMATOR FOR EVERY ROW OF A COLUMN.
 *
 * The plan is derived ONCE per (point, scenario) from that scenario's own probes
 * and handed down to every worker, and the piece stores the plan it handed out
 * rather than re-deriving it. So the column's estimator is a stored number and each
 * row carries the one it was measured under: a row whose `repeat` or `samples`
 * differs from the plan is a cell measured under another estimator, and every `+X%`
 * against it is partly a difference between estimators rather than between stores.
 *
 * WHAT MADE IT NECESSARY was a per-adapter repeat count, which made one row "the
 * minimum of 45 means of 86 runs" and its neighbour "the minimum of 27 individual
 * runs". The runner no longer does that, and this is what says so at print time
 * instead of thirteen scenarios each asserting it in prose.
 */
export const firstEstimatorMismatch = (
    plan: { repeat: number; samples: number },
    rows: readonly TRowRead[]
): string | undefined => {
    for (const row of rows) {
        if (row.repeat === plan.repeat && row.samples === plan.samples) continue;
        return (
            `${row.name} was measured at repeat ${row.repeat} / ${row.samples} sample(s) where this ` +
            `piece's plan is repeat ${plan.repeat} / ${plan.samples}. A column holding two estimators ` +
            'is not a column, and a percentage across them is partly a difference between the ' +
            'estimators rather than between the stores.'
        );
    }
    return undefined;
};

/**
 * A1, ASKED PER ROW OF A STORED PIECE: WHICH ROWS ENDED IN NO CONSUMER AT ALL.
 *
 * A1 IS DECLARED PER SCRIPT AND IS FALSIFIABLE PER ROW, which is why this counts
 * rather than throws. A participant that drove no consumer inside the clock is not
 * always at fault: a store comparing before it notifies delivers nothing at all on
 * `singleResend` and is correct to.
 *
 * So the answer is a list of names printed beside the times. A script whose A1 is
 * MET and whose row woke nothing is either measuring a write nobody reads or
 * measuring a store that had nothing to say — and the reader is the one who can
 * tell which, given the two counters.
 */
export const undrivenRowsOf = (
    scenario: TScenario,
    rows: readonly TRowRead[]
): readonly string[] =>
    scenario.standing.A1.met
        ? rows
              .filter(row => row.a.deliveries === 0 && row.b.deliveries === 0)
              .map(row => row.name)
        : [];

/* ── what the standard cannot check about itself ────────────────────────── */

/**
 * THE HOLES IN THIS RECORD, WITH THE ITEM EACH ONE SITS UNDER.
 *
 * A standard whose open problems live in a task list is a standard that reads
 * clean. These are the places where an item is answered by a mechanism that cannot
 * fully answer it, and each entry says what a reader is being asked to take on
 * trust rather than what somebody intends to do about it.
 *
 * NO NUMBER IS WRITTEN HERE. Where a gap has a size, the size is derived from the
 * pieces on disk at print time — a hole quoted from a run that is no longer on the
 * machine is the failure this whole package is built against.
 */
export const STANDARD_GAPS: readonly {
    item: string;
    gap: string;
}[] = [
    {
        item: 'C1',
        gap:
            'THE LOAD GATE CANNOT POLICE ITS OWN THRESHOLD. The allowance subtracts one runnable ' +
            "process per worker — each worker's MAIN thread — while V8 also marks and sweeps on helper " +
            'threads, so a heavy adapter holds the average up on its own and the surplus is counted as ' +
            "somebody else's. `loadavg()` cannot say whose work it is, and the per-worker weight that " +
            'would make the subtraction exact is not a constant. The error refuses pieces that would ' +
            'have been fine rather than admitting bad ones; what a reader takes on trust is that no ' +
            'piece was admitted that should not have been, which this gate cannot demonstrate. See ' +
            '`load.ts`, and the spread of foreign readings the runner derives from the pieces it found.',
    },
    {
        item: 'C1',
        gap:
            'THE PIECES ON DISK DISAGREE ABOUT WHAT THEY SUBTRACTED. `selfAllowance` is younger than ' +
            'the results directory: pieces written before 2026-09-01 allowed themselves one worker and ' +
            'recorded nothing, and the rest record the count they allowed. Absent is NOT the same ' +
            'statement as 1.00 — it is "this piece cannot say" — so a combined table spans two ' +
            'subtraction rules judged against one gate. Every printer passes `foreignPeak` through ' +
            '`ownAllowanceText` rather than assuming, and the counts are derived beside the pieces.',
    },
    {
        item: 'C6',
        gap:
            'NO TIMING RUN OF THE CURRENT ENGINE HAS BEEN RECORDED. `measurements/` is the only ' +
            'directory a published figure may name, and no directory in it was written by this ' +
            'harness — so nothing under it speaks for the engine as it stands, and C6 is unmet by ' +
            'every timing figure rather than by some of them. `results/` holds the pieces the report ' +
            'is rebuilt from; a piece is an intermediate and not a citation.',
    },
    {
        item: 'B1',
        gap:
            'THE INDEX IS PRICED IN TWO FAMILIES AND NOT IN FIVE. B1 asks that an asymmetry be ' +
            'printed on the row it affects, and the asymmetry this report can price is the group ' +
            'index: `baseline-array-indexed` against `baseline-array`, the same scripts at the same ' +
            'point. That anchor declines the churn, relation and single wirings, so those tables carry ' +
            'ONE hand-written row and the gap is not printed above them. B2 has a subject there; B1 ' +
            'has no priced asymmetry.',
    },
];

/* ── the count, derived ─────────────────────────────────────────────────── */

/** One item's line in the census: how many of the scripts do not meet it. */
export type TCensusItem = {
    key: string;
    demand: string;
    /** Derived from the registry or the disk rather than declared by a script. */
    derived: boolean;
    unmet: number;
    of: number;
};

export type TStandardCensus = {
    scenarios: number;
    /** Declarable + derived. */
    itemsPerScenario: number;
    pairs: number;
    unmet: number;
    perItem: readonly TCensusItem[];
    /** Every script, in report order, with how many of its items came out unmet. */
    perScenario: readonly { key: string; label: string; unmet: number }[];
};

/**
 * THE (scenario × item) COUNT, DERIVED EVERY TIME THE REPORT RUNS.
 *
 * C6 comes in as a callback because it is a fact about `results/` and this module
 * knows nothing about disk; B5 is computed here because it is a fact about the
 * registry, which this module does know. Everything else is read out of the
 * scripts' own signatures.
 */
export const standardCensus = (
    scenarios: readonly TScenario[],
    adapters: readonly TAdapter[],
    c6StandingOf: (scenario: TScenario) => TItemStanding
): TStandardCensus => {
    const perItem: TCensusItem[] = [
        ...STANDARD_ITEMS.map(item => ({
            key: item.key as string,
            demand: item.demand,
            derived: false,
            unmet: 0,
            of: scenarios.length,
        })),
        { key: 'B5', demand: B5_DEMAND, derived: true, unmet: 0, of: scenarios.length },
        { key: 'C6', demand: C6_DEMAND, derived: true, unmet: 0, of: scenarios.length },
    ];
    const byKey = new Map<string, TCensusItem>(
        perItem.map(item => [item.key, item] as const)
    );
    const perScenario: { key: string; label: string; unmet: number }[] = [];
    let unmet = 0;
    for (const scenario of scenarios) {
        let here = 0;
        const answers: readonly (readonly [string, TItemStanding])[] = [
            ...STANDARD_ITEMS.map(
                item => [item.key as string, scenario.standing[item.key]] as const
            ),
            ['B5', coverageStandingOf(scenario, scenarios, adapters)] as const,
            ['C6', c6StandingOf(scenario)] as const,
        ];
        for (const [key, answer] of answers) {
            if (answer.met) continue;
            here++;
            unmet++;
            const item = byKey.get(key);
            if (item !== undefined) item.unmet++;
        }
        perScenario.push({ key: scenario.key, label: scenario.label, unmet: here });
    }
    return {
        scenarios: scenarios.length,
        itemsPerScenario: perItem.length,
        pairs: scenarios.length * perItem.length,
        unmet,
        perItem,
        perScenario,
    };
};
