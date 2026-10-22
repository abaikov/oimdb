import { oimOrderedListCommandsOfTransition } from '../utils/oimOrderedListCommandsOfTransition';
import type { TOIMEntitySlot } from '../../../../index';
import { applyOrderedListCommands, sameEntitySlotSequence } from '../../../../../tests/support/orderedListConsumer';

/** Longest strictly-increasing subsequence length — the theoretical move optimum. */
function lisLength(sequence: readonly number[]): number {
    const tails: number[] = [];
    for (const value of sequence) {
        let low = 0, high = tails.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (tails[mid] < value) low = mid + 1; else high = mid;
        }
        if (low === tails.length) tails.push(value); else tails[low] = value;
    }
    return tails.length;
}

/** A minimal identity: only reference equality matters, nothing else is read. */
function makeSlot(id: number): TOIMEntitySlot {
    return { key: id } as unknown as TOIMEntitySlot;
}

/**
 * A tiny deterministic LCG (Numerical Recipes constants) so a property-test
 * failure is reproducible from the printed seed alone — no Math.random.
 */
function createLcg(seed: number): () => number {
    let state = seed >>> 0;
    return (): number => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function shuffle(items: TOIMEntitySlot[], random: () => number): TOIMEntitySlot[] {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        const swap = items[i]; items[i] = items[j]; items[j] = swap;
    }
    return items;
}

