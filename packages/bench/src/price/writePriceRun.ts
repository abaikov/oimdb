import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';

import { CORES, DEFAULT_MAX_FOREIGN_LOAD, MAX_FOREIGN_LOAD } from '../harness/load';
import { formatPriceReport } from './formatPriceReport';
import { EXPERIMENT } from '../harness/identity';
import type { TPriceRecord } from './TPriceRecord';

/**
 * A RUN THAT LEFT SOMETHING BEHIND. Every documented figure has to name a file
 * under `measurements/`, and this is what puts one there. Three files, for three
 * different readers:
 *
 *   `machine.json`  — WHO measured: CPU, core count, Node build, the gate in
 *                     force. Without it a ratio is about an unnamed computer.
 *   `records.json`  — every field the worker and runner produced, unrounded.
 *                     What a re-deriver reads and a later run is diffed against.
 *   `report.txt`    — the run as the terminal printed it, controls first.
 *
 * The report is regenerated here from the records rather than captured from
 * stdout, so the two files can never disagree about a rounding.
 *
 * `format` DEFAULTS TO THE PRICE REPORT AND MUST BE PASSED FOR ANYTHING ELSE.
 * The alternatives catalogue produces the same `TPriceRecord`s and reads the
 * opposite way — below 1.00 is a win there — so `formatPriceReport` would sort
 * its `report.txt` best-first under the heading "worst ratio first". The
 * artifact outlives the terminal, so it is the copy that must not read backwards.
 */
export function writePriceRun(
    directory: string,
    records: readonly TPriceRecord[],
    format: (records: readonly TPriceRecord[]) => string = formatPriceReport,
): void {
    mkdirSync(directory, { recursive: true });

    const model = cpus()[0]?.model ?? 'unknown';
    const machine = {
        // Written by the runner, never by a worker: nothing here may be read
        // between a clock start and a clock stop.
        cpu: model,
        cores: CORES,
        arch: arch(),
        platform: platform(),
        release: release(),
        totalMemoryGb: Math.round(totalmem() / 1024 ** 3),
        node: process.version,
        // The gate that was in force for THIS run, whether default or accepted
        // by hand. A widened gate belongs in the artifact, not in a shell
        // profile — see the argument in `harness/load.ts`.
        maxForeignLoad: MAX_FOREIGN_LOAD,
        // Against the constant, never a literal 0.5: the default is argued for in
        // `harness/load.ts`, and a copy of it here would go on writing
        // `gateWasRaised: false` into artifacts the day that argument changes.
        gateWasRaised: MAX_FOREIGN_LOAD !== DEFAULT_MAX_FOREIGN_LOAD,
        coreFingerprint: EXPERIMENT.subject,
        pairs: records.filter(record => !record.reading.isControl).length,
        controls: records.filter(record => record.reading.isControl).length,
    };

    writeFileSync(join(directory, 'machine.json'), `${JSON.stringify(machine, null, 4)}\n`);
    writeFileSync(join(directory, 'records.json'), `${JSON.stringify(records, null, 4)}\n`);
    writeFileSync(join(directory, 'report.txt'), `${format(records)}\n`);
}
