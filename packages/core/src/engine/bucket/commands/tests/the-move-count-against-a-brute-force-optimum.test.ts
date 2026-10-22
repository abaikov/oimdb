
import { oimOrderedListCommandsOfTransition } from '../utils/oimOrderedListCommandsOfTransition';
import type { TOIMEntitySlot } from '../../../../index';
import { applyOrderedListCommands, sameEntitySlotSequence } from '../../../../../tests/support/orderedListConsumer';

/** A minimal identity: only reference equality is ever read, as in its neighbours. */
const makeSlot = (id: number): TOIMEntitySlot =>
    ({ key: id } as unknown as TOIMEntitySlot);

/** Sizes stay under ten, so one digit per position is a faithful key. */
const permutationKey = (order: readonly number[]): string => order.join('');

/**
 * THE ORACLE: the true minimum number of single-item moves that turns any
 * permutation of `size` items into the ascending one.
 *
 * A move is `splice` out and `splice` in — the body of `applyOrderedListCommands`,
 * which is the consumer's half of the contract, so the oracle counts the same
 * operation the commands cost. That makes the edge relation symmetric (moving
 * item `i` to `j` is undone by moving it back), so ONE breadth-first search out
 * of the ascending permutation labels every permutation with its distance TO the
 * ascending one — the whole table, in one pass, rather than a search per case.
 *
 * It is exhaustive over the reachable set, and the reachable set is everything:
 * the table's size is asserted to be `size!` below.
 */
const minimumMoveTable = (size: number): Map<string, number> => {
    const identity: number[] = [];
    for (let i = 0; i < size; i++) identity.push(i);

    const distances = new Map<string, number>([[permutationKey(identity), 0]]);
    let frontier: number[][] = [identity];
    let depth = 0;

    while (frontier.length > 0) {
        depth++;
        const next: number[][] = [];
        for (const state of frontier) {
            for (let from = 0; from < size; from++) {
                for (let to = 0; to < size; to++) {
                    if (to === from) continue;
                    const moved = state.slice();
                    const [taken] = moved.splice(from, 1);
                    moved.splice(to, 0, taken);
                    const key = permutationKey(moved);
                    if (distances.has(key)) continue;
                    distances.set(key, depth);
                    next.push(moved);
                }
            }
        }
        frontier = next;
    }
    return distances;
};

/** One table per size, built once — the search is the expensive half of this file. */
const tables = new Map<number, Map<string, number>>();
const tableFor = (size: number): Map<string, number> => {
    let table = tables.get(size);
    if (table === undefined) {
        table = minimumMoveTable(size);
        tables.set(size, table);
    }
    return table;
};

const minimumMovesFor = (order: readonly number[]): number => {
    const found = tableFor(order.length).get(permutationKey(order));
    if (found === undefined) throw new Error(`no minimum recorded for [${order.join(', ')}]`);
    return found;
};

/**
 * THE SECOND ORACLE: the longest increasing subsequence, by trying every subset.
 *
 * Deliberately not a patience sort. The implementation's `collectAnchors` IS a
 * patience sort, and `what-the-ordered-list-diff-emits.test.ts` checks it against another one —
 * so a bug in the algorithm both sides share would agree with itself. Testing
 * 2^m subsets shares nothing with it but the definition.
 */
const longestIncreasingByExhaustion = (sequence: readonly number[]): number => {
    let longest = 0;
    for (let mask = 0; mask < (1 << sequence.length); mask++) {
        let length = 0;
        let previous = Number.NEGATIVE_INFINITY;
        let increasing = true;
        for (let i = 0; i < sequence.length; i++) {
            if ((mask & (1 << i)) === 0) continue;
            if (sequence[i] <= previous) { increasing = false; break; }
            previous = sequence[i];
            length++;
        }
        if (increasing && length > longest) longest = length;
    }
    return longest;
};

const factorial = (n: number): number => {
    let total = 1;
    for (let i = 2; i <= n; i++) total *= i;
    return total;
};

/** Positions rewritten as ranks 0…m−1, which is all the relative order is. */
const ranksOf = (values: readonly number[]): number[] => {
    const sorted = values.slice().sort((a, b) => a - b);
    return values.map(value => sorted.indexOf(value));
};

/** Numerical Recipes LCG, so a failure repeats from its printed seed. */
const createLcg = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return (): number => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
};

const shuffled = <T>(items: readonly T[], random: () => number): T[] => {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        const swap = copy[i];
        copy[i] = copy[j];
        copy[j] = swap;
    }
    return copy;
};

/** The largest common part the oracle can answer for — see the header. */
const LARGEST_COMMON = 7;

