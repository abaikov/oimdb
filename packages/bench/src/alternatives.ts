// THE RATIO READS BACKWARDS HERE: below 1.00 the shipped design wins, above 1.00 the
// decision was wrong. Which catalogue a pair belongs to is checked at module load in
// `pricePairs.ts` — an alternatives id begins `alt.`, a price id does not.
import { formatAlternativeReport } from './price/formatAlternativeReport';
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
    const rows = [...pricePairs.controls, ...pricePairs.alternatives];
    for (const pair of rows) {
        process.stdout.write(`${pair.path.padEnd(18)}  ${pair.id}\n`);
        process.stdout.write(`${' '.repeat(20)}shipped   ${pair.ours}\n`);
        process.stdout.write(`${' '.repeat(20)}rejected  ${pair.floor}\n`);
    }
    process.exit(0);
}

const selected = pricePairs.alternatives.filter(matches);
if (selected.length === 0) {
    process.stderr.write(
        `alternatives: --only "${only ?? ''}" matched none of the ${pricePairs.alternatives.length} pairs. ` +
            'Run with --list to see them.\n',
    );
    process.exit(1);
}

const run = runPricePairs([...pricePairs.controls, ...selected], pricePairs.catalogueOf);

process.exit(reportPriceRun(run, formatAlternativeReport, record));
