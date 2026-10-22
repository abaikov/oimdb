import { alternativePairsClock } from './alternativePairsClock';
import { alternativePairsComputedDedup } from './alternativePairsComputedDedup';
import { alternativePairsDispatch } from './alternativePairsDispatch';
import { alternativePairsEffectShape } from './alternativePairsEffectShape';
import { alternativePairsFrameDedup } from './alternativePairsFrameDedup';
import { alternativePairsIdentityStore } from './alternativePairsIdentityStore';
import { alternativePairsIndex } from './alternativePairsIndex';
import { alternativePairsLegacyPosts } from './alternativePairsLegacyPosts';
import { alternativePairsMutator } from './alternativePairsMutator';
import { alternativePairsMemo } from './alternativePairsMemo';
import { alternativePairsSettle } from './alternativePairsSettle';
import { alternativePairsSlotShape } from './alternativePairsSlotShape';
import { alternativePairsSlotLayout } from './alternativePairsSlotLayout';
import { alternativePairsLayerHop } from './alternativePairsLayerHop';
import { alternativePairsBucketCoalescing } from './alternativePairsBucketCoalescing';
import { alternativePairsSubscription } from './alternativePairsSubscription';
import { alternativePairsWritePath } from './alternativePairsWritePath';
import { alternativePairsWriteGuards } from './alternativePairsWriteGuards';
import { alternativePairsUpdateLadder } from './alternativePairsUpdateLadder';
import { alternativePairsRemoveLadder } from './alternativePairsRemoveLadder';
import { alternativePairsInsertLadder } from './alternativePairsInsertLadder';
import { alternativePairsInsertDoorLadder } from './alternativePairsInsertDoorLadder';
import { alternativePairsUpdateDoor } from './alternativePairsUpdateDoor';
import { alternativePairsUpdateByKeyLadder } from './alternativePairsUpdateByKeyLadder';
import { checkCaveatFigures } from './checkCaveatFigures';
import { PRICE_CATALOGUE_EXPORT_NAMES } from './priceCatalogueExportNames';
import { priceControls } from './priceControls';
import { pricePairsBucketAdds } from './pricePairsBucketAdds';
import { pricePairsReleaseAfterIdle } from './pricePairsReleaseAfterIdle';
import { pricePairsChainDepth } from './pricePairsChainDepth';
import { pricePairsDeclare } from './pricePairsDeclare';
import { pricePairsGraphShape } from './pricePairsGraphShape';
import { pricePairsGrouped } from './pricePairsGrouped';
import { pricePairsFrame } from './pricePairsFrame';
import { pricePairsInsertGap } from './pricePairsInsertGap';
import { pricePairsRead } from './pricePairsRead';
import { pricePairsSweep } from './pricePairsSweep';
import { pricePairsWrite } from './pricePairsWrite';
import type { TPricePair } from './TPricePair';

/**
 * WHAT AN ALTERNATIVE'S ID BEGINS WITH, and the one thing that tells the two
 * catalogues apart mechanically rather than by which array a pair was spread
 * into. See the check below.
 */
const ALTERNATIVE_PREFIX = 'alt.';

/**
 * THE CATALOGUE — every operation this suite prices, grouped by the path it sits
 * on, plus the two controls that have to pass before any of it counts.
 *
 * ENUMERATED FROM `packages/core/src/index.ts` AND NOT FROM MEMORY — that is
 * where a reviewer checks it. Everything exported as a TYPE only is named rather
 * than called, and has no price of its own.
 *
 * WHAT IS DELIBERATELY NOT HERE, so the absence is a decision, not an oversight:
 *
 *   - `upsertEntities`, `deleteEntities` and `deleteEntitiesByKeys` are loops
 *     over calls that ARE priced; pricing them prints one number under two names.
 *   - The ordered bucket service has no primitive floor here, but IS measured in
 *     the ALTERNATIVES catalogue against the unordered service at four bucket
 *     sizes — the comparison the documentation asks a reader to make.
 *
 * The controls are NOT part of `priced` and are never sorted with it. A control
 * ranked among prices would be a price.
 */
