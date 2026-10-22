/**
 * THE PRICE OF EVERY OPERATION @oimdb/core OFFERS, AGAINST THE PRIMITIVE A
 * PERSON WOULD HAVE WRITTEN INSTEAD: `upsert` against `map.set(id, row)`, `find`
 * against `map.get(id)`, a frame against nothing at all.
 *
 * A ROW HERE IS A PRICE TAG AND NOT A RANK — ours over the floor, printed
 * INCLUDING the rows where the price is high.
 *
 * WHAT PUTS A PAIR IN THIS TABLE RATHER THAN IN `alternatives.ts` is what stands
 * in `floor`, and BENCHMARKING.md §1 owns that boundary. It is CATALOGUED BY ID
 * AND CHECKED AT MODULE LOAD: every alternatives id begins `alt.` and no price id
 * does, and `pricePairs.ts` throws in both directions. Without that check the only
 * thing assigning a pair is which array it was spread into — and the two
 * catalogues deliberately share this runner, this worker, this gate and these
 * controls, so a misfiled pair prints a correct row that a reader takes exactly
 * backwards.
 *
 *     npm run price                       # everything, controls first
 *     npm run price -- --only update      # every pair whose id contains "update"
 *     npm run price -- --list             # the catalogue, without measuring
 *
 * Its own entry point because each pair is independent and takes seconds, where
 * the scenario benchmark is an hour-long batch any other process poisons.
 *
 * THE CONTROLS ALWAYS RUN, whatever `--only` says: they are what says this
 * process could see a difference it was told was there, and how small a
 * difference is still a difference on this machine at this moment.
 *
 * A pair whose foreign load is over the gate is REFUSED rather than measured, and
 * one whose load rose mid-measurement is printed with an `L`. See
 * `harness/load.ts`.
 */
import { formatPriceReport } from './price/formatPriceReport';
import { loadPriceCatalogue } from './price/loadPriceCatalogue';
import { reportPriceRun } from './price/reportPriceRun';
import { runPricePairs } from './price/runPricePairs';
import type { TPricePair } from './price/TPricePair';

const argv = process.argv.slice(2);

const optionValue = (name: string): string | undefined => {
    const at = argv.indexOf(name);
    if (at === -1) return undefined;
    return argv[at + 1];
};

const wantsList = argv.includes('--list');
const only = optionValue('--only');
/**
 * Where this run leaves its artifact. Optional, because a person checking one
 * pair wants a terminal and not a file — but every figure quoted in the
 * documentation site has to name a directory written here.
 */
const record = optionValue('--record');
const pricePairs = await loadPriceCatalogue(only);

const matches = (pair: TPricePair): boolean => {
    if (only === undefined) return true;
    return only
        .split(',')
        .map(part => part.trim())
        .filter(part => part.length > 0)
        .some(part => pair.id.includes(part));
};

if (wantsList) {
    const rows = [...pricePairs.controls, ...pricePairs.priced];
    for (const pair of rows) {
        process.stdout.write(`${pair.path.padEnd(18)}  ${pair.id}\n`);
        process.stdout.write(`${' '.repeat(20)}ours   ${pair.ours}\n`);
        process.stdout.write(`${' '.repeat(20)}floor  ${pair.floor}\n`);
    }
    process.exit(0);
}

const selected = pricePairs.priced.filter(matches);
if (selected.length === 0) {
    process.stderr.write(
        `price: --only "${only ?? ''}" matched none of the ${pricePairs.priced.length} pairs. ` +
            'Run with --list to see them.\n',
    );
    process.exit(1);
}

// Controls first and always: a price under an unattested instrument is not evidence.
const run = runPricePairs([...pricePairs.controls, ...selected], pricePairs.catalogueOf);

process.exit(reportPriceRun(run, formatPriceReport, record));
