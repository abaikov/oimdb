import { attestRetainedRun } from './attestRetainedRun';
import type { TRetainedRecord } from './TRetainedRecord';
import type { TRetainedRun } from './TRetainedRun';
import { writeRetainedRun } from './writeRetainedRun';

/**
 * WHAT A RUN LEAVES ON THE TERMINAL, IN THE FILESYSTEM, AND IN THE EXIT CODE.
 *
 * The same three rules `reportPriceRun` keeps: a refusal is explained rather than
 * counted, a failed pair turns the run red, and A RUN WHOSE CONTROLS DID NOT PASS
 * EXITS NON-ZERO EVEN THOUGH IT PRINTED A TABLE. `attestRetainedRun` decides, and
 * it is the same call the report prints from, so the terminal and the exit code
 * cannot disagree.
 */
export const reportRetainedRun = (
    run: TRetainedRun,
    format: (records: readonly TRetainedRecord[]) => string,
    recordDirectory: string | undefined,
): number => {
    if (run.records.length > 0) {
        process.stdout.write(`${format(run.records)}\n`);
        if (recordDirectory !== undefined) {
            writeRetainedRun(recordDirectory, run.records, format);
            process.stdout.write(`\nwritten to ${recordDirectory}\n`);
        }
    }

    if (run.refused.length > 0) {
        process.stdout.write('\nREFUSED — the machine was too busy to measure these:\n');
        for (const line of run.refused) process.stdout.write(`  ${line}\n`);
        process.stdout.write(
            '  Raise the gate with BENCH_MAX_LOAD=<runnable processes> if you accept the ' +
                'interference; the number\n  you accepted is printed with every pair measured under it.\n',
        );
    }

    if (run.failed.length > 0) {
        process.stdout.write('\nFAILED — these pairs did not produce a reading:\n');
        for (const line of run.failed) process.stdout.write(`  ${line}\n`);
    }

    const attestation = attestRetainedRun(run.records);
    return run.failed.length > 0 || !attestation.attested ? 1 : 0;
};
