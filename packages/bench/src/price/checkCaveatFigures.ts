// Prose: ./README.md#checkcaveatfigures
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TPricePair } from './TPricePair';

export function checkCaveatFigures(pairs: readonly TPricePair[]): void {
    for (const pair of pairs) {
        const sentences = pair.caveat.split(SENTENCE_END);

        for (const sentence of sentences) {
            for (const cited of measurementsCitedIn(sentence)) {
                if (existsSync(join(MEASUREMENTS_ROOT, cited))) continue;
                throw new Error(
                    `price: the caveat on "${pair.id}" cites measurements/${cited}, and there is ` +
                        'no such directory. A figure whose artifact was deleted is in the same ' +
                        'position as a figure that never had one — re-record the run, or name the ' +
                        `directory that actually holds it. The sentence is: "${sentence.trim()}"`,
                );
            }
        }

        for (const sentence of sentences) {
            const figure = unpaidFigureOf(sentence);
            if (figure === undefined) continue;
            throw new Error(
                `price: the caveat on "${pair.id}" states the figure "${figure}" and says nothing ` +
                    'about where it came from. A figure names a directory under measurements/ or ' +
                    'it does not get written, and this one is printed under its row on every run — ' +
                    'beside a number the process has just taken, where a reader cannot tell the ' +
                    'two apart. Record the run and name its directory in the same sentence; or, if ' +
                    'the figure is a claim this row exists to replace, mark it ' +
                    `${NO_RUN_MARKER}; or, if it is a prediction this run can refute, mark it ` +
                    `${STATED_IN_ADVANCE_MARKER}. The sentence is: "${sentence.trim()}"`,
            );
        }
    }
}

const MEASUREMENTS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'measurements');

const NO_RUN_MARKER = '[NO RUN BEHIND THIS FIGURE]';
const STATED_IN_ADVANCE_MARKER = '[FIGURE STATED IN ADVANCE]';

const FIGURE = /(?<![\w.:/])\d+(?:[.,]\d+)?[  ]?(?:ns|µs|us|ms|%|x|B|kB|KB|MB|GB|bytes?)(?![\w])/g;

/** The one carve-out: `the 1% row` names a row, it does not measure one. */
const ROW_NAME = /^[  ]?rows?\b/;

const DIRECTORY = /(?:([A-Za-z0-9._-]+)\/)?(\d{4}-\d{2}-\d{2}-[a-z][A-Za-z0-9._-]*(?:\/[A-Za-z0-9._-]+)*)/g;

/** The directory a run is recorded in, and the only one that answers for a figure. */
const MEASUREMENTS = 'measurements';

/**
 * Every run this sentence cites, as a path under `measurements/`. A citation
 * carrying any other directory is somebody else's document and is not one.
 */
function measurementsCitedIn(sentence: string): string[] {
    const cited: string[] = [];
    for (const found of sentence.matchAll(DIRECTORY)) {
        if (found[1] !== undefined && found[1] !== MEASUREMENTS) continue;
        cited.push(found[2]);
    }
    return cited;
}

/**
 * Sentence ends as this corpus punctuates them. `3.677` and `1.00x` survive
 * because the decimal point has no space after it, and an over-split only ever
 * makes the check stricter — never quieter.
 */
const SENTENCE_END = /(?<=[.!?;])[  ]+(?=[A-Z`"(])/;

function unpaidFigureOf(sentence: string): string | undefined {
    if (sentence.includes(NO_RUN_MARKER)) return undefined;
    if (sentence.includes(STATED_IN_ADVANCE_MARKER)) return undefined;
    // A directory in the sentence pays for every figure in it. Whether that
    // directory is really on disk is the loop above's question, not this one's.
    if (sentence.match(DIRECTORY) !== null) return undefined;

    for (const found of sentence.matchAll(FIGURE)) {
        const after = sentence.slice(found.index + found[0].length);
        if (ROW_NAME.test(after)) continue;
        return found[0];
    }
    return undefined;
}