describe('what the ordered-list diff emits', () => {
    it('treats a reordered item as a move, never a remove+insert — identity is the slot itself', () => {
        const [a, b, c] = [makeSlot(1), makeSlot(2), makeSlot(3)];
        const prev = [a, b, c];
        const next = [c, a, b];

        const commands = oimOrderedListCommandsOfTransition(prev, next);

        expect(commands.every(c => c.type === 'move')).toBe(true);
        expect(commands.length).toBeGreaterThan(0);
        const applied = applyOrderedListCommands(prev.slice(), commands);
        expect(sameEntitySlotSequence(applied, next)).toBe(true);
    });

    it('diffs two empty lists into no commands', () => {
        expect(oimOrderedListCommandsOfTransition([], [])).toEqual([]);
    });

    it('diffs an empty prev against a populated next into pure inserts', () => {
        const [a, b] = [makeSlot(1), makeSlot(2)];
        const next = [a, b];

        const commands = oimOrderedListCommandsOfTransition([], next);

        expect(commands.every(c => c.type === 'insert')).toBe(true);
        expect(commands).toHaveLength(2);
        const applied = applyOrderedListCommands([], commands);
        expect(sameEntitySlotSequence(applied, next)).toBe(true);
    });

    it('diffs a populated prev against an empty next into pure removals', () => {
        const [a, b] = [makeSlot(1), makeSlot(2)];
        const prev = [a, b];

        const commands = oimOrderedListCommandsOfTransition(prev, []);

        expect(commands.every(c => c.type === 'remove')).toBe(true);
        expect(commands).toHaveLength(2);
        const applied = applyOrderedListCommands(prev.slice(), commands);
        expect(applied).toHaveLength(0);
    });

    it('produces pure appends when next only extends prev', () => {
        const [a, b, c] = [makeSlot(1), makeSlot(2), makeSlot(3)];
        const prev = [a, b];
        const next = [a, b, c];

        const commands = oimOrderedListCommandsOfTransition(prev, next);

        expect(commands).toEqual([{ type: 'insert', index: 2, slot: c }]);
        const applied = applyOrderedListCommands(prev.slice(), commands);
        expect(sameEntitySlotSequence(applied, next)).toBe(true);
    });

    it('produces pure removals when next drops a middle item and keeps the rest in order', () => {
        const [a, b, c] = [makeSlot(1), makeSlot(2), makeSlot(3)];
        const prev = [a, b, c];
        const next = [a, c];

        const commands = oimOrderedListCommandsOfTransition(prev, next);

        expect(commands).toEqual([{ type: 'remove', index: 1 }]);
        const applied = applyOrderedListCommands(prev.slice(), commands);
        expect(sameEntitySlotSequence(applied, next)).toBe(true);
    });

    it('produces pure reordering when the same slots change relative order', () => {
        const [a, b, c, d] = [makeSlot(1), makeSlot(2), makeSlot(3), makeSlot(4)];
        const prev = [a, b, c, d];
        const next = [d, b, a, c];

        const commands = oimOrderedListCommandsOfTransition(prev, next);

        expect(commands.every(c => c.type === 'move')).toBe(true);
        expect(commands.length).toBeGreaterThan(0);
        const applied = applyOrderedListCommands(prev.slice(), commands);
        expect(sameEntitySlotSequence(applied, next)).toBe(true);
    });

    it('produces a mix of inserts, removals and moves for an arbitrary change', () => {
        const [a, b, c, d, e] = [makeSlot(1), makeSlot(2), makeSlot(3), makeSlot(4), makeSlot(5)];
        const prev = [a, b, c, d];
        const next = [d, e, b, a];

        const commands = oimOrderedListCommandsOfTransition(prev, next);

        const types = new Set(commands.map(c => c.type));
        expect(types.has('insert')).toBe(true);
        expect(types.has('remove')).toBe(true);
        const applied = applyOrderedListCommands(prev.slice(), commands);
        expect(sameEntitySlotSequence(applied, next)).toBe(true);
    });

    it('inserts a mention for each place a next names the same slot', () => {
        const a = makeSlot(1);
        const next = [a, a];

        const commands = oimOrderedListCommandsOfTransition([], next);

        expect(commands).toEqual([
            { type: 'insert', index: 0, slot: a },
            { type: 'insert', index: 0, slot: a },
        ]);
        expect(sameEntitySlotSequence(applyOrderedListCommands([], commands), next)).toBe(true);
    });

    it('removes only the mention a shorter next has no place for', () => {
        const a = makeSlot(1);
        const prev = [a, a];

        const commands = oimOrderedListCommandsOfTransition(prev, [a]);

        expect(commands).toEqual([{ type: 'remove', index: 1 }]);
        expect(sameEntitySlotSequence(applyOrderedListCommands(prev.slice(), commands), [a])).toBe(true);
    });

    it('inserts beside the mention already there when next names one slot once more', () => {
        const a = makeSlot(1);
        const next = [a, a];

        const commands = oimOrderedListCommandsOfTransition([a], next);

        expect(commands).toEqual([{ type: 'insert', index: 1, slot: a }]);
        expect(sameEntitySlotSequence(applyOrderedListCommands([a], commands), next)).toBe(true);
    });

    it('places a slot named twice apart in the list at both of its places', () => {
        const [a, b] = [makeSlot(1), makeSlot(2)];
        const next = [a, b, a];

        const commands = oimOrderedListCommandsOfTransition([], next);

        expect(commands).toHaveLength(3);
        expect(sameEntitySlotSequence(applyOrderedListCommands([], commands), next)).toBe(true);
    });

    it('tells one mention of a slot from the other when the list also reorders', () => {
        const [a, b] = [makeSlot(1), makeSlot(2)];
        const prev = [a, b, a];
        const next = [b, a];

        const commands = oimOrderedListCommandsOfTransition(prev, next);

        expect(commands).toEqual([
            { type: 'remove', index: 2 },
            { type: 'move', from: 0, to: 1 },
        ]);
        expect(sameEntitySlotSequence(applyOrderedListCommands(prev.slice(), commands), next)).toBe(true);
    });

    /* Three identities and lists of up to six, so nearly every round names one of
     * them twice. The diff this replaced failed at round 1 of these 500. */
    it('reproduces a target whose slots repeat, over 500 seeded rounds', () => {
        const SEED = 0xD0FFED;
        const random = createLcg(SEED);
        const pool = [makeSlot(1), makeSlot(2), makeSlot(3)];
        const draw = (): TOIMEntitySlot[] => Array.from(
            { length: Math.floor(random() * 7) },
            () => pool[Math.floor(random() * pool.length)],
        );

        let carriedARepeat = 0;
        for (let round = 0; round < 500; round++) {
            const prev = draw();
            const next = draw();
            if (new Set(prev).size !== prev.length || new Set(next).size !== next.length) carriedARepeat++;

            const commands = oimOrderedListCommandsOfTransition(prev, next);

            const applied = applyOrderedListCommands(prev.slice(), commands);
            if (!sameEntitySlotSequence(applied, next)) {
                throw new Error(
                    `seed=${SEED} round=${round}: diff did not reproduce next. ` +
                    `prev=[${prev.map(s => (s as { key: number }).key)}] ` +
                    `next=[${next.map(s => (s as { key: number }).key)}] ` +
                    `applied=[${applied.map(s => (s as TOIMEntitySlot as { key: number }).key)}]`,
                );
            }
        }
        expect(carriedARepeat).toBeGreaterThan(400);
    });

    // The placement pass carries the index it last placed an item at forward, so
    // the item below it is placed without a second scan. An ANCHOR STEP places
    // nothing, and the anchors here — `a` and `b` — stand between the two items
    // that ARE placed, so a carry that survived them would hand `c` the index the
    // insert of `d` used, and `c` would land one place too far right. `prev` and
    // `next` are the smallest pair with that shape.
    it('places an item whose reference lies past an anchor step where the anchor is, not where the last placement landed', () => {
        const [a, b, c, d] = [makeSlot(1), makeSlot(2), makeSlot(3), makeSlot(4)];
        const prev = [a, b, c];
        const next = [c, a, b, d];

        const commands = oimOrderedListCommandsOfTransition(prev, next);

        expect(commands).toEqual([
            { type: 'insert', index: 3, slot: d },
            { type: 'move', from: 2, to: 0 },
        ]);
        const applied = applyOrderedListCommands(prev.slice(), commands);
        expect(sameEntitySlotSequence(applied, next)).toBe(true);
    });

    it('never emits a reset — that decision belongs to the stream, not the diff', () => {
        const slots = Array.from({ length: 10 }, (_, i) => makeSlot(i));
        const prev = slots.slice(0, 6);
        const next = slots.slice(4, 10).reverse();

        const commands = oimOrderedListCommandsOfTransition(prev, next);

        expect(commands.some(c => c.type === 'reset')).toBe(false);
    });

    it('reproduces the target exactly and never exceeds the optimal move count, over 500 seeded rounds', () => {
        const SEED = 0xC0FFEE;
        const random = createLcg(SEED);
        const pool = Array.from({ length: 16 }, (_, i) => makeSlot(i));
        const ROUNDS = 500;

        for (let round = 0; round < ROUNDS; round++) {
            const prevSize = 4 + Math.floor(random() * 10);
            const nextSize = 4 + Math.floor(random() * 10);
            const prev = shuffle(pool.slice(0, prevSize), random);
            const next = shuffle(pool.slice(0, nextSize), random);

            const commands = oimOrderedListCommandsOfTransition(prev, next);

            // (1) Applying the commands to prev reproduces next exactly, by identity.
            const applied = applyOrderedListCommands(prev.slice(), commands);
            if (!sameEntitySlotSequence(applied, next)) {
                throw new Error(
                    `seed=${SEED} round=${round}: diff did not reproduce next. ` +
                    `prev=[${prev.map(s => (s as { key: number }).key)}] ` +
                    `next=[${next.map(s => (s as { key: number }).key)}] ` +
                    `applied=[${applied.map(s => (s as TOIMEntitySlot as { key: number }).key)}]`,
                );
            }

            // (2) Move count never exceeds the theoretical optimum: common − LIS.
            const moves = commands.filter(c => c.type === 'move').length;
            const common = prev.filter(s => next.indexOf(s) >= 0);
            const optimum = common.length - lisLength(common.map(s => next.indexOf(s)));
            if (moves > optimum) {
                throw new Error(
                    `seed=${SEED} round=${round}: ${moves} moves exceeds optimum ${optimum}. ` +
                    `prev=[${prev.map(s => (s as { key: number }).key)}] ` +
                    `next=[${next.map(s => (s as { key: number }).key)}]`,
                );
            }

            // Reiterate the "never a reset" guarantee across the whole property run.
            if (commands.some(c => c.type === 'reset')) {
                throw new Error(`seed=${SEED} round=${round}: diff emitted a reset`);
            }
        }
    });
});