export const pricePairs: {
    readonly controls: readonly TPricePair[];
    readonly priced: readonly TPricePair[];
    readonly alternatives: readonly TPricePair[];
    readonly byId: (id: string) => TPricePair | undefined;
    readonly catalogueOf: (id: string) => string | undefined;
} = (() => {
    const priced: readonly TPricePair[] = [
        ...pricePairsWrite,
        ...pricePairsRead,
        ...pricePairsFrame,
        ...pricePairsDeclare,
        /**
         * THE FIRST LOAD, TAKEN APART. Every row puts one PART of our insert path
         * against the same body without that part, so a scenario gap is
         * attributed by subtraction rather than quoted as a multiple. Its header
         * says which row has a meaningful ratio (one) and which read as a
         * difference in ns per row (the rest).
         */
        ...pricePairsInsertGap,
        /**
         * THE STRATEGY SWEEP, IN `priced` RATHER THAN BESIDE IT. Every arm is
         * SHIPPED — nothing here is rejected, so it is not `alternatives`.
         * Several rows share one task and one floor and differ only in which
         * strategies the population was built with, so a task's rows are read
         * against EACH OTHER as well as against the floor, and a row read alone
         * answers nothing. See `pricePairsSweep.ts`'s header first.
         */
        ...pricePairsSweep,
        /**
         * A ROW AT SEVERAL ADDRESSES, AT A CHAIN ADDRESS AND AT A COMPOSITE ONE.
         * That file's header says what each floor does LESS than the call it
         * stands against.
         */
        ...pricePairsGrouped,
        /**
         * WHAT ONE MORE LINK OF THE WRITE CHAIN COSTS. Both arms are ours and
         * the rows read as a difference in ns per write, as `pricePairsInsertGap`
         * does; see that file's header for why a ratio over a shared constant
         * says more about the constant than about the difference.
         */
        ...pricePairsChainDepth,
        ...pricePairsBucketAdds,
        ...pricePairsReleaseAfterIdle,
        ...pricePairsGraphShape,
    ];
    /**
     * THE OTHER CATALOGUE, AND IT IS READ THE OTHER WAY UP. An ALTERNATIVES pair
     * puts the shipped design against THE DESIGN WE REJECTED, so below 1.00 is
     * the decision being right. Kept apart from `priced` for that reason: two
     * tables, opposite sort orders, different formatters, different entry points
     * — a reader who met them in one column would take half of it backwards.
     *
     * They share `byId` because the worker resolves a pair by id and must find
     * either kind, and the honesty checks below apply to both.
     */
    const alternatives: readonly TPricePair[] = [
        /**
         * THE THREE COMPARISONS THAT WERE NEVER WRITTEN DOWN, REBUILT. Each of
         * the three ran during the engine redesign and was never recorded; the
         * scripts behind them are gone. What each said and the conditions it was
         * taken under survive only in the caveats of the rows below.
         *
         * Read the recovered figures in their caveats as what a row exists to
         * REPLACE. Every one of them is marked as having no run behind it, which
         * is the point of quoting it beside a number a process has just taken.
         */
        ...alternativePairsClock,
        ...alternativePairsComputedDedup,
        ...alternativePairsDispatch,
        ...alternativePairsEffectShape,
        ...alternativePairsFrameDedup,
        ...alternativePairsIdentityStore,
        ...alternativePairsIndex,
        ...alternativePairsLegacyPosts,
        ...alternativePairsMemo,
        ...alternativePairsMutator,
        ...alternativePairsSettle,
        ...alternativePairsSlotShape,
        ...alternativePairsSlotLayout,
        ...alternativePairsLayerHop,
        ...alternativePairsBucketCoalescing,
        ...alternativePairsSubscription,
        // Every row here hands a strategy object or a subclass to the SHIPPED
        // collection, so the rejected design is driven through the same `update`
        // or `upsert` as the one it lost to.
        ...alternativePairsWritePath,
        ...alternativePairsWriteGuards,
        ...alternativePairsUpdateLadder,
        ...alternativePairsInsertLadder,
        ...alternativePairsInsertDoorLadder,
        ...alternativePairsUpdateDoor,
        ...alternativePairsUpdateByKeyLadder,
        ...alternativePairsRemoveLadder,
    ];
    const everything = [...priceControls, ...priced, ...alternatives];

    // A duplicate id would make `--only` ambiguous and, worse, would let two
    // different pairs be published under one name — the ids are what a reader
    // quotes, so they are checked at module load rather than trusted.
    const seen = new Set<string>();
    for (const pair of everything) {
        if (seen.has(pair.id)) throw new Error(`price: two pairs share the id "${pair.id}"`);
        seen.add(pair.id);
        if (pair.caveat.trim().length === 0) {
            throw new Error(
                `price: the pair "${pair.id}" has no caveat. There is no pair in this suite whose ` +
                    'two sides do the same work, so a blank caveat is a claim that has not been ' +
                    'checked rather than one that came out clean.',
            );
        }
    }

    // WHICH TABLE A PAIR PRINTS IN.
    //
    // The two catalogues share this module, the runner, the worker, the gate and
    // the controls — deliberately, so that neither can be timed differently from
    // the other. What assigns a pair is therefore ONLY which array above it was
    // spread into, and a pair in the wrong one prints a correct, well-formatted
    // row that a reader takes exactly backwards: below 1.00 means "the rejected
    // design lost" in one table and "we are cheaper than a `Map`" in the other.
    //
    // The rule was already written, once, beside one entry: "Every arm is
    // SHIPPED — nothing here is rejected, so it is not `alternatives`." A rule
    // that lives in one comment is a convention; this is what makes it a check.
    for (const pair of alternatives) {
        if (pair.id.startsWith(ALTERNATIVE_PREFIX)) continue;
        throw new Error(
            `price: "${pair.id}" is catalogued as an alternative and its id does not begin ` +
                `"${ALTERNATIVE_PREFIX}". An alternative measures a design that is NOT in the ` +
                'tree; if both arms are reachable from a consumer\'s import it is a fork, and a ' +
                'fork is priced per arm in `priced`. Move the pair, or give it the prefix.',
        );
    }
    for (const pair of priced) {
        if (!pair.id.startsWith(ALTERNATIVE_PREFIX)) continue;
        throw new Error(
            `price: "${pair.id}" is catalogued as a price and carries the alternative prefix ` +
                `"${ALTERNATIVE_PREFIX}". A priced row asks what an abstraction costs against ` +
                'the primitive a person would have written; an alternative asks whether a design ' +
                'we turned down was faster. Move the pair, or drop the prefix.',
        );
    }

    // And what is INSIDE a caveat, which the blank check above never looked at.
    checkCaveatFigures(everything);

    const byId = new Map<string, TPricePair>();
    for (const pair of everything) byId.set(pair.id, pair);

    const cataloguesByExportName: Readonly<Record<string, readonly TPricePair[]>> = {
        priceControls,
        pricePairsWrite,
        pricePairsRead,
        pricePairsFrame,
        pricePairsDeclare,
        pricePairsInsertGap,
        pricePairsSweep,
        pricePairsGrouped,
        pricePairsChainDepth,
        pricePairsBucketAdds,
        pricePairsReleaseAfterIdle,
        pricePairsGraphShape,
        alternativePairsClock,
        alternativePairsComputedDedup,
        alternativePairsDispatch,
        alternativePairsEffectShape,
        alternativePairsFrameDedup,
        alternativePairsIdentityStore,
        alternativePairsIndex,
        alternativePairsLegacyPosts,
        alternativePairsMemo,
        alternativePairsMutator,
        alternativePairsSettle,
        alternativePairsSlotShape,
        alternativePairsSlotLayout,
        alternativePairsLayerHop,
        alternativePairsBucketCoalescing,
        alternativePairsSubscription,
        alternativePairsWritePath,
        alternativePairsWriteGuards,
        alternativePairsUpdateLadder,
        alternativePairsInsertLadder,
        alternativePairsInsertDoorLadder,
        alternativePairsUpdateDoor,
        alternativePairsUpdateByKeyLadder,
        alternativePairsRemoveLadder,
    };
    if (Object.keys(cataloguesByExportName).join() !== PRICE_CATALOGUE_EXPORT_NAMES.join()) {
        throw new Error(
            'price: `cataloguesByExportName` and PRICE_CATALOGUE_EXPORT_NAMES list different catalogue files, ' +
                'so a --only run would load a different set than a full one. Keep them in the same order.',
        );
    }
    const catalogueById = new Map<string, string>();
    for (const [exportName, catalogue] of Object.entries(cataloguesByExportName)) {
        for (const pair of catalogue) catalogueById.set(pair.id, exportName);
    }
    for (const pair of everything) {
        if (catalogueById.has(pair.id)) continue;
        throw new Error(
            `price: "${pair.id}" is in the catalogue but its file is missing from ` +
                '`cataloguesByExportName`, so a worker could not load it alone. Add the file there.',
        );
    }

    return {
        controls: priceControls,
        priced,
        alternatives,
        catalogueOf: (id: string) => catalogueById.get(id),
        byId: (id: string) => byId.get(id),
    };
})();
