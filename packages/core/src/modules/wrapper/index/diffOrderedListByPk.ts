import { TOIMPk } from '../../../types/TOIMPk';
import { TOIMOrderedListCommand } from './TOIMOrderedListCommand';

/**
 * Diff two ordered lists of pk-identified items into position-addressed
 * commands (`insert` / `remove` / `move`) that transform `prev` into `next`.
 *
 * Identity is `item.pk`; content is not compared (a reordered same-pk item is a
 * `move`, never recreated). Correctness is by construction: commands are emitted
 * against a working copy that mirrors what a consumer applying them holds, so
 * `applyCommands(prev, diffOrderedListByPk(prev, next))` equals `next` by pk.
 *
 * Moves are minimal. A longest-increasing-subsequence pass finds the common
 * items already in relative order — those stay; every other common item moves
 * exactly once, so the move count is `commonCount − LIS` (the optimum). This is
 * the standard keyed reconciliation used by imperative DOM renderers: each
 * non-anchor item is placed immediately before the already-positioned item to
 * its right (`next[j + 1]`), processed right → left.
 *
 * It intentionally does NOT emit `reset`; callers decide when a whole reset is
 * cheaper (see `OIMOrderedListCommandStreamDiffDriven`). Complexity is O(n·m)
 * worst case (an index scan per placed item), acceptable for the moderate bucket
 * sizes indexes produce, where it runs only on an actual change.
 */
export function diffOrderedListByPk<
    TPk extends TOIMPk,
    TItem extends { pk: TPk },
>(
    prev: readonly TItem[],
    next: readonly TItem[]
): TOIMOrderedListCommand<TItem>[] {
    const commands: TOIMOrderedListCommand<TItem>[] = [];
    const working = prev.slice();

    // 1) Removals — drop pks absent from `next`, high index → low so earlier
    //    indices stay valid as we splice.
    const nextPks = new Set<TPk>();
    for (let i = 0; i < next.length; i++) nextPks.add(next[i].pk);
    for (let i = working.length - 1; i >= 0; i--) {
        if (!nextPks.has(working[i].pk)) {
            commands.push({ type: 'remove', index: i });
            working.splice(i, 1);
        }
    }
    // `working` now holds exactly the common items, in `prev` order.

    // 2) Anchors — common items whose relative order already matches `next`
    //    (the LIS of their `working` positions taken in `next` order). Anchors
    //    are never moved; everything else moves exactly once.
    const workingPos = new Map<TPk, number>();
    for (let i = 0; i < working.length; i++) workingPos.set(working[i].pk, i);

    const commonNextJ: number[] = []; // positions j in `next` of common items
    const seq: number[] = []; // their positions in `working`
    for (let j = 0; j < next.length; j++) {
        const p = workingPos.get(next[j].pk);
        if (p !== undefined) {
            commonNextJ.push(j);
            seq.push(p);
        }
    }
    const anchorJ = new Set<number>();
    for (const s of longestIncreasingSubsequence(seq)) {
        anchorJ.add(commonNextJ[s]);
    }

    // 3) Place right → left. Each non-anchor item (new, or a moved common) goes
    //    immediately before `next[j + 1]`, which is already in place; anchors are
    //    left untouched — the placements around them shift them into position.
    for (let j = next.length - 1; j >= 0; j--) {
        if (anchorJ.has(j)) continue;

        const target = next[j];
        const refIdx =
            j + 1 < next.length
                ? indexByPk(working, next[j + 1].pk)
                : working.length;
        const p = indexByPk(working, target.pk);

        if (p === -1) {
            commands.push({ type: 'insert', index: refIdx, item: target });
            working.splice(refIdx, 0, target);
        } else {
            const to = p < refIdx ? refIdx - 1 : refIdx;
            if (p !== to) {
                commands.push({ type: 'move', from: p, to });
                working.splice(p, 1);
                working.splice(to, 0, target);
            }
        }
    }

    return commands;
}

function indexByPk<TPk extends TOIMPk, TItem extends { pk: TPk }>(
    items: readonly TItem[],
    pk: TPk
): number {
    for (let i = 0; i < items.length; i++) {
        if (items[i].pk === pk) return i;
    }
    return -1;
}

/**
 * Indices into `seq` forming a longest strictly-increasing subsequence
 * (O(n log n) patience sorting with predecessor links). `seq` values are
 * distinct here (each pk maps to one position), so "strictly" is exact.
 */
function longestIncreasingSubsequence(seq: readonly number[]): number[] {
    const n = seq.length;
    if (n === 0) return [];

    const predecessor = new Array<number>(n).fill(-1);
    // tails[k] = index into `seq` of the smallest tail of an increasing
    // subsequence of length k + 1.
    const tails: number[] = [];

    for (let i = 0; i < n; i++) {
        let lo = 0;
        let hi = tails.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (seq[tails[mid]] < seq[i]) lo = mid + 1;
            else hi = mid;
        }
        if (lo > 0) predecessor[i] = tails[lo - 1];
        if (lo === tails.length) tails.push(i);
        else tails[lo] = i;
    }

    const result: number[] = [];
    let k = tails[tails.length - 1];
    while (k !== -1) {
        result.push(k);
        k = predecessor[k];
    }
    result.reverse();
    return result;
}
