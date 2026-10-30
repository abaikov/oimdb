import { OIM_MAX_DIFF_SCRATCH_SLOTS } from '../constants/OIM_MAX_DIFF_SCRATCH_SLOTS';
import type { TOIMOrderedListCommand } from '../types/TOIMOrderedListCommand';
import type { TOIMSlot } from '../../../slot/types/TOIMSlot';


let indexInNext = new Map<TOIMSlot, number>();
let occurrenceAfter: Int32Array<ArrayBufferLike> = new Int32Array(0);
let removedPrevIndices: Int32Array<ArrayBufferLike> = new Int32Array(0);
let futureBucketIndices: Int32Array<ArrayBufferLike> = new Int32Array(0);
let predecessor: Int32Array<ArrayBufferLike> = new Int32Array(0);
let tails: Int32Array<ArrayBufferLike> = new Int32Array(0);
let anchors: Int32Array<ArrayBufferLike> = new Int32Array(0);

function scratchFor(buffer: Int32Array<ArrayBufferLike>, count: number): Int32Array<ArrayBufferLike> {
    if (buffer.length < count) return new Int32Array(Math.max(count, buffer.length * 2));
    if (buffer.length > OIM_MAX_DIFF_SCRATCH_SLOTS && buffer.length > count * 2) return new Int32Array(count);
    return buffer;
}

function currentPositionOfFutureBucketIndex(
    futureBucketIndices: Int32Array<ArrayBufferLike>, futureBucketIndex: number, futureBucketIndicesLength: number,
): number {
    for (let i = 0; i < futureBucketIndicesLength; i++) if (futureBucketIndices[i] === futureBucketIndex) return i;
    return -1;
}

export function oimOrderedListCommandsOfTransition(
    prev: readonly TOIMSlot[],
    next: readonly TOIMSlot[],
    maxCommandsPerSlot?: number,
): TOIMOrderedListCommand[] {
    const commands: TOIMOrderedListCommand[] = [];

    if (indexInNext.size > OIM_MAX_DIFF_SCRATCH_SLOTS) indexInNext = new Map<TOIMSlot, number>();
    else indexInNext.clear();
    occurrenceAfter = scratchFor(occurrenceAfter, next.length);
    for (let j = next.length - 1; j >= 0; j--) {
        const later = indexInNext.get(next[j]);
        occurrenceAfter[j] = later === undefined ? -1 : later;
        indexInNext.set(next[j], j);
    }

    removedPrevIndices = scratchFor(removedPrevIndices, prev.length);
    futureBucketIndices = scratchFor(futureBucketIndices, next.length);
    let keptCount = 0;
    let droppedCount = 0;
    for (let i = 0; i < prev.length; i++) {
        const slot = prev[i];
        const at = indexInNext.get(slot);
        if (at === undefined || at === -1) { removedPrevIndices[droppedCount++] = i; continue; }
        indexInNext.set(slot, occurrenceAfter[at]);
        futureBucketIndices[keptCount++] = at;
    }
    for (let d = droppedCount - 1; d >= 0; d--) commands.push({ type: 'remove', index: removedPrevIndices[d] });

    anchors = scratchFor(anchors, keptCount);
    const anchorCount = collectAnchors(futureBucketIndices, keptCount, anchors);

    if (maxCommandsPerSlot !== undefined
        && commands.length + next.length - anchorCount > maxCommandsPerSlot *Math.max(next.length, 1)) {
        return [{ type: 'reset', slots: next.slice() }];
    }

    let futureBucketIndicesLength = keptCount;
    let anchor = 0;
    let placedAt = -1;
    for (let j = next.length - 1; j >= 0; j--) {
        if (anchor < anchorCount && anchors[anchor] === j) { anchor++; placedAt = -1; continue; }
        const reference = placedAt >= 0 ? placedAt
            : j + 1 < next.length
                ? currentPositionOfFutureBucketIndex(futureBucketIndices, j + 1, futureBucketIndicesLength)
                : futureBucketIndicesLength;
        const at = currentPositionOfFutureBucketIndex(futureBucketIndices, j, futureBucketIndicesLength);
        if (at === -1) {
            commands.push({ type: 'insert', index: reference, slot: next[j] });
            futureBucketIndices.copyWithin(reference + 1, reference, futureBucketIndicesLength);
            futureBucketIndices[reference] = j;
            futureBucketIndicesLength++;
            placedAt = reference;
            continue;
        }
        const to = at < reference ? reference - 1 : reference;
        placedAt = to;
        if (at === to) continue;
        commands.push({ type: 'move', from: at, to });
        if (to < at) futureBucketIndices.copyWithin(to + 1, to, at);
        else futureBucketIndices.copyWithin(at, at + 1, to + 1);
        futureBucketIndices[to] = j;
    }
    return commands;
}

function collectAnchors(
    sequence: Int32Array<ArrayBufferLike>, count: number, anchorBuffer: Int32Array<ArrayBufferLike>,
): number {
    if (count === 0) return 0;
    predecessor = scratchFor(predecessor, count);
    tails = scratchFor(tails, count);
    let tailCount = 0;
    for (let i = 0; i < count; i++) {
        let low = 0;
        let high = tailCount;
        while (low < high) {
            const middle = (low + high) >> 1;
            if (sequence[tails[middle]] < sequence[i]) low = middle + 1;
            else high = middle;
        }
        predecessor[i] = low > 0 ? tails[low - 1] : -1;
        tails[low] = i;
        if (low === tailCount) tailCount++;
    }
    let found = 0;
    for (let k = tails[tailCount - 1]; k !== -1; k = predecessor[k]) anchorBuffer[found++] = sequence[k];
    return found;
}