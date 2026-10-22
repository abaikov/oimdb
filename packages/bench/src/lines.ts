import { participantCodeVolumes } from './lines/participantCodeVolume';
import { WIRING_SHAPES } from './lines/wiringCodeVolume';

const argv = process.argv.slice(2);
const wantDeclarations = argv.includes('--functions');
const adapterAt = argv.indexOf('--adapter');
const only = adapterAt >= 0 ? argv[adapterAt + 1] : undefined;

const volumes = participantCodeVolumes().filter(volume => only === undefined || volume.participant === only);
const pad = (value: string | number, width: number): string => String(value).padStart(width);
const shortOf = (shape: string): string => shape.replace('churn.', 'c.').replace('reads.', 'r.').slice(0, 9);

const write = (...lines: string[]): void => {
    for (const line of lines.length === 0 ? [''] : lines) process.stdout.write(`${line}\n`);
};

write('');
write('CODE LINES A TASK NEEDS — per participant and wiring shape, comments and blanks excluded');
write('');
write(['participant'.padEnd(20), ...WIRING_SHAPES.map(shape => pad(shortOf(shape), 10))].join(''));
for (const volume of volumes) {
    const cells = WIRING_SHAPES.map(shape => {
        const found = volume.shapes.find(entry => entry.shape === shape);
        return pad(found === undefined ? '·' : found.codeLines, 10);
    });
    write([volume.participant.padEnd(20), ...cells].join(''));
}

if (wantDeclarations) {
    for (const volume of volumes) {
        write('', `${volume.participant} (${volume.file})`);
        for (const entry of volume.shapes) write(`  ${entry.shape} ${entry.codeLines}: ${entry.declarations.join(', ')}`);
    }
}

write('');
write('A cell is every line reachable from that wiring: its builder, every helper it calls (shared helpers');
write('counted whole, because the task needs them whole), the constants it reads — and NOT the methods only');
write("another shape uses (a row mount does not pay for the chain's code). `·` = the wiring is declined.");
write('Lines are counted after the file is re-printed in one canonical layout (TypeScript printer, every block');
write('and object literal one member per line, comments dropped), so how an adapter is wrapped changes nothing.');
write('Every scenario is charged the cell of the shape it is driven through. Fewer lines is not better on its');
write('own: read it beside the time, never instead of it.');
write('');
