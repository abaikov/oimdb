import type { TExperiment } from '../harness/identity';
import type { TLoadSummary } from '../harness/load';
import type { TSamplingPlan } from '../harness/measure';
import type { TCostRecord, TMeasuredRecord } from '../harness/pieces';
import type { TPoint } from '../cells/types';

/**
 * WHERE THE SAMPLING PLAN CAME FROM — the one field that decides whether these
 * two numbers may be read beside a full-registry table. See `runDuel.ts`.
 */
export type TDuelPlanSource =
    | {
          kind: 'derived';
          /** The probes the plan was priced from. */
          costs: readonly TCostRecord[];
      }
    | {
          kind: 'borrowed';
          pointKey: string;
          scenario: string;
          probedAt: string;
          participants: number;
      };

export type TDuelAnswer = {
    name: string;
    /** Absent when the arm never produced an answer; `problem` says why. */
    signature?: string;
    oracle?: string;
    problem?: string;
};

export type TDuelReading = {
    arm: TMeasuredRecord;
    floor: TMeasuredRecord;
    /** `arm.min / floor.min`. Above 1.00 the arm costs more than the floor. */
    ratio: number;
    /**
     * `arm.drift + floor.drift`. The SUM and not the larger of them: the ratio is
     * a quotient, so the relative errors of its halves add.
     */
    noise: number;
};

export type TDuelControl = {
    lean: TMeasuredRecord;
    heavy: TMeasuredRecord;
    /** `(heavy.min - lean.min) / lean.min` for a deliberate doubling of work. */
    gap: number;
    drift: number;
};

/**
 * EVERYTHING ONE TWO-ARM RUN FOUND OUT, including the reasons it found out
 * nothing — one object, so a refusal, a void verification and a clean reading all
 * print through the same path. A run that produced no number is a result too.
 */
/**
 * THE FIELD THESE TWO ARMS WERE TAKEN OUT OF — so a `15.6×` printed here cannot
 * be read as a verdict over the registry.
 *
 * A RATIO OVER TWO ROWS AND A RATIO OVER SEVENTEEN ARE DIFFERENT CLAIMS AND MUST
 * NOT LOOK ALIKE. This tool measures exactly two by construction, which is its
 * whole point and also its whole limit; the counts below are what let the report
 * say so with numbers instead of a hedge.
 *
 * THE TWO ABSENCES ARE NOT THE SAME FACT, which is why they are two fields:
 *
 *   `notAsked`  — libraries this tool did not run. A fact about THE TOOL: they
 *                 have a wiring for this script and would have produced a row in
 *                 `npm run bench`.
 *   `declined`  — libraries with no wiring for this script at all, each with a
 *                 written reason in its own adapter. A fact about THE LIBRARY.
 *
 * Collapsing them into one number is exactly the move this block exists to stop:
 * it would report the tool's narrowness as fifteen findings about libraries.
 */
export type TDuelField = {
    /** Every row of the registry — the field a full report compares. */
    asked: number;
    /** Of those, how many supply the wiring this script needs. */
    wired: number;
    /** Of the wired, the ones this run did not measure. Always `wired - 2`. */
    notAsked: number;
    /** Those with no wiring here, by name. Their reasons are in their adapters. */
    declined: readonly string[];
    /** Which declaration a decline is in — `reads.byKey.absent`, etc. `''` for none. */
    what: string;
};

export type TDuelRun = {
    armName: string;
    floorName: string;
    /** See {@link TDuelField}: what this two-row ratio is two rows OF. */
    field: TDuelField;
    /**
     * Whether the floor is `baseline-array`, the naive no-library floor. The report
     * treats `baseline-indexed` as a hand-written floor too; any other floor is a
     * comparison, and the report refuses to call it a floor.
     */
    floorIsNaive: boolean;
    scenarioKey: string;
    scenarioLabel: string;
    scenarioDescription: string;
    point: TPoint;

    /** Set when the machine was too busy to start; nothing below was measured. */
    refusal?: string;

    steps?: number;
    byFinalState: boolean;
    /**
     * Whether the script was bound to ONE CONSUMER PER GROUP rather than the two
     * named views. It reaches the report because a per-group script sends up the
     * SUM over its consumers and an empty slot, and printing that slot as
     * `B 0d/0n/0r` would be a claim about a view that does not exist.
     */
    perGroup: boolean;
    answers: readonly TDuelAnswer[];
    /** Why no timing may be printed. Absent when the verification passed. */
    voidReason?: string;

    plan?: TSamplingPlan;
    planSource?: TDuelPlanSource;

    reading?: TDuelReading;
    /** False when the resolution controls decline this script, as `controlsFor` decides for the cell runner. */
    controlsAsked: boolean;
    control?: TDuelControl;
    /**
     * Everything that went wrong without voiding the run. Printed under the table
     * rather than counted, and it turns the exit code.
     */
    problems: readonly string[];

    load: TLoadSummary;
    experiment: TExperiment;
    /** At least one worker ran without `--expose-gc`. */
    gcMissing: boolean;
    node: string;
    measuredAt: string;
    seconds: number;
};
