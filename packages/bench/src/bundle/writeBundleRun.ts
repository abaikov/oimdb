import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';

import { formatBundleReport } from './formatBundleReport';
import type { TBundlePiece } from './TBundlePiece';
import type { TBundleRun } from './TBundleRun';

/**
 * A RUN THAT LEFT SOMETHING BEHIND — `machine.json`, `records.json`,
 * `report.txt`, with the same names and division of labour as
 * `writePriceRun.ts`, so a reader need not learn a second directory layout.
 *
 * `machine.json`'s CONTENTS are not the same, and it says so in its own first
 * field: the load gate every price run carries is ABSENT rather than defaulted.
 * `report.txt` is regenerated from the run rather than captured from stdout, so
 * two copies of one table cannot disagree about a rounding.
 */
export const writeBundleRun = (
    piece: TBundlePiece,
    directory: string,
    run: TBundleRun,
): void => {
    mkdirSync(directory, { recursive: true });

    const machine = {
        /**
         * WHICH CLAIM THIS DIRECTORY HOLDS, named in the artifact rather than
         * left to the directory's own name, so a run that has been moved or
         * renamed still says what it measured.
         */
        piece: piece.id,
        /**
         * First field on purpose: whoever opens this looking for the load gate
         * finds the reason it is not here before they find anything else.
         */
        determinism:
            'Byte counts are deterministic. The same source through the same bundler at the same '
            + 'settings emits the same bytes whatever else this machine was doing, so this run has '
            + 'no foreign-load gate, no refusal and no drift check. What replaces them is the '
            + 'toolchain below: every field of it moves the number.',
        toolchain: run.toolchain,
        cpu: cpus()[0]?.model ?? 'unknown',
        cores: cpus().length,
        arch: arch(),
        platform: platform(),
        release: release(),
        totalMemoryGb: Math.round(totalmem() / 1024 ** 3),
        arms: run.readings.length,
    };

    const findings = piece.findings(run.readings);

    writeFileSync(join(directory, 'machine.json'), `${JSON.stringify(machine, null, 4)}\n`);
    writeFileSync(
        join(directory, 'records.json'),
        `${JSON.stringify({ readings: run.readings, findings }, null, 4)}\n`,
    );
    writeFileSync(join(directory, 'report.txt'), `${formatBundleReport(piece, run)}\n`);
};
