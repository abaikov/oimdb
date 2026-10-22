import { bundleFieldMachineryFindings } from './bundleFieldMachineryFindings';
import { bundleGroupingFindings } from './bundleGroupingFindings';
import { bundleOrderedListFindings } from './bundleOrderedListFindings';
import {
    ARM_DATABASE_ONLY,
    ARM_EVERYTHING,
    ARM_FIELD_FLOOR,
    ARM_FIELD_LIFTED,
    ARM_GROUPING_LAYER_PINNED,
    ARM_GROUPING_NONE,
    ARM_GROUPING_ONE,
    ARM_GROUPING_ONE_ORDER_OPTION,
    ARM_GROUPING_ONE_SHARED_MODULE,
    ARM_WITH,
    ARM_WITHOUT,
} from './bundleControls';
import { EBundlePiece } from './EBundlePiece';
import type { TBundlePiece } from './TBundlePiece';

/**
 * THE PIECES THIS HARNESS CAN RUN, AND EVERYTHING EACH OF THEM SAYS.
 *
 * The prose below is the half of the artifact that says what was measured and
 * what a small number would mean. It lives beside the arms so a piece cannot be
 * re-pointed at different files without somebody reading what it claims.
 *
 * EVERY PIECE NAMES `everything` AND `database-only` FIRST — the denominator and
 * the tree-shaking floor, and what `bundleControlFindings` reads. A piece that
 * omitted them would print a table with no controls.
 */
