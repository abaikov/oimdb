import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';

import { CORES, DEFAULT_MAX_FOREIGN_LOAD, MAX_FOREIGN_LOAD } from '../harness/load';
import { attestRetainedRun } from './attestRetainedRun';
import { formatRetainedReport } from './formatRetainedReport';
import type { TRetainedRecord } from './TRetainedRecord';

/**
 * A RETENTION RUN THAT LEFT SOMETHING BEHIND — the same three files
 * `writePriceRun` writes, plus one thing a price run does not need:
 * WHETHER THIS V8 USES POINTER COMPRESSION. Every figure in a byte table is four
 * or eight times a count of references, so a run whose build is not recorded
 * cannot be compared with one from another machine; the same code would honestly
 * report half the bytes with nothing in the artifact saying why.
 *
 * The build flag is EVIDENCE and is not what the report uses — the report reads
 * the bytes-per-reference the known-size control MEASURED. If the two disagree,
 * that disagreement is the finding.
 */
export function writeRetainedRun(
    directory: string,
    records: readonly TRetainedRecord[],
    format: (records: readonly TRetainedRecord[]) => string = formatRetainedReport,
): void {
    mkdirSync(directory, { recursive: true });

    const attestation = attestRetainedRun(records);
    // Not in the published type at all. Read as an untyped record rather than
    // through an assertion that claims more than is known: a missing key must
    // come out as "not stated", never as `false`.
    const variables = process.config.variables as unknown as Record<string, unknown>;
    const pointerCompression = variables.v8_enable_pointer_compression;

    const model = cpus()[0]?.model ?? 'unknown';
    const machine = {
        // By the runner, never a worker: nothing here may be read between a build
        // and a heap reading.
        cpu: model,
        cores: CORES,
        arch: arch(),
        platform: platform(),
        release: release(),
        totalMemoryGb: Math.round(totalmem() / 1024 ** 3),
        node: process.version,
        v8: process.versions.v8,
        /** What the build says. `null` means the field was not present at all. */
        pointerCompressionConfigured: pointerCompression ?? null,
        /** What the control measured. This is what the report reads. */
        bytesPerReferenceMeasured: attestation.bytesPerReference ?? null,
        pointerBytes: attestation.pointerBytes ?? null,
        noiseFloorBytes: attestation.noiseFloorBytes ?? null,
        attested: attestation.attested,
        attestationFailures: attestation.reasons,
        maxForeignLoad: MAX_FOREIGN_LOAD,
        // The constant, never a literal 0.5 — see `writePriceRun`.
        gateWasRaised: MAX_FOREIGN_LOAD !== DEFAULT_MAX_FOREIGN_LOAD,
        pairs: records.filter(record => !record.reading.isControl).length,
        controls: records.filter(record => record.reading.isControl).length,
    };

    writeFileSync(join(directory, 'machine.json'), `${JSON.stringify(machine, null, 4)}\n`);
    writeFileSync(join(directory, 'records.json'), `${JSON.stringify(records, null, 4)}\n`);
    // Regenerated from the records rather than captured from stdout, so the two
    // files cannot disagree about a rounding.
    writeFileSync(join(directory, 'report.txt'), `${format(records)}\n`);
}
