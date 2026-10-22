import type { TOIMSlot, TOIMOrderedListCommand } from '../../src/index';

/**
 * The consumer's half of the command contract.
 *
 * A real consumer applies commands to its own structure — DOM nodes, a store, a
 * list of views. Here it is an array, which is enough to prove the only thing
 * the engine promises: applying the script to the list you were last handed
 * reproduces the new list exactly, BY IDENTITY. A stream that diffs against
 * what it believes it last handed out has no way back once the two disagree, so
 * a test that compares by value would let a whole class of drift through.
 */
export const applyOrderedListCommands = (
    list: TOIMSlot[],
    commands: readonly TOIMOrderedListCommand[],
): TOIMSlot[] => {
    for (const orderedListCommand of commands) {
        if (orderedListCommand.type === 'remove') { list.splice(orderedListCommand.index, 1); continue; }
        if (orderedListCommand.type === 'insert') { list.splice(orderedListCommand.index, 0, orderedListCommand.slot); continue; }
        if (orderedListCommand.type === 'reset') { list.length = 0; list.push(...orderedListCommand.slots); continue; }
        const [moved] = list.splice(orderedListCommand.from, 1);
        list.splice(orderedListCommand.to, 0, moved);
    }
    return list;
};

/** Identity, not value — see above. */
export const sameEntitySlotSequence = (
    leftEntitySlots: readonly TOIMSlot[],
    rightEntitySlots: readonly TOIMSlot[],
): boolean => {
    if (leftEntitySlots.length !== rightEntitySlots.length) return false;
    for (let i = 0; i < leftEntitySlots.length; i++) if (leftEntitySlots[i] !== rightEntitySlots[i]) return false;
    return true;
};