export const bundlePieces: readonly TBundlePiece[] = [
    {
        id: EBundlePiece.OrderedList,
        what: 'what diffOrderedList costs an application that never renders an ordered list',
        title: 'OIMDB — WHAT ONE PUBLIC API COSTS AN APPLICATION THAT NEVER CALLS IT',
        intro:
            'Two applications are bundled, tree-shaken, minified and gzipped. They are the same '
            + 'program except that one of them asks for an ordered list. The difference between them is '
            + 'what a METHOD on OIMDB would have charged every application that never asks — because '
            + 'every consumer imports OIMDB, and a bundler cannot drop a class\'s methods one at a time. '
            + 'A single bundle size settles nothing; only the gap does.',
        armIds: [ARM_EVERYTHING, ARM_DATABASE_ONLY, ARM_WITHOUT, ARM_WITH],
        findings: bundleOrderedListFindings,
        spotlight: {
            module: 'engine/bucket/commands/utils/oimOrderedListCommandsOfTransition.ts',
            label: 'diff?',
            name: 'engine/bucket/commands/utils/oimOrderedListCommandsOfTransition.ts',
        },
        decompose: [{ findingId: 'ordered-list-diff', from: ARM_WITHOUT, to: ARM_WITH }],
        closing: {
            heading: 'IF THIS DIFFERENCE IS MUCH SMALLER THAN 2.7 KB',
            paragraphs: [
                'Then the figure quoted at eight sites in this repository is wrong and should be '
                + 'replaced by whatever this run says, at every one of them, in one pass, naming this '
                + 'directory. That is the only outcome that requires action, and it requires it '
                + 'whichever way the number went.',

                'WHAT IT WOULD NOT DO IS OVERTURN THE DECISION. The argument for a free function has '
                + 'two halves and only one of them is a size. The other is reachability, and it is not '
                + 'a matter of degree: as a method the diff is in every consumer\'s bundle, as a free '
                + 'function it is in the bundle of consumers who call it, and that holds at 2.7 KB, at '
                + '0.4 KB and at 40 bytes. A small number would mean the eight sites overstated the '
                + 'price of a decision that was still the right shape — and it would mean this project '
                + 'quoted a measurement it had never taken, which is the failure '
                + 'measurements/README.md exists to name.',

                'IT WOULD ALSO NOT BE A REASON TO PUT THE METHOD BACK. The cost of doing that is not '
                + 'this difference — it is this difference multiplied by every application that will '
                + 'ever import OIMDB, forever, none of which can opt out. The free function\'s cost is '
                + 'a line in an import statement, paid once, by the caller who wanted it.',
            ],
        },
    },

    {
        id: EBundlePiece.Groupings,
        what: 'what the grouping layer\'s shape costs — as methods, as one module, as an order option',
        title: 'OIMDB — WHAT THE SHAPE OF THE GROUPING LAYER COSTS SOMEBODY ELSE\'S BUNDLE',
        intro:
            'One program, bundled five times, tree-shaken, minified and gzipped. Two of the five are '
            + 'baselines — a consumer who never groups anything, and a consumer who takes one grouping '
            + 'and reads it — and the other three are that same consumer under a design that was '
            + 'really considered and turned down: the four groupings as METHODS on the collection '
            + 'class, the four modules as ONE module over one shared memo, and the bucket service as '
            + 'an `order?` OPTION the callee resolves. Each difference is one decision and nothing '
            + 'else. A single bundle size settles nothing; only the gaps do.',
        armIds: [
            ARM_EVERYTHING,
            ARM_DATABASE_ONLY,
            ARM_GROUPING_NONE,
            ARM_GROUPING_LAYER_PINNED,
            ARM_GROUPING_ONE,
            ARM_GROUPING_ONE_SHARED_MODULE,
            ARM_GROUPING_ONE_ORDER_OPTION,
        ],
        findings: bundleGroupingFindings,
        /**
         * The array-driven bucket service: its presence or absence in an arm IS the
         * third decision, and it is the module `what-an-import-retains.test.ts`
         * names, so column and test read against each other with no
         * arithmetic in between.
         */
        spotlight: {
            module: 'engine/bucket/array/OIMBucketSlotsServiceArrayDriven.ts',
            label: 'array?',
            name: 'engine/bucket/array/OIMBucketSlotsServiceArrayDriven.ts',
        },
        decompose: [
            {
                findingId: 'grouping-layer-diff',
                from: ARM_GROUPING_NONE,
                to: ARM_GROUPING_LAYER_PINNED,
            },
            {
                findingId: 'grouping-shared-module-diff',
                from: ARM_GROUPING_ONE,
                to: ARM_GROUPING_ONE_SHARED_MODULE,
            },
            {
                findingId: 'grouping-order-option-diff',
                from: ARM_GROUPING_ONE,
                to: ARM_GROUPING_ONE_ORDER_OPTION,
            },
        ],
        closing: {
            heading: 'IF ANY OF THESE THREE COMES OUT SMALL',
            paragraphs: [
                'Then the prediction beside it was wrong and the prediction is what should go, not '
                + 'the row. All three were arrived at by adding up module sizes in the ordered-list '
                + 'artifact rather than by building anything, which is exactly the move this '
                + 'repository calls arithmetic over an artifact and refuses to publish. This run is '
                + 'the first time any of them meets a bundler. A refuted prediction here costs '
                + 'nothing, because none of the three has ever been cited anywhere.',

                'WHAT A SMALL NUMBER WOULD NOT DO IS OVERTURN ANY OF THE THREE DECISIONS. Each has '
                + 'two halves and only one of them is a size. The other is reachability, and it is '
                + 'not a matter of degree: a method is in the bundle of everyone who holds the class, '
                + 'a shared memo is in the bundle of everyone who takes one grouping, and a ternary '
                + 'over an option is in the bundle of everyone who groups at all. '
                + '`packages/core/tests/what-an-import-retains.test.ts` pins that half already, with '
                + 'no toolchain and no threshold, and it goes on holding at 14 KB, at 1 KB and at '
                + 'forty bytes.',

                'WHAT WOULD DESERVE ATTENTION IS THE ORDER OF THE THREE. The layer row is measured '
                + 'against a consumer who never groups and the other two against a consumer who '
                + 'groups once, so they are not competing for the same reader — but if the shared '
                + 'module or the order option turned out to be the larger of the two, that would say '
                + 'where the weight of this layer actually sits, and it would say it about the caller '
                + 'this library is mostly for: somebody who groups one column and keeps no positions.',

                'AND IF THE LAYER ROW IS THE LARGEST BY FAR, that is not a licence to quote it as '
                + 'what the groupings "cost". It is what a design nobody shipped would have cost a '
                + 'consumer who never groups. The shipped design charges that consumer nothing at '
                + 'all, which is the arm on the left, and its own number is in the table below.',
            ],
        },
    },

    {
        id: EBundlePiece.FieldMachinery,
        what:
            'what the per-column subscription apparatus costs an application that never calls '
            + 'a column slot',
        title: 'OIMDB — WHAT THE COLUMN APPARATUS COSTS AN APPLICATION THAT NEVER TOUCHES IT',
        intro:
            'ONE application, bundled twice, tree-shaken, minified and gzipped. It files rows into '
            + 'a population, keeps one bucket service whose row set it writes by hand, '
            + 'subscribes and reads — and it never asks for a column slot, so the '
            + 'per-column subscription apparatus is inert for it from the first line to the last. '
            + 'That half is already settled without a bundler: `OIMSlotOwnerService` builds one column '
            + 'owner per service at construction and keeps it, every row '
            + 'carries `columnSlotStore === undefined`, and the write paths call '
            + '`columnOwner.markColumnsChanged` only for a slot whose `columnSlotStore` is set, so for this '
            + 'application the cost is one field test per write. THE BYTES ARE THE OPEN QUESTION. THE '
            + 'TWO ARMS DIFFER IN THE ENGINE, NOT IN THE CONSUMER, and they have to: the code of '
            + 'the column owner is LINKED into the bundle by the `createColumnOwner` option that '
            + '`createOIMEntityService` and `createOIMBucketSlotOwnerService` hand to `OIMSlotOwnerService`, and by the '
            + '`columnOwner.markColumnsChanged` calls on the write paths, so '
            + 'nothing a consumer writes can decline it and two arms over today\'s engine would '
            + 'differ by exactly zero. The second arm is therefore a COUNTERFACTUAL BUILD: the '
            + 'same consumer module, against `packages/core/src` with those links removed in '
            + 'memory, rule by rule, every rule asserted by occurrence count and every one of '
            + 'them printed under the arm below. THE RUN OF THIS PIECE RECORDED IN '
            + '`measurements/2026-08-22-bundle/field-machinery` MEASURED A '
            + 'DIFFERENT MECHANISM ENTIRELY and its figures may not be quoted against this one — '
            + 'see the caveat on the row.',
        armIds: [ARM_EVERYTHING, ARM_DATABASE_ONLY, ARM_FIELD_LIFTED, ARM_FIELD_FLOOR],
        findings: bundleFieldMachineryFindings,
        /**
         * The push-driven column owner. It is the module the split would move whole,
         * and — since the excision deliberately leaves both
         * `import { createOIMColumnOwnerPushDriven }` lines in place — its absence from the
         * lifted arm is the artifact's own proof that no link to it was missed.
         */
        spotlight: {
            module: 'engine/column/OIMColumnOwnerPushDriven.ts',
            label: 'columns?',
            name: 'engine/column/OIMColumnOwnerPushDriven.ts',
        },
        decompose: [
            { findingId: 'field-machinery-diff', from: ARM_FIELD_LIFTED, to: ARM_FIELD_FLOOR },
        ],
        closing: {
            heading: 'IF THIS COMES OUT SMALL — AND IT VERY PROBABLY WILL',
            paragraphs: [
                'THEN THE QUESTION IS CLOSED, AND THAT IS THE RESULT. '
                + '`engine/column/OIMColumnOwnerPushDriven.ts` and the base it extends are the only code '
                + 'the removed links keep alive, and the write path\'s share is three calls. '
                + 'A measured "this is not worth splitting" is worth more than a '
                + 'split nobody needed, and it is the entry that the column layer\'s omission from '
                + 'the grouping move has never had: `index.ts` records the argument for keeping '
                + 'the grouping strategies out of the service class, the column owner was not '
                + 'moved with them, and no entry anywhere says why. A few hundred bytes here is '
                + 'that entry.',

                'IT WOULD NOT MEAN THE APPARATUS IS FREE. This row is a LOWER BOUND and every '
                + 'omission in the excision points the same way — both imports are left in, '
                + '`OIMSlotOwnerService` keeps its column owner construction, `hasColumnSlots` and '
                + '`isAnyColumnReferenced`, the computed services keep the pull-driven owner '
                + '(this consumer does not import them), and every doc comment of '
                + 'every removed line stays. A real split would take more out than this arm did, '
                + 'so the true saving is at least this number rather than at most it.',

                'AND A LARGE NUMBER WOULD NOT BE A DESIGN ON ITS OWN. What this arm does is '
                + 'DELETE; what a split has to do is MOVE, and the column owner does not move as '
                + 'cleanly as four grouping functions did. The `markColumnsChanged` calls are on the write path of every '
                + 'population, so lifting them means a caller who asks for a column slot '
                + 'installs something that path then calls — an indirection on the hottest path '
                + 'this engine has, which is a cost in nanoseconds against a saving in bytes. This '
                + 'piece prices one side of that trade and says nothing about the other; '
                + '`packages/bench/src/price/` is where the other side would be measured, and it '
                + 'has not been.',

                'WHAT DESERVES ATTENTION EITHER WAY IS THE SHAPE OF THE BREAKDOWN. If the '
                + 'difference is mostly `engine/column/OIMColumnOwnerPushDriven.ts` and '
                + '`engine/column/OIMColumnOwner.ts`, the weight is in the owner itself and the service '
                + 'option is what a split would have to move. If it is mostly `engine/entity/OIMEntityContentInternalService.ts` and '
                + '`engine/bucket/OIMBucketContentInternalService.ts`, the weight is on the write '
                + 'path, and the nanosecond cost in the paragraph above is the one that decides '
                + 'the trade.',

                'AND IF IT COMES OUT NEAR THE RECORDED FIGURE OF +2.51 KB, THAT IS A REASON TO '
                + 'DISTRUST THE RUN RATHER THAN TO QUOTE IT. That figure priced a module, a '
                + 'recording function, a declared-column check and a routing loop, none of which '
                + 'exist. Five rules over five modules take out TEN LINES — two option lines, three '
                + 'write-path calls and one property — and let the column owner be shaken out with '
                + 'them. That should not come to the same number, and if it does, the first thing '
                + 'to check is '
                + 'the "columns?" column: a lifted arm that still retains '
                + 'OIMColumnOwnerPushDriven.ts has not excised what this spec claims.',
            ],
        },
    },
];

/** The piece a run was asked for, refusing on a name that is not one. */
export const pieceOf = (id: string): TBundlePiece => {
    const piece = bundlePieces.find(one => one.id === id);
    if (piece === undefined) {
        throw new Error(
            `bundle: no piece named "${id}". Known pieces: `
            + `${bundlePieces.map(one => one.id).join(', ')}.`,
        );
    }
    return piece;
};
