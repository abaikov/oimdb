import type { TLoadSummary } from '../harness/load';
import type { TPriceReading } from './TPriceReading';

/**
 * ONE ROW OF THE REPORT: what the worker found, and what the machine was doing
 * while it found it.
 *
 * Two fields, not flattened: the reading is the worker's, measured inside a
 * process that knows nothing about the machine; the load is the runner's, read
 * where a process spawn was already being paid for. No clock in this suite has
 * `os.loadavg()` between its start and its stop.
 *
 * The load must travel WITH the number — background load has already turned a
 * known-2x control into a single-digit percentage here.
 */
export type TPriceRecord = {
    readonly reading: TPriceReading;
    readonly load: TLoadSummary;
};
