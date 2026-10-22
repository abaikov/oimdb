import type { TLoadSummary } from '../harness/load';
import type { TRetainedReading } from './TRetainedReading';

/**
 * ONE ROW OF THE REPORT AND WHAT THE MACHINE WAS DOING WHILE IT WAS TAKEN. Two
 * fields because the reading belongs to the workers, which know nothing about the
 * machine, and the load belongs to the runner.
 *
 * A LOAD AVERAGE MATTERS LESS TO A BYTE COUNT THAN TO A TIMING, AND IT STILL
 * MATTERS: V8's collector is concurrent and incremental, so on a busy machine a
 * full collection can return with work outstanding and the settle loop is likelier
 * to stop at the ceiling with a gap still open. The load is what explains that.
 */
export type TRetainedRecord = {
    readonly reading: TRetainedReading;
    readonly load: TLoadSummary;
};
