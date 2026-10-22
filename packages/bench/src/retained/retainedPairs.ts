import { retainedControls } from './retainedControls';
import { retainedPairsChangedFields } from './retainedPairsChangedFields';
import { retainedPairsDerivations } from './retainedPairsDerivations';
import type { TRetainedPair } from './TRetainedPair';

/**
 * THE CATALOGUE — every retention this suite measures, plus the three controls
 * that have to pass before any of it counts.
 *
 * ENUMERATED FROM THE CLAIMS AND NOT FROM THE CODE, unlike `pricePairs`, which
 * covers a public surface. This table exists to settle sentences that had nothing
 * behind them: two already-published ones — one in a source comment, one in a
 * public option's documentation — and the clock fork, whose deciding quantity is
 * bytes and whose only recorded figures are times.
 *
 * WHICH ENGINE EACH FAMILY IS ABOUT. `derivations` measures `packages/core`, the
 * shipped engine. `changed-fields` measures `packages/core-legacy`, and that is
 * NOT a leftover: the option it prices is a legacy option, the sentence it settles
 * is in legacy source, and that package is a measured row of the timing report
 * (`adapters/oimdb-legacy.ts`). A catalogue holding only the legacy family is the
 * failure this split prevents — `npm run retained` then weighs nothing that ships.
 *
 * WHAT IS DELIBERATELY NOT HERE, so the absence is a decision:
 *
 *   - The current engine's per-column identities (`slot.columnSlotStore`) — uncosted, and
 *     the next pair to add now that the shipped engine is in this catalogue at all.
 *   - A derivation whose value is a LIST of slots, which is what
 *     `createOIMComputedServiceBucketMemo` produces and what a consumer of this
 *     engine most often holds. The
 *     `derivations` rows keep a number on purpose, so that they are about the
 *     derivation rather than about the array inside it; the list shape is a
 *     separate row and its figure would be dominated by the list.
 *   - `OIM_SLOTS_A_SHARED_BUFFER_KEEPS_AT_MOST` (32) and
 *     `OIM_MAX_DIFF_SCRATCH_SLOTS` (4096). The SHAPE of the
 *     trade transfers between them; the numbers do not, and a row copied from one
 *     to the other would produce tables that look independent and are not.
 *   - Bundle size, which wants a build-and-diff of minified, gzipped bytes.
 *
 * The controls are NOT part of `measured` and are never ranked with it: a control
 * ranked among claims would be a claim.
 */
export const retainedPairs: {
    readonly controls: readonly TRetainedPair[];
    readonly measured: readonly TRetainedPair[];
    readonly byId: (id: string) => TRetainedPair | undefined;
} = (() => {
    // The shipped engine first: a reader opening the report should meet the
    // package this repository is before the one it replaced.
    const measured: readonly TRetainedPair[] = [
        ...retainedPairsDerivations,
        ...retainedPairsChangedFields,
    ];
    const everything = [...retainedControls, ...measured];

    // The id is what a reader quotes, so two pairs sharing one would let two
    // different measurements be published under one name.
    const seen = new Set<string>();
    for (const pair of everything) {
        if (seen.has(pair.id)) throw new Error(`retained: two pairs share the id "${pair.id}"`);
        seen.add(pair.id);
        if (pair.caveat.trim().length === 0) {
            throw new Error(
                `retained: the pair "${pair.id}" has no caveat. A memory delta is a subtraction of ` +
                    'two whole-process numbers, so everything that differs between the two arms is ' +
                    'inside it; a blank caveat is a claim that has not been checked rather than one ' +
                    'that came out clean.',
            );
        }
    }

    const byId = new Map<string, TRetainedPair>();
    for (const pair of everything) byId.set(pair.id, pair);

    return {
        controls: retainedControls,
        measured,
        byId: (id: string) => byId.get(id),
    };
})();