describe('the move count is the optimum, not merely a low one', () => {
    /**
     * THE THEOREM ITSELF, checked exhaustively and without the implementation in
     * the room: for every permutation of every length up to seven, the fewest
     * single-item moves that sort it is exactly `m − LIS`. If it is
     * false anywhere, the claim is wrong however good the code is; if it is
     * true, the only question left is whether the shipped diff achieves it —
     * which is the test below.
     */
    it.each([1, 2, 3, 4, 5, 6, 7])(
        'a permutation of %i needs exactly m − LIS moves, for every one of them', size => {
            const table = tableFor(size);
            expect(table.size).toBe(factorial(size));

            for (const [key, minimum] of table) {
                const order = key.split('').map(Number);
                const optimum = size - longestIncreasingByExhaustion(order);
                if (minimum !== optimum) {
                    throw new Error(
                        `[${order.join(', ')}]: the shortest script found by search takes ${minimum} ` +
                        `move(s), and m − LIS says ${optimum}. The formula the diff is built on is not ` +
                        'the optimum for this permutation.',
                    );
                }
            }
        },
    );

    /**
     * AND THE SHIPPED DIFF AGAINST IT. Random prev/next pairs — items leaving,
     * items arriving, and a common part in an arbitrary order — with the common
     * part bounded so the oracle can answer.
     *
     * Removals and insertions are forced: an item of `prev` that `next` does not
     * hold can only leave through a `remove`, and one that only `next` holds can
     * only arrive through an `insert`. So asserting those two counts exactly,
     * beside the moves being minimal, is the whole script being minimal.
     *
     * The reduction the oracle rests on is worth stating: inserting and removing
     * items never changes the relative order of the items that stay, so the
     * common items must be brought into their `next` order by moves alone, and
     * the problem is exactly the permutation problem the table above answers.
     */
    it.each([1, 7, 42, 1337, 20260820])(
        'emits exactly the minimum number of moves, 300 rounds (seed %i)', seed => {
            const random = createLcg(seed);
            const pool = Array.from({ length: 20 }, (_, i) => makeSlot(i));

            let sawAMove = false;
            let sawAnInsert = false;
            let sawARemoval = false;

            for (let round = 0; round < 300; round++) {
                const commonCount = Math.floor(random() * (LARGEST_COMMON + 1));
                const leavingCount = Math.floor(random() * 4);
                const arrivingCount = Math.floor(random() * 4);

                // Three disjoint slices, so what is common is common by
                // construction and the oracle is never asked a larger question
                // than it can answer.
                const common = pool.slice(0, commonCount);
                const leaving = pool.slice(10, 10 + leavingCount);
                const arriving = pool.slice(14, 14 + arrivingCount);

                const prev = shuffled([...common, ...leaving], random);
                const next = shuffled([...common, ...arriving], random);

                const commands = oimOrderedListCommandsOfTransition(prev, next);

                const moves = commands.filter(command => command.type === 'move').length;
                const removals = commands.filter(command => command.type === 'remove').length;
                const inserts = commands.filter(command => command.type === 'insert').length;

                const inPrevOrder = prev.filter(slot => next.includes(slot));
                const destinations = inPrevOrder.map(slot => next.indexOf(slot));
                const minimum = minimumMovesFor(ranksOf(destinations));

                const where =
                    `seed ${seed} round ${round}: prev=[${prev.map(slot => String((slot as unknown as { key: number }).key))}] ` +
                    `next=[${next.map(slot => String((slot as unknown as { key: number }).key))}]`;

                if (moves !== minimum) {
                    throw new Error(
                        `${where}: emitted ${moves} move(s) where the fewest possible is ${minimum}. ` +
                        'oimOrderedListCommandsOfTransition calls this count the mathematical optimum, and this case is ' +
                        'what entitles it to the word.',
                    );
                }
                if (removals !== leavingCount || inserts !== arrivingCount) {
                    throw new Error(
                        `${where}: emitted ${removals} removal(s) and ${inserts} insert(s) for ` +
                        `${leavingCount} departing and ${arrivingCount} arriving item(s). Anything more is a ` +
                        'command a consumer did not need; a remove-plus-insert in place of a move is how it ' +
                        'usually happens.',
                    );
                }
                // Minimal and wrong is the cheapest way to satisfy everything
                // above — the empty script is minimal for every input.
                const applied = applyOrderedListCommands(prev.slice(), commands);
                if (!sameEntitySlotSequence(applied, next)) {
                    throw new Error(`${where}: the script did not reproduce next.`);
                }

                sawAMove = sawAMove || moves > 0;
                sawAnInsert = sawAnInsert || inserts > 0;
                sawARemoval = sawARemoval || removals > 0;
            }

            // A run that never reordered anything would pass every assertion
            // above while proving nothing about the move count.
            expect(sawAMove).toBe(true);
            expect(sawAnInsert).toBe(true);
            expect(sawARemoval).toBe(true);
        },
    );

    /**
     * The case the formula is most often quoted for, stated in the open: a list
     * whose first item is dragged to the end. One item is out of order, so one
     * move is the optimum — and a diff that re-emitted every item it stepped
     * over would emit six.
     *
     * Seven items, and not a rounder ten, because the oracle is asked for the
     * minimum here too: a table for ten would be 3 628 800 permutations.
     */
    it('moves one item to describe one item moving', () => {
        const slots = Array.from({ length: LARGEST_COMMON }, (_, i) => makeSlot(i));
        const prev = slots.slice();
        const next = [...slots.slice(1), slots[0]];

        const commands = oimOrderedListCommandsOfTransition(prev, next);

        expect(commands).toHaveLength(1);
        expect(commands[0].type).toBe('move');
        expect(minimumMovesFor(ranksOf(prev.map(slot => next.indexOf(slot))))).toBe(1);
    });
});
