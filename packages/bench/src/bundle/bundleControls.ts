/**
 * THE TWO WAYS THIS INSTRUMENT CAN BE SILENTLY BROKEN, AND THE NUMBER THAT
 * CATCHES EACH.
 *
 * A byte harness has no load average to be poisoned by, which makes it feel
 * safer than a stopwatch and is exactly why it needs controls at all. Both of
 * its failure modes are silent, both produce a well-formatted table, and both
 * produce a DEFENSIBLE-LOOKING answer:
 *
 *   TREE-SHAKING OFF. Every arm comes out the size of the whole package and
 *   every difference between arms collapses toward zero. The report then says
 *   the ordered-list diff costs nothing — which is a conclusion somebody would
 *   be pleased to quote, and it would be an artifact of a flag.
 *
 *   MINIFICATION OFF. Every count is inflated by comments, and this package's
 *   source is roughly 600 KB of them. The report then says the diff costs many
 *   kilobytes — the opposite error, equally quotable, and this time in the
 *   direction that flatters the decision the claim defends.
 *
 * So the controls are aimed one in each direction, and either failing voids the
 * whole report rather than its own row. That is the rule `priceControls.ts`
 * already sets for the timing harnesses: an unattested table is not a weaker
 * result, it is not a result.
 *
 * THE THRESHOLDS ARE DELIBERATELY SLACK. Each is set far from any plausible
 * honest reading and just tight enough to catch the flag being off, because a
 * control that fails when the engine is refactored is a control people learn to
 * ignore.
 */

/** The arm that keeps everything: the denominator, and the tree-shaking control's ceiling. */
export const ARM_EVERYTHING = 'everything';

/** A database and nothing else: the toll every consumer pays, and the shaking control's floor. */
export const ARM_DATABASE_ONLY = 'database-only';

/** The application the claim is measured from — it never renders an ordered list. */
export const ARM_WITHOUT = 'without-ordered-list';

/** The same application, asking for one. */
export const ARM_WITH = 'with-ordered-list';

/**
 * THE GROUPING ARMS — one program written five times, differing in one decision
 * at a time.
 *
 * `grouping-none` and `grouping-one` are the two baselines, and which one a row
 * measures FROM is the whole difference between the three claims:
 *
 *   from `grouping-none`  the consumer who never groups. What the LAYER costs
 *                         them, which is the question a method form puts.
 *   from `grouping-one`   the consumer who groups once. What the module split
 *                         and the constructed bucket service save THEM.
 *
 * A row that took the wrong baseline would still produce a difference, still
 * print a caveat, and still be about nothing anybody argued over — which is why
 * the two are named here rather than reached for inside a findings function.
 */
/**
 * THE COLUMN-APPARATUS PAIR — ONE consumer module, bundled against two engines.
 *
 * The other pairs in this harness are two consumers over one engine, and which
 * of the two an arm is comes down to a line of source. This one cannot be built
 * that way: `createOIMEntityService` and `createOIMBucketSlotOwnerService` pass `createColumnOwner`
 * to the slot owner and the write paths call `columnOwner.markColumnsChanged`,
 * so nothing a consumer writes can decline the column owner's code and both
 * arms would be the same bundle.
 * `field-lifted` is
 * therefore a COUNTERFACTUAL — `packages/core/src` with the apparatus taken out
 * in memory, listed rule by rule in `fieldMachineryExcision.ts` and printed
 * under the arm in the report. It is not a bundle a published `@oimdb/core`
 * produces, and it says so wherever it is printed.
 */
export const ARM_FIELD_FLOOR = 'field-floor';
export const ARM_FIELD_LIFTED = 'field-lifted';

export const ARM_GROUPING_NONE = 'grouping-none';
export const ARM_GROUPING_LAYER_PINNED = 'grouping-layer-pinned';
export const ARM_GROUPING_ONE = 'grouping-one';
export const ARM_GROUPING_ONE_SHARED_MODULE = 'grouping-one-shared-module';
export const ARM_GROUPING_ONE_ORDER_OPTION = 'grouping-one-order-option';

/**
 * A database alone must be under this fraction of the whole published surface.
 *
 * `what-an-import-retains.test.ts` names the closure of `OIMDB` exactly — seven
 * modules out of a hundred — so the true fraction is small. Set at 0.60 anyway:
 * the failure being caught is a bundler keeping ALL hundred, which reads 1.00,
 * and no threshold between 0.6 and 1.0 catches anything 0.6 does not.
 */
export const SHAKEN_AT_MOST = 0.6;

/**
 * The minified bundle must be under this fraction of the same bundle unminified.
 *
 * `packages/core/src` is around 600 KB of source, most of it the comments this
 * project writes; minified it is a fraction of that. Set at 0.70 for the same
 * reason as above — the failure being caught reads 1.00 exactly.
 */
export const MINIFIED_AT_MOST = 0.7;

/** Ids of the two control rows, quoted by the report and by the exit code. */
export const CONTROL_TREE_SHAKING = 'control-tree-shaking';
export const CONTROL_MINIFIED = 'control-minified';
