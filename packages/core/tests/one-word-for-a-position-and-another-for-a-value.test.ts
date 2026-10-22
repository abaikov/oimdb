/**
 * "DISPLACED" MEANS A POSITION AND NOTHING ELSE — and this file is what keeps it so.
 *
 * The word had two senses in this package and they are not related:
 *
 *   - A POSITION DISPLACED. A slot sits at index 3 and now sits at index 7.
 *     `moveSlot`, `moveSlotRange`, `outOfPlaceBucketMemberSlots`, `markSlotUnsorted`. This is the
 *     sense the word keeps.
 *   - A VALUE DISPLACED, meaning it CHANGED. "Told by the engine that this identity
 *     displaced", "has anything I read displaced", "what moved this frame". Nothing about
 *     a position; this is the sense that must say `changed`.
 *
 * WHY A TEST AND NOT A NOTE. A note was written, and the word surfaced twice more
 * in one afternoon — once in a variable name, once in prose. A rule with no
 * owner is not a rule, and the enforcement has to be something that runs.
 *
 * WHY IT CANNOT BE ONE `replace`. Half the occurrences are correct. A sweep over
 * the word breaks the positional half, which is the only half that earns it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', 'src');

/**
 * The files where the word means A POSITION, and is therefore right.
 *
 * Every one of these is about where a slot SITS in a list: the settle, the
 * script that renders a reorder, the bucket commands, and the
 * ordered service whose `markSlotUnsorted` asks whether a sort
 * KEY displaced — a question about placement, answered by re-placing.
 *
 * A file joins this list only by being about placement. It does NOT join it for
 * containing one stray sentence; that sentence gets fixed instead.
 */
const THE_WORD_MEANS_A_POSITION: readonly string[] = [
    'engine/bucket/commands/utils/oimOrderedListCommandsOfTransition.ts',
    // `engine/bucket/array/OIMBucketArrayMembershipUnique.ts` is NOT on this list
    // and does not need to be: it keeps no order, so it has no occasion to use
    // the word at all.
    'engine/bucket/array/types/TOIMBucketSlotsArrayStore.ts',
    'engine/bucket/commands/types/TOIMOrderedListCommand.ts',
    'facade/bucket/OIMBucketCommands.ts',
];

/** As whole words, never inside others. */
const THE_WORD = /\b(moved?|moves|movers?)\b/gi;

const sourceFiles = (): string[] => {
    const found: string[] = [];
    const walk = (dir: string): void => {
        for (const name of readdirSync(dir)) {
            if (name === 'tests') continue;
            const path = join(dir, name);
            if (statSync(path).isDirectory()) walk(path);
            else if (path.endsWith('.ts')) found.push(path);
        }
    };
    walk(SRC);
    return found.sort();
};

/**
 * How many times a file says it, and on which lines. Counted rather than merely
 * detected, so a file can be seen to have gone to zero.
 */
const saysIt = (path: string): { count: number; lines: number[] } => {
    const lines = readFileSync(path, 'utf8').split('\n');
    const at: number[] = [];
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
        const found = lines[i].match(THE_WORD);
        if (found === null) continue;
        count += found.length;
        at.push(i + 1);
    }
    return { count, lines: at };
};

describe('one word for a position and another for a value', () => {
    it('names every file on the allow-list, so the list cannot outlive the files', () => {
        const missing = THE_WORD_MEANS_A_POSITION
            .filter((short) => !sourceFiles().some((path) => path.endsWith(short)));
        // A list naming a file that has left the tree is how an allow-list turns
        // into an exemption nobody reads.
        expect(missing).toEqual([]);
    });

    it('uses the word only where it means a position', () => {
        const owed: string[] = [];
        for (const path of sourceFiles()) {
            const short = path.slice(SRC.length + 1);
            if (THE_WORD_MEANS_A_POSITION.includes(short)) continue;
            const { count, lines } = saysIt(path);
            if (count === 0) continue;
            owed.push(`${short}: ${count} at ${lines.slice(0, 6).join(', ')}${lines.length > 6 ? ' …' : ''}`);
        }
        // Each line is a file where the word means "this value changed".
        expect(owed).toEqual([]);
    });
});
