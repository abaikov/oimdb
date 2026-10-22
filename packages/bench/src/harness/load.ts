// What else the machine was doing, as a gate before a piece starts and a record
// that travels with it. The incident, the units, where the subtraction is still
// wrong, and every field below are in `README.md#load`.
//
// FOREIGN LOAD IS THE ONE-MINUTE AVERAGE MINUS THIS HARNESS'S OWN PROCESSES: each
// of a piece's workers is still decaying inside the average after it exits, so a
// gate on the raw reading refuses every back-to-back piece.
import { cpus, loadavg } from 'node:os';

// For the record only: the gate is not normalised by it.
export const CORES = cpus().length;

export const SELF_ALLOWANCE_PER_WORKER = 1;

export const DEFAULT_MAX_FOREIGN_LOAD = 0.5;

// A RAISED GATE TRAVELS INTO THE PIECE AND IS PRINTED UNDER ITS TABLE, which is why
// the knob is a number in the artifact and not a "yes" in a shell profile: the
// permitted gate refuses, the default gate is what a reader reads against.
const configured = process.env.BENCH_MAX_LOAD;
export const MAX_FOREIGN_LOAD = Number(configured ?? DEFAULT_MAX_FOREIGN_LOAD);
if (!Number.isFinite(MAX_FOREIGN_LOAD) || MAX_FOREIGN_LOAD < 0) {
    throw new Error(
        `BENCH_MAX_LOAD must be a number of at least 0 (units: runnable processes, ` +
            `not a percentage); got ${configured}`
    );
}

export const allowanceFor = (selfWorkers: number): number =>
    selfWorkers * SELF_ALLOWANCE_PER_WORKER;

export const foreignPart = (load1: number, selfWorkers: number): number =>
    Math.max(0, load1 - allowanceFor(selfWorkers));

export type TLoadSummary = {
    cores: number;
    gate: number;
    // Absent is NOT 1.00: it is "this piece cannot say". Print it through
    // `ownAllowanceText`, never assume it.
    selfAllowance?: number;
    start: number;
    peak: number;
    readings: number;
    foreignPeak: number;
    // A fact about a permission, not about the machine.
    over: boolean;
};

export const busyForTheDefaultGate = (load: TLoadSummary): boolean =>
    load.foreignPeak > DEFAULT_MAX_FOREIGN_LOAD;

export const ownAllowanceText = (load: TLoadSummary): string =>
    load.selfAllowance === undefined
        ? 'less an allowance it did not record (1.00, before 2026-09-01)'
        : `less ${load.selfAllowance.toFixed(2)} allowed for its own workers`;

export const gateWasRaised = (load: TLoadSummary): boolean =>
    load.gate > DEFAULT_MAX_FOREIGN_LOAD;

// What the pieces themselves say about the gate they were taken under.
export type TGateReading = {
    pieces: number;
    lowestForeign: number;
    highestForeign: number;
    aboveTheDefault: number;
    allowanceRecorded: number;
    allowancesRecorded: readonly number[];
    allowanceAbsent: number;
};

export const gateReadingOf = (
    loads: readonly TLoadSummary[]
): TGateReading | undefined => {
    if (loads.length === 0) return undefined;
    let lowestForeign = Number.POSITIVE_INFINITY;
    let highestForeign = Number.NEGATIVE_INFINITY;
    let aboveTheDefault = 0;
    let allowanceRecorded = 0;
    let allowanceAbsent = 0;
    const allowances = new Set<number>();
    for (const load of loads) {
        if (load.foreignPeak < lowestForeign) lowestForeign = load.foreignPeak;
        if (load.foreignPeak > highestForeign) highestForeign = load.foreignPeak;
        if (busyForTheDefaultGate(load)) aboveTheDefault++;
        if (load.selfAllowance === undefined) {
            allowanceAbsent++;
            continue;
        }
        allowanceRecorded++;
        allowances.add(load.selfAllowance);
    }
    return {
        pieces: loads.length,
        lowestForeign,
        highestForeign,
        aboveTheDefault,
        allowanceRecorded,
        allowancesRecorded: [...allowances].sort((a, b) => a - b),
        allowanceAbsent,
    };
};

// Sampled where the runner already pays for a process spawn: never between a clock
// start and a clock stop, and never inside a worker.
export class BenchLoad {
    private readonly startLoad: number;
    private peak: number;
    private readings: number;

    // `selfWorkers` is how many workers THIS runner spends on the coming piece, not
    // how many run at once.
    constructor(private readonly selfWorkers = 1) {
        if (!Number.isFinite(selfWorkers) || selfWorkers < 1) {
            throw new Error(
                `BenchLoad: selfWorkers must be a finite number of at least 1; got ${selfWorkers}`
            );
        }
        this.startLoad = loadavg()[0];
        this.peak = this.startLoad;
        this.readings = 1;
    }

    sample(): void {
        const now = loadavg()[0];
        if (now > this.peak) this.peak = now;
        this.readings++;
    }

    // Read from the START reading alone: by the time the peak has risen the piece is
    // already paid for, and the honest response is the record, not a refusal.
    refusal(): string | undefined {
        const foreign = foreignPart(this.startLoad, this.selfWorkers);
        if (foreign <= MAX_FOREIGN_LOAD) return undefined;
        const allowance = allowanceFor(this.selfWorkers);
        return (
            `the machine is busy: one-minute load average ${this.startLoad.toFixed(2)} on ` +
            `${CORES} cores, less ${allowance.toFixed(2)} allowed for this runner's own ` +
            `${this.selfWorkers} worker process(es) at ` +
            `${SELF_ALLOWANCE_PER_WORKER.toFixed(2)} each, is ${foreign.toFixed(2)} ` +
            `of foreign work, against a gate of ${MAX_FOREIGN_LOAD.toFixed(2)}`
        );
    }

    summary(): TLoadSummary {
        const foreignPeak = foreignPart(this.peak, this.selfWorkers);
        return {
            cores: CORES,
            gate: MAX_FOREIGN_LOAD,
            selfAllowance: allowanceFor(this.selfWorkers),
            start: this.startLoad,
            peak: this.peak,
            readings: this.readings,
            foreignPeak,
            over: foreignPeak > MAX_FOREIGN_LOAD,
        };
    }
}
