import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { oimOrderedListCommandsOfTransition } from '../utils/oimOrderedListCommandsOfTransition';
import { OIM_MAX_DIFF_SCRATCH_SLOTS } from '../constants/OIM_MAX_DIFF_SCRATCH_SLOTS';
import { applyOrderedListCommands, sameEntitySlotSequence } from '../../../../../tests/support/orderedListConsumer';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';
import type { TOIMOrderedListCommand } from '../types/TOIMOrderedListCommand';

const SRC = join(__dirname, '..', '..', '..', '..');

const makeSlot = (key: number): TOIMEntitySlot => ({ key } as unknown as TOIMEntitySlot);

const slotsNumbering = (count: number, from = 0): TOIMEntitySlot[] =>
    Array.from({ length: count }, (_, at) => makeSlot(from + at));

const sourceFilesNaming = (name: string): string[] => {
    const found: string[] = [];
    const walk = (directory: string): void => {
        for (const entry of readdirSync(directory)) {
            if (entry === 'tests') continue;
            const path = join(directory, entry);
            if (statSync(path).isDirectory()) walk(path);
            else if (path.endsWith('.ts') && readFileSync(path, 'utf8').includes(name)) found.push(path);
        }
    };
    walk(SRC);
    return found.map(path => path.slice(SRC.length + 1).split('\\').join('/')).sort();
};

const [a, b, c, d] = slotsNumbering(4, 1_000_000);
const SMALL_PREV = [a, b, c];
const SMALL_NEXT = [c, a, d];

const theSmallDiff = (): readonly TOIMOrderedListCommand[] => {
    const commands = oimOrderedListCommandsOfTransition(SMALL_PREV, SMALL_NEXT);
    expect(sameEntitySlotSequence(applyOrderedListCommands(SMALL_PREV.slice(), commands), SMALL_NEXT)).toBe(true);
    return commands;
};

describe('what bounds the scratch the list diff shares', () => {
    it('names the scratch in every line it bounds, and bounds nothing else under src', () => {
        const lines = readFileSync(join(__dirname, '..', 'utils', 'oimOrderedListCommandsOfTransition.ts'), 'utf8')
            .split('\n')
            .filter(line => line.includes('OIM_MAX_DIFF_SCRATCH_SLOTS') && !line.startsWith('import'));

        expect(lines).toHaveLength(2);
        expect(lines.filter(line => !/Int32Array|Map</.test(line))).toEqual([]);
        expect(sourceFilesNaming('OIM_MAX_DIFF_SCRATCH_SLOTS')).toEqual([
            'engine/bucket/commands/constants/OIM_MAX_DIFF_SCRATCH_SLOTS.ts',
            'engine/bucket/commands/utils/oimOrderedListCommandsOfTransition.ts',
        ]);
    });

    it('bounds a command script from its own constant and from the one door that reads it', () => {
        expect(sourceFilesNaming('OIM_MAX_COMMANDS_PER_SLOT')).toEqual([
            'engine/bucket/commands/constants/OIM_MAX_COMMANDS_PER_SLOT.ts',
            'facade/bucket/OIMBucketCommands.ts',
        ]);
    });

    it('answers a small diff the same before and after one grown to exactly the slots it keeps', () => {
        const before = theSmallDiff();

        const atTheBound = slotsNumbering(OIM_MAX_DIFF_SCRATCH_SLOTS);
        expect(oimOrderedListCommandsOfTransition(atTheBound, atTheBound.slice())).toEqual([]);

        expect(theSmallDiff()).toEqual(before);
    });

    it('answers a small diff the same before and after one grown past the slots it keeps', () => {
        const before = theSmallDiff();

        const pastTheBound = slotsNumbering(OIM_MAX_DIFF_SCRATCH_SLOTS + 1);
        expect(oimOrderedListCommandsOfTransition(pastTheBound, pastTheBound.slice())).toEqual([]);

        expect(theSmallDiff()).toEqual(before);
    });

    it('diffs a list past the bound against a changed one, and the small diff after it', () => {
        const pastTheBound = slotsNumbering(OIM_MAX_DIFF_SCRATCH_SLOTS + 1);
        const moved = [pastTheBound[pastTheBound.length - 1], ...pastTheBound.slice(0, -1)];

        const commands = oimOrderedListCommandsOfTransition(pastTheBound, moved);

        expect(commands).toEqual([{ type: 'move', from: pastTheBound.length - 1, to: 0 }]);
        expect(sameEntitySlotSequence(applyOrderedListCommands(pastTheBound.slice(), commands), moved)).toBe(true);
        theSmallDiff();
    });
});
