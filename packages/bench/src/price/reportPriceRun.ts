import { CONTROL_RESOLUTION, RESOLUTION_AT_LEAST } from './priceControls';
import type { TPriceRecord } from './TPriceRecord';
import type { TPriceRun } from './TPriceRun';
import { writePriceRun } from './writePriceRun';

const isAttested = (records: readonly TPriceRecord[]): boolean => {
    const resolution = records.find(
        record => record.reading.isControl && record.reading.id === CONTROL_RESOLUTION,
    );
    return resolution !== undefined && resolution.reading.ratio >= RESOLUTION_AT_LEAST;
};

export const reportPriceRun = (
    run: TPriceRun,
    format: (records: readonly TPriceRecord[]) => string,
    recordDirectory: string | undefined,
): number => {
    if (run.records.length > 0) {
        process.stdout.write(`${format(run.records)}\n`);
        if (recordDirectory !== undefined) {
            writePriceRun(recordDirectory, run.records, format);
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

    return run.failed.length > 0 || !isAttested(run.records) ? 1 : 0;
};
