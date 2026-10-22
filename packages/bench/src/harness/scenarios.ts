import type { BenchConsumer } from './consumer';
import {
    APP_CARDS,
    APP_DECKS,
    APP_ROUNDS,
    APP_ROWS,
    APP_SETTING_STEPS,
    APP_SUBSCRIBERS,
    APP_TAGS,
    APP_USERS,
    CHURN_CHAIN_DEPTH,
    CHURN_CHAIN_ROOTS,
    CHURN_CHURNED,
    CHURN_CYCLES,
    CHURN_RESIDENT,
    CHURN_SUBSCRIBERS,
    CHURN_SUBSCRIBERS_DEEP,
    CHURN_WIDE,
    DELETE_ONE_STEPS,
    DIRTY_FRACTION,
    DIRTY_FRAMES,
    GROUPS,
    GROWTH_FRAMES,
    INSERT_COUNT,
    MOVER_COUNT,
    PINNED_COUNT,
    READ_PAGES,
    RELATION_ROWS,
    RELATION_STEPS,
    RELATION_TOUCHED,
    RESORT_FRAMES,
    SCROLL_STEPS,
    SINGLE_STEPS,
    SORTER_COUNT,
    SWITCH_STEPS,
    WINDOW,
    cloneRows,
} from './dataset';
import type { TRow } from './dataset';
import { chainHeadOf, chainWindowOf, diamondHeadOf } from './derivations';
import { scrambledText } from './scrambledText';
import type { BenchOracle } from './oracle';
import { FLOOR_SCENARIO_KEYS } from './floor';
import {
    churnLineOf,
    deliver,
    deliverCells,
    deliverChurn,
    deliverRelation,
    deliverSingle,
} from './render';
import { assertStandingSigned, met, notMet, signedFor } from './standard';
import type { TStandardStanding } from './standard';
import type {
    TChurnBinding,
    TChurnShapeKey,
    TReadBinding,
    TRelationBinding,
    TScenario,
    TScenarioContext,
    TScenarioKey,
    TSingleBinding,
} from './types';

/**
 * THE STANDING EVERY ORDINARY SCRIPT HAS, spelled out ONCE as a full record and
 * SIGNED FOR THE NINETEEN SCRIPTS IT WAS WRITTEN FOR.
 *
 * A named full record and NOT a defaults object somebody spreads over: the
 * guarantee `TStandardStanding` buys is that a scenario cannot OMIT an item, and
 * `{ ...DEFAULTS, A3: notMet(…) }` hands that back by letting a call site say
 * nothing about ten items and be given MET for them. A scenario either signs this
 * record or writes its own thirteen out in full.
 *
 * THE SIGNATURE IS WHAT MAKES A SHARED RECORD DIFFERENT FROM A COPIED ONE. A
 * twentieth script pointing at this constant fails at load until its key is in the
 * list — somebody has to say, in the file, that they read the thirteen answers for
 * it — and a key left in the list by a script that stopped holding this record
 * fails too.
 *
 * "ORDINARY" MEANS: the script settles inside its own loop with two live
 * consumers, it leaves a population and a grouping behind for the audit, its step
 * IS a window delivery so the floor is a bound on it, all three resolution
 * controls supply its wiring, and every library in the report has a row in its
 * table.
 */
const ORDINARY_SCRIPT: TStandardStanding = signedFor(
    [
        'patchColumn',
        'batchPatch',
        'patchMostRows',
        'moveGroup',
        'sortKeyMove',
        'resortWindow',
        'consumerPerGroup',
        'deleteRows',
        'deleteOneRow',
        'batchInsert',
        'insertIntoPopulated',
        'coldStart',
        'growUnderSubscription',
        'mixedFrame',
        'moveAndReorder',
        'drainGroup',
    ],
    {
        A1: met(
            'a step passing its `check` with `consumers.a.distinct` at zero. The script would then be ' +
                'timing a write nobody reads, and the counters printed beside the row are where that ' +
                'shows before the time does.'
        ),
        A2: met(
            '`redundant` folded into `deliveries` in `consumer.ts`, or a row printed with a total and ' +
                'no split. The two counters are the only thing separating a store that routes from one ' +
                'that rescans, and one number cannot carry both.'
        ),
        A3: met(
            'the population audit reading the store through its own view instead of `readAll`, or ' +
                '`groupOrder` answering out of the rows the column audit already compared. The second ' +
                'witness would then be the first one twice.'
        ),
        A4: met(
            'the timing worker ending without its clean pass and `scenario.check`, or the reference ' +
                'model moving to a process other than the one that produced the number.'
        ),
        B1: met(
            'one participant keeping a group index that no other row in the table keeps, with no arm ' +
                'beside it that does. The sign of the comparison flipped between two adjacent rows of ' +
                'one report for exactly that reason, before both anchors were shipped.'
        ),
        B2: met(
            'the indexed anchor rescanning the population to render a window, or the lean anchor ' +
                'gaining an index. Either stops the gap between them being the price of the index, ' +
                'which is the only thing that gap is.'
        ),
        B3: met(
            'an adapter here holding VALUES the library does not hold — an id → signal map or an ids ' +
                'atom holds handles and keys, and the `admission` line stops describing the library the ' +
                'moment it holds the data instead.'
        ),
        B4: met(
            'this table scaled by a floor whose step is not a window delivery. The multiple would then ' +
                'be a ratio between two different measurements, and the gate would refuse rows on ' +
                'arithmetic pointing the wrong way.'
        ),
        C1: met(
            'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
                'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`. Widening the ' +
                'gate then erases its own trace, which it did until 2026-08-29.'
        ),
        C2: met(
            'a sampling plan derived per adapter rather than from the slowest participant of the ' +
                'scenario, or one cell of a minimum column carrying a mean.'
        ),
        C3: met(
            'a row whose spread is above `SPREAD_CEILING` being given a rank, or the within-process ' +
                'spread printed with the same suffix as the cross-process drift, which puts two ' +
                'different populations side by side as if they were comparable.'
        ),
        C4: met(
            'the two arms of a pair measured in one process. One call site taught both shapes prices ' +
                'the second arm through a polymorphic site neither arm has in production.'
        ),
        C5: met(
            '`control-write` failing to clear this table\'s drift, or being read out of the results ' +
                'without having been spawned — it printed UNAVAILABLE above every table in the report ' +
                'for as long as the runner\'s timing batch listed only two arms.'
        ),
    }
);

const SILENT_SCRIPT: TStandardStanding = signedFor(
    ['patchOutsideWindow', 'patchNote', 'batchPatchNote', 'resendUnchanged'],
    {
        ...ORDINARY_SCRIPT,
        A1: notMet(
            'a correct store renders NOTHING here: every write lands on a row or a column no view ' +
                'shows, and `check` demands zero distinct renders in both views. What is timed is the ' +
                'write path plus however many consumers the store woke anyway, and that wake count is ' +
                'the result this row exists to print.'
        ),
        B4: met(
            'a floor built out of window deliveries scaling this table. A correct row here delivers ' +
                'nothing, so a window floor would print it at a fraction of a bound it never pays; the ' +
                'step shape is `nothing` and its absence of a floor is declared in `UNBOUNDED_BECAUSE`.'
        ),
    }
);

/**
 * THE STANDING THE PLAIN CHURN SCRIPTS SHARE, and the two items a churn
 * wiring cannot meet however it is written. A named record for
 * `ORDINARY_SCRIPT`'s reason; the three churn scripts that differ write their own
 * thirteen out rather than spreading over this one.
 *
 * SIX AND NOT SEVEN SINCE 2026-08-31. `churnColumn` was signed here until the
 * per-shape split gave it a table of fourteen libraries where these six have
 * sixteen. B5 is derived
 * rather than declared, so nothing in this record was wrong for it — but a record
 * shared by scripts whose tables no longer hold the same rows is a document signed
 * for a script it stopped describing, and it now writes its own.
 */
const CHURN_SCRIPT: TStandardStanding = signedFor(
    [
        'churnOne',
        'churnShared',
        'churnSharedReversed',
        'churnSharedDeep',
        'churnSharedDeepReversed',
        'churnWide',
        'churnList',
    ],
    {
    A1: met(
        'the cycle\'s first frame delivering nothing. The frame\'s writes and its one settle between ' +
            'the mounts are what prove the subscribers this script just mounted are live, and `check` ' +
            'asserts the count and the delivered line rather than inferring them — on verify and ' +
            'proof passes a line folding what EVERY standing subscriber read, by its mount slot.'
    ),
    A2: met(
        'a delivery in the cycle\'s SECOND frame passing `check`. Everything mounted has been ' +
            'unmounted by then, so a wake there is a subscriber that did not leave; it delivers a new ' +
            'label, which `check` counts as a distinct render it did not ask for and FAILS.'
    ),
    A3: notMet(
        'a churn binding derives no view and keeps no grouping, so `groupOrder` answers `undefined` ' +
            'for the participants whose churn wiring is a subscriber store rather than a full one, and ' +
            'the fifty-bucket half of the audit does not run. The stored columns are audited in full ' +
            'against the reference model, and the mount/unmount counts are checked against it too.'
    ),
    A4: met(
        'the mount and unmount counts, and the per-slot read fold, checked in the verify pass and not ' +
            'in the timed process\'s own proof pass. A store that mounted nothing, or mounted a ' +
            'subscriber on the wrong row, leaves the same population behind as one that did it right.'
    ),
    B1: met(
        'the hand-written floor mounting fewer subscribers than the engine is asked for, or leaving ' +
            'them through a path the engine is not asked for. `churnChain` declares that this is ' +
            'exactly what happens on its row.'
    ),
    B2: met(
        'the anchor\'s unmount becoming an O(1) swap-remove. `indexOf` plus `splice` over an array of ' +
            'subscribers is what a person writing this writes; the O(1) unmount belongs to the FLOOR ' +
            'beside it, which exists to be beaten by nobody.'
    ),
    B3: met(
        'this adapter\'s churn wiring holding the subscriber bodies itself and calling them, rather ' +
            'than handing them to the library\'s own subscribe and being called.'
    ),
    // MET SINCE 2026-08-30, and it was thirteen of the suite's fifty-two unmet
    // pairs. A churn step is not a window delivery, which is why `consumerFloor`
    // was an arbitrary scale here; `mountFloor` measures ONE MOUNT AND ONE
    // UNMOUNT with no library at all, at the family's largest subscriber count so
    // that its per-step share of the frame is the smallest any churn step's is.
    // `floorKeyFor` hands this table that floor, and the gate refuses a row of it
    // exactly as it refuses one in the write tables.
    B4: met(
        '`floorKeyFor` handing this table `consumerFloor` again. A churn step is a mount, not a ' +
            'window delivery, and thirteen (scenario, B4) pairs were unmet for precisely that until ' +
            '`mountFloor` was written.'
    ),
    C1: met(
        'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
            'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`. Widening the ' +
            'gate then erases its own trace, which it did until 2026-08-29.'
    ),
    C2: met(
        'a sampling plan derived per adapter rather than from the slowest participant of the ' +
            'scenario, or one cell of a minimum column carrying a mean.'
    ),
    C3: met(
        'a row whose spread is above `SPREAD_CEILING` being given a rank. These tables are the ' +
            'likeliest place for that: a mount is small, so the sampling plan derived from the ' +
            'slowest participant gives the fast ones very short samples.'
    ),
    C4: met(
        'the two arms of a pair measured in one process. One call site taught both shapes prices ' +
            'the second arm through a polymorphic site neither arm has in production.'
    ),
    C5: notMet(
        'ONE ARM AND NOT TWO. Until 2026-08-30 the controls declined this wiring outright and every ' +
            'gap in this table was unattested at any scale. `control-lean` and `control-heavy` now ' +
            'supply a churn wiring and attest a DOUBLED MOUNT PATH — the axis these rows are along — ' +
            'so the table has a resolution. What it has no second arm for is the SCALE of its own ' +
            'gaps: `control-write` declines the churn wiring in writing, because a churn frame ' +
            'performs ONE store mutation against every mount and unmount of the cycle and a doubled ' +
            'write path here is a difference smaller than this table\'s drift. The remaining gap is ' +
            'that the one arm is roughly a doubling where the gaps a reader is asked to read are not.'
    ),
    }
);

/**
 * THE STANDING THE PLAIN READ SCRIPTS SHARE. `filterTwoAxes` writes its own
 * thirteen because it has a NOT MET of its own, and `viewSwitch` because its
 * step moves the selection rather than the offset.
 *
 * `TReadEntry` is one declaration PER SHAPE — `reads.byKey`, `reads.byWindow`,
 * `reads.byTwoAxes` — so a library that can answer two of the three declines the
 * third by name. `registry.ts` asks the wiring invariant once per shape,
 * `participantsOf` is per shape, and `assertStandingSigned` refuses a B3 NOT MET
 * on a script whose declaration is its own alone.
 */
const READ_SCRIPT: TStandardStanding = signedFor(['readByKey', 'scrollWindow', 'deepScroll'], {
    A1: met(
        'a read answered from work done before the clock — keys resolved in advance for the page ' +
            'read, or the window at each scroll offset kept between runs. The lookup IS the ' +
            'measurement here, the opposite of what `targeted column delivery` pins away, so an ' +
            'adapter doing either would leave a timed region with nothing in it and a consumer ' +
            'driven for free.'
    ),
    A2: met(
        'the scroll waking view B. Only the offset moves, so every delivery to the second view is ' +
            'redundant by construction, and the count of them separates a store that routes from one ' +
            'that rescans more sharply here than anywhere else in the report.'
    ),
    A3: met(
        'the population audit reading the store through its own view instead of `readAll`. These ' +
            'scripts change nothing, so the audit afterwards is the whole proof that a read did not ' +
            'quietly move a row.'
    ),
    A4: met(
        'the exact delivery count these scripts assert being checked in the verify pass and not in ' +
            'the timed one. A pull that delivered twice and a pull that delivered once leave ' +
            'identical state behind.'
    ),
    B1: met(
        'one participant answering the read from an index it maintains and another rescanning, with ' +
            'no arm beside either. Both anchors have a row here, and the gap between them is where ' +
            'that difference is priced.'
    ),
    B2: met(
        'the indexed anchor rescanning ten thousand rows to answer a page. Nobody writing this by ' +
            'hand does that, and a floor that did would flatter every store above it.'
    ),
    B3: met(
        'a second library admitted that can answer one read shape and not another, and an adapter ' +
            'supplying the shape it cannot answer under the name of one it can. That is what the ' +
            'per-shape declaration makes expressible and what `churnColumn` shows the cost of.'
    ),
    B4: met(
        'this table scaled by a floor whose step is not a window delivery. A read step delivers one ' +
            'window, which is what `consumerFloor` measures — the one family where that is true ' +
            'without an argument.'
    ),
    C1: met(
        'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
            'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`. Widening the ' +
            'gate then erases its own trace, which it did until 2026-08-29.'
    ),
    C2: met(
        'a sampling plan derived per adapter rather than from the slowest participant of the ' +
            'scenario, or one cell of a minimum column carrying a mean.'
    ),
    C3: met(
        'a row whose spread is above `SPREAD_CEILING` being given a rank. A pull is among the ' +
            'cheapest operations measured here, so the plan derived from the slowest participant ' +
            'gives these rows the shortest samples in the report.'
    ),
    C4: met(
        'the two arms of a pair measured in one process. One call site taught both shapes prices ' +
            'the second arm through a polymorphic site neither arm has in production.'
    ),
    C5: notMet(
        'ONE ARM AND NOT TWO. Until 2026-08-30 the controls declined this wiring outright and every ' +
            'gap in this table was unattested at any scale. `control-lean` and `control-heavy` now ' +
            'supply a read wiring and attest a DOUBLED READ — the answer to each read derived twice ' +
            'and delivered once, because `read a page by key` asserts an exact delivery count — so ' +
            'the table has a resolution. What it has no second arm for is the SCALE of its own gaps: ' +
            '`control-write` declines the read wiring in writing, because FOUR OF THE FIVE READ ' +
            'SCRIPTS PERFORM NO STORE MUTATION AT ALL and its gap above them would be exactly zero. ' +
            'The remaining gap is that the one arm is roughly a doubling where the gaps a reader is ' +
            'asked to read are not.'
    ),
});

/**
 * The scripts. Every adapter runs THESE, not its own version of them, and every
 * one of them ends at the consumer.
 *
 * Each script leaves the store exactly as it found it, or `restore` puts it back:
 * the timing loop runs a sample many times and the verification run performs it
 * once, and unless all of those start from the same state they are not measuring
 * or checking the same thing.
 *
 * EVERY SCRIPT IS WRITTEN TWICE (`TScenario.oracle`). The second copy reads the
 * TURN COUNTERS the first one advanced, so both write the same values; that is
 * why they are module-level and why `restore` resets them.
 */

const expect = (
    what: string,
    got: number,
    want: number
): string | undefined =>
    got === want ? undefined : `${what}: got ${got}, the script performed ${want}`;

/**
 * A FLOOR rather than an equality, for the counters where doing MORE is a
 * measured behaviour rather than a fault — the multi-frame scripts whose render
 * count belongs to the store (`TScenario.finalStateOnly`). FEWER is still a
 * fault, and is what this catches: a store that skipped a frame's derivation and
 * settled up at the end leaves the right final state and would otherwise pass.
 */
const atLeast = (
    what: string,
    got: number,
    least: number
): string | undefined =>
    got >= least ? undefined : `${what}: got ${got}, the script performed at least ${least}`;

/**
 * ONE MARK PER FRAME OF THE SUSTAINED-WRITE SCRIPT, pairwise distinct, so that no
 * write in any frame can be a write of the value already stored.
 *
 * The two-value suffix idiom used elsewhere in this file is enough for a script
 * whose every run is one frame. A multi-frame script needs one per frame AND
 * needs the last frame's to differ from the first frame's, because the timing
 * loop calls `run` repeatedly against a single `restore` and the two meet there.
 */
const DIRTY_MARKS: readonly string[] = Array.from({ length: DIRTY_FRAMES }, (_, f) =>
    'x'.repeat(f)
);

/** Every visible row of view A, patched once, in window order. */
const patchColumn: TScenario = {
    key: 'patchColumn',
    label: 'patch one column',
    description:
        `${WINDOW} steps. Each step changes the \`label\` of one row visible in view A. View A must ` +
        're-render with the new text every step. View B shows a different group and must not change; ' +
        'how often it was woken anyway is counted.',
    standing: ORDINARY_SCRIPT,
    steps: WINDOW,
    rebuild: false,
    repeatable: true,
    prepare: () => undefined,
    restore: ctx => {
        for (const id of ctx.plan.windowA) {
            const row = ctx.rowById.get(id);
            if (row !== undefined) ctx.binding.patchLabel(id, row.label);
        }
        ctx.binding.settle();
        patchTurn = 0;
    },
    // Two disjoint label sets, alternated, so a repeat inside one sample never
    // writes a value the store already holds — otherwise the row measures the
    // unchanged-write path and reports it as the patch path.
    run: ctx => {
        const ids = ctx.plan.windowA;
        patchTurn ^= 1;
        const suffix = patchTurn === 1 ? '' : 'x';
        const labels = ctx.plan.patchedLabels;
        for (let i = 0; i < ids.length; i++) {
            ctx.binding.patchLabel(ids[i], `${labels[i]}${suffix}`);
            ctx.binding.settle();
        }
    },
    check: ctx =>
        expect('view A distinct renders', ctx.consumers.a.distinct, WINDOW) ??
        expect('view B distinct renders', ctx.consumers.b.distinct, 0),
    oracle: (ctx, model) => {
        const ids = ctx.plan.windowA;
        // The turn `run` just used: the two replays must write the same labels.
        const suffix = patchTurn === 1 ? '' : 'x';
        const labels = ctx.plan.patchedLabels;
        for (let i = 0; i < ids.length; i++) {
            model.setLabel(ids[i], `${labels[i]}${suffix}`);
            model.emit();
        }
    },
};

/**
 * THE SAME PATCH, TO A ROW NOBODY IS LOOKING AT — `patchColumn`'s other half. A
 * store watching a whole group wakes for every one of these writes and re-derives
 * a window that did not move; a store subscribed only to the visible rows hears
 * nothing. Neither behaviour was measurable while every write in the suite landed
 * inside the window, and the one that benefited from that is ours.
 */
const patchOutsideWindow: TScenario = {
    key: 'patchOutsideWindow',
    label: 'patch a row off screen',
    description:
        `${WINDOW} steps. Each step changes the \`label\` of a row in view A's group that sits just ` +
        'below the visible page: in the group, but not on screen. Neither view may re-render. ' +
        'Measured: how often a library wakes a view for a change nobody can see.',
    standing: SILENT_SCRIPT,
    rendersNothing: true,
    steps: WINDOW,
    rebuild: false,
    repeatable: true,
    prepare: () => undefined,
    restore: ctx => {
        for (const id of ctx.plan.outsideA) {
            const row = ctx.rowById.get(id);
            if (row !== undefined) ctx.binding.patchLabel(id, row.label);
        }
        ctx.binding.settle();
        outsideTurn = 0;
    },
    // Alternated for `patchColumn`'s reason.
    run: ctx => {
        const ids = ctx.plan.outsideA;
        outsideTurn ^= 1;
        const suffix = outsideTurn === 1 ? '' : 'x';
        const labels = ctx.plan.patchedLabels;
        for (let i = 0; i < ids.length; i++) {
            ctx.binding.patchLabel(ids[i], `${labels[i]}${suffix}`);
            ctx.binding.settle();
        }
    },
    check: ctx =>
        expect('view A distinct renders', ctx.consumers.a.distinct, 0) ??
        expect('view B distinct renders', ctx.consumers.b.distinct, 0),
    oracle: (ctx, model) => {
        const ids = ctx.plan.outsideA;
        const suffix = outsideTurn === 1 ? '' : 'x';
        const labels = ctx.plan.patchedLabels;
        for (let i = 0; i < ids.length; i++) {
            model.setLabel(ids[i], `${labels[i]}${suffix}`);
            model.emit();
        }
    },
};

/**
 * THE COLUMN NOBODY READS — `patchColumn` down to the step count and the rows,
 * differing in one column: whether "this entity changed" and "something this view
 * shows changed" are different questions to a store.
 *
 * THE ONE ROW THE DIGEST CANNOT POLICE, because its correct outcome IS "nothing
 * reaches the consumer": an adapter whose `patchNote` quietly did nothing would
 * pass the check, match the reference model, and post the fastest time in the
 * table. `patchNote` is the only binding method whose every caller expects
 * silence — `patchLabel` is proved by `patch one column`, `setGroup` by the group
 * move, `setRank` by the sort-key move, `write` by the load, `remove` by the
 * deletion.
 *
 * TWO THINGS STAND IN FOR A CHECK. Every `patchNote` here is written as the SAME
 * CALL as that adapter's `patchLabel`, differing in the column and nothing else,
 * so the two can be diffed by eye; read them that way before reading this row's
 * numbers. And the POPULATION AUDIT compares `note` on every row afterwards
 * (`firstPopulationMismatch`), so a dropped write is caught there.
 */
const patchNote: TScenario = {
    key: 'patchNote',
    label: 'patch an unread column',
    description:
        `${WINDOW} steps. The same rows and the same calls as "patch one column", but the changed ` +
        'field is `note`, which no view displays. Neither view may re-render. The difference between ' +
        'the two scenarios is what tracking changes per field saves.',
    standing: SILENT_SCRIPT,
    rendersNothing: true,
    steps: WINDOW,
    rebuild: false,
    repeatable: true,
    prepare: () => undefined,
    restore: ctx => {
        for (const id of ctx.plan.windowA) {
            const row = ctx.rowById.get(id);
            if (row !== undefined) ctx.binding.patchNote(id, row.note);
        }
        ctx.binding.settle();
        noteTurn = 0;
    },
    run: ctx => {
        const ids = ctx.plan.windowA;
        noteTurn ^= 1;
        const suffix = noteTurn === 1 ? '' : 'x';
        const notes = ctx.plan.patchedNotes;
        for (let i = 0; i < ids.length; i++) {
            ctx.binding.patchNote(ids[i], `${notes[i]}${suffix}`);
            ctx.binding.settle();
        }
    },
    check: ctx =>
        expect('view A distinct renders', ctx.consumers.a.distinct, 0) ??
        expect('view B distinct renders', ctx.consumers.b.distinct, 0),
    oracle: (ctx, model) => {
        const ids = ctx.plan.windowA;
        const suffix = noteTurn === 1 ? '' : 'x';
        const notes = ctx.plan.patchedNotes;
        for (let i = 0; i < ids.length; i++) {
            model.setNote(ids[i], `${notes[i]}${suffix}`);
            // Emitted anyway: the model renders `id rank label`, so a note write
            // is invisible to it BY CONSTRUCTION and the state it produces is the
            // one before.
            model.emit();
        }
    },
};

/**
 * MANY WRITES IN ONE FRAME. Every other update script here calls `settle()`
 * INSIDE its per-row loop, and in a one-write frame a store that coalesces and a
 * store that re-derives per write are the same thing.
 *
 * WHERE THE WRITES LAND. `plan.batch` strides through the WHOLE row set (see
 * `makePlan`), so most of the batch lands in groups neither view watches and a
 * small part — guaranteed, not hoped for — lands inside each window. That ratio
 * is the question.
 */
const batchPatch: TScenario = {
    key: 'batchPatch',
    label: 'batch patch',
    description:
        'One step: the `label` of every tenth row in the whole store (at least four pages of rows, ' +
        'spread over every group) is changed inside one batch, and the changes are delivered once. ' +
        'This is a sync response or a bulk edit. Most changes land in groups no view shows. Both ' +
        'views must end showing the new text. How many times each re-renders is up to the library: ' +
        'one with a batch API renders once per view, one without renders once per changed visible ' +
        'row, so only the final screen is checked.',
    standing: ORDINARY_SCRIPT,
    steps: 1,
    rebuild: false,
    // The render count is this script's SUBJECT, so it cannot also be its pass
    // condition. See `TScenario.finalStateOnly`.
    finalStateOnly: true,
    // Restored, and the labels alternate, so a repeat is always a real change.
    repeatable: true,
    prepare: () => undefined,
    restore: ctx => {
        for (const id of ctx.plan.batch) {
            const row = ctx.rowById.get(id);
            if (row !== undefined) ctx.binding.patchLabel(id, row.label);
        }
        ctx.binding.settle();
        batchTurn = 0;
    },
    // ONE `settle`, AFTER THE LOOP — the frame boundary, and the entire scenario.
    // Settling inside the loop turns this back into `patchColumn` with a bigger
    // row count. Labels alternate for `patchColumn`'s reason.
    run: ctx => {
        const ids = ctx.plan.batch;
        batchTurn ^= 1;
        const suffix = batchTurn === 1 ? '' : 'x';
        const labels = ctx.plan.batchLabels;
        ctx.binding.frame(() => {
            for (let i = 0; i < ids.length; i++) {
                ctx.binding.patchLabel(ids[i], `${labels[i]}${suffix}`);
            }
        });
        ctx.binding.settle();
    },
    /**
     * WHICH ROWS THE VIEWS END UP SHOWING — deliberately not how many times they
     * said so (see `TScenario.finalStateOnly`). Both views must still be FULL and
     * view A must show exactly the ids of `plan.windowA` IN ORDER: `label` is
     * neither filtered nor sorted on, so a batch of label writes may change text
     * and may not change which row is where, and a store that reordered or
     * dropped one fails here rather than being reported as fast. The TEXT is
     * adjudicated by the final-state comparison and every write by the population
     * audit.
     */
    check: ctx => {
        const ids = ctx.plan.windowA;
        const shown = ctx.consumers.a.text().split('\n');
        // A line is `${id} ${rank} ${label}`, so comparing the prefix up to the
        // first space is comparing WHICH row is in slot i.
        let inPlace = 0;
        for (let i = 0; i < ids.length; i++) {
            if (shown[i] !== undefined && shown[i].startsWith(`${ids[i]} `)) inPlace++;
        }
        return (
            expect('view A rows', ctx.consumers.a.rowCount(), ids.length) ??
            expect('view A rows still in window order', inPlace, ids.length) ??
            // Every group is dealt round-robin by `makeRows` and group A is
            // checked to hold two full windows, so group B holds at least one.
            expect('view B rows', ctx.consumers.b.rowCount(), ctx.view.window)
        );
    },
    oracle: (ctx, model) => {
        const ids = ctx.plan.batch;
        // The turn `run` just used, so both replays write the same labels.
        const suffix = batchTurn === 1 ? '' : 'x';
        const labels = ctx.plan.batchLabels;
        for (let i = 0; i < ids.length; i++) {
            model.setLabel(ids[i], `${labels[i]}${suffix}`);
        }
        // ONE emit, matching the one settle: the whole batch is a single script
        // step and therefore a single state, not one state per row.
        model.emit();
    },
};

/**
 * `patchNote`'s question batched. Same rows, same count, same single settle as
 * `batchPatch`, differing in the COLUMN and nothing else — so the pair brackets
 * whether COALESCING RECOVERS the wasted frame a row-granular store pays on
 * `patchNote`, where a leaf-routed store posts `0d/0n/0r` (the one honest loss to
 * a mechanism this suite records, `WHY-EACH-ROW.md`).
 *
 * WHY THIS IS NOT `finalStateOnly` AND `batchPatch` IS: there the correct render
 * count differs between correct stores, whereas here NOTHING DISTINCT is ever
 * produced, so every correct store folds the identical empty sequence and the
 * sequence digest is a criterion again. The wake-ups are still counted, in the
 * delivery columns.
 *
 * WHAT PROVES THE WRITES HAPPENED: the POPULATION AUDIT, not the digest — see
 * `patchNote`, which rests on the same guard and the same binding method.
 */
const batchPatchNote: TScenario = {
    key: 'batchPatchNote',
    label: 'batch patch an unread column',
    description:
        'One step: the same rows as "batch patch" are changed in one batch, but in `note`, a field ' +
        'no view displays. Neither view may show new text; any re-render is wasted work and is ' +
        'counted. Against "batch patch" it shows the cost of a batch nobody sees; against "patch an ' +
        'unread column" it shows what batching saves. The changes are checked in the store afterwards.',
    standing: SILENT_SCRIPT,
    rendersNothing: true,
    steps: 1,
    rebuild: false,
    // Restored, and the notes alternate, so a repeat is always a real change.
    repeatable: true,
    prepare: () => undefined,
    restore: ctx => {
        for (const id of ctx.plan.batch) {
            const row = ctx.rowById.get(id);
            if (row !== undefined) ctx.binding.patchNote(id, row.note);
        }
        ctx.binding.settle();
        batchNoteTurn = 0;
    },
    run: ctx => {
        const ids = ctx.plan.batch;
        batchNoteTurn ^= 1;
        const suffix = batchNoteTurn === 1 ? '' : 'x';
        const notes = ctx.plan.batchNotes;
        ctx.binding.frame(() => {
            for (let i = 0; i < ids.length; i++) {
                ctx.binding.patchNote(ids[i], `${notes[i]}${suffix}`);
            }
        });
        ctx.binding.settle();
    },
    check: ctx =>
        expect('view A distinct renders', ctx.consumers.a.distinct, 0) ??
        expect('view B distinct renders', ctx.consumers.b.distinct, 0),
    oracle: (ctx, model) => {
        const ids = ctx.plan.batch;
        const suffix = batchNoteTurn === 1 ? '' : 'x';
        const notes = ctx.plan.batchNotes;
        for (let i = 0; i < ids.length; i++) {
            model.setNote(ids[i], `${notes[i]}${suffix}`);
        }
        // Emitted once, matching the one settle. The model renders `id rank
        // label`, so a note write is invisible to it BY CONSTRUCTION and the
        // state it produces is the one before.
        model.emit();
    },
};

/**
 * MOST OF THE POPULATION DIRTY, IN EVERY FRAME, FOR SEVERAL FRAMES RUNNING — the
 * DENSE end of the dial, where every other write script here is the sparse end.
 *
 * WHY THIS ROW IS EXPECTED TO GO BADLY FOR US, stated before it is measured. At
 * `alt.dirty-list-vs-scan.1k-50pct` in `price/alternativePairsDispatch.ts`, with
 * half of 1024 subscribed identities dirty, the design we REJECTED (stamp and
 * scan at the boundary) is ahead of the shipped one by about 1.18x. That row is
 * an internal control between two harness-owned bodies; THIS row is the same
 * fraction against fifteen real libraries.
 *
 * WHAT IT COSTS TO ASK: `DIRTY_FRAMES × N / DIRTY_FRACTION` writes per run —
 * 10 000 at the default point, ten times `batchPatch` — and each further frame
 * multiplies it, which is why `DIRTY_FRAMES` is two rather than eight.
 *
 * SEVERAL FRAMES AND NOT ONE: the only way to reach what a large frame leaves
 * behind for the next — a recycled delivery list, two lists swapped rather than
 * allocated, and a population's worth of identity stamps that have to be retired
 * before the following frame can use its own number.
 *
 * WHERE THE WRITES LAND: `plan.dirty` is the first half of the row set, dealt
 * round-robin by `makeRows`, so both windows are reached by construction.
 */
const patchMostRows: TScenario = {
    key: 'patchMostRows',
    label: 'most rows change every frame',
    description:
        `${DIRTY_FRAMES} steps. Each step changes the \`label\` of one row in ${DIRTY_FRACTION} across ` +
        'the whole store, the same share of every group, and delivers once. Every other write ' +
        'scenario changes a handful of rows; this one checks the opposite end, where most of what is ' +
        'subscribed changes at once. Both views must end every step showing new text.',
    standing: ORDINARY_SCRIPT,
    steps: DIRTY_FRAMES,
    rebuild: false,
    // The frame count is the script's; the RENDER count is the store's. See
    // `TScenario.finalStateOnly`.
    finalStateOnly: true,
    // Restored, and the per-frame marks make every write of every frame a real
    // change — including the first write of a repeated run. See `run`.
    repeatable: true,
    prepare: () => undefined,
    restore: ctx => {
        for (const id of ctx.plan.dirty) {
            const row = ctx.rowById.get(id);
            if (row !== undefined) ctx.binding.patchLabel(id, row.label);
        }
        ctx.binding.settle();
    },
    /**
     * ONE `settle` PER FRAME, AFTER THE FRAME'S WRITES, and no adapter is told
     * which frame it is in.
     *
     * NO WRITE IN ANY FRAME IS EVER A NO-OP, and it is checkable: the marks are
     * pairwise distinct so consecutive frames disagree on every row; the last
     * frame's mark differs from the next run's opening one, where a repeated `run`
     * against one `restore` would otherwise collide; and the first run after a
     * restore writes a `d…` label over the stored `l…` one. So a run is exactly
     * `DIRTY_FRAMES × plan.dirty.length` real writes.
     */
    run: ctx => {
        const ids = ctx.plan.dirty;
        const labels = ctx.plan.dirtyLabels;
        for (let frame = 0; frame < DIRTY_FRAMES; frame++) {
            const mark = DIRTY_MARKS[frame];
            ctx.binding.frame(() => {
                for (let i = 0; i < ids.length; i++) {
                    ctx.binding.patchLabel(ids[i], `${labels[i]}${mark}`);
                }
            });
            ctx.binding.settle();
        }
    },
    /**
     * `batchPatch.check`'s demands, plus the one a multi-frame script needs: EACH
     * VIEW DELIVERED AT LEAST ONCE PER FRAME. A store that skipped every
     * intermediate frame and derived once at the end would leave the right final
     * state, pass the state comparison and the population audit, and post a time
     * for work it did not do. A FLOOR rather than an equality, because delivering
     * more often is the eager behaviour this row prices.
     */
    check: ctx => {
        const ids = ctx.plan.windowA;
        const shown = ctx.consumers.a.text().split('\n');
        let inPlace = 0;
        for (let i = 0; i < ids.length; i++) {
            if (shown[i] !== undefined && shown[i].startsWith(`${ids[i]} `)) inPlace++;
        }
        return (
            expect('view A rows', ctx.consumers.a.rowCount(), ids.length) ??
            expect('view A rows still in window order', inPlace, ids.length) ??
            expect('view B rows', ctx.consumers.b.rowCount(), ctx.view.window) ??
            atLeast('view A distinct renders', ctx.consumers.a.distinct, DIRTY_FRAMES) ??
            atLeast('view B distinct renders', ctx.consumers.b.distinct, DIRTY_FRAMES)
        );
    },
    oracle: (ctx, model) => {
        const ids = ctx.plan.dirty;
        const labels = ctx.plan.dirtyLabels;
        for (let frame = 0; frame < DIRTY_FRAMES; frame++) {
            const mark = DIRTY_MARKS[frame];
            for (let i = 0; i < ids.length; i++) {
                model.setLabel(ids[i], `${labels[i]}${mark}`);
            }
            // One emit per settle: a frame is one script step and therefore one
            // state, not one state per row.
            model.emit();
        }
    },
};

let mixedInsertRows: readonly TRow[] = [];
let mixedRemovedRows: readonly TRow[] = [];

const mixedFrame: TScenario = {
    key: 'mixedFrame',
    label: 'one frame, every kind of change',
    description:
        `One step with five kinds of change delivered together: ${MOVER_COUNT} new rows inserted at ` +
        `the top of view A, its last ${MOVER_COUNT} rows deleted, \`label\` changed on rows in ` +
        `between, ${MOVER_COUNT} rows moved to group B, and a few rows re-sorted inside view A. ` +
        'Each kind touches different rows. This is what one message from a server can carry; every ' +
        'other scenario has one kind. Both views must end full and correct, with a new row at the ' +
        'top of view A.',
    standing: ORDINARY_SCRIPT,
    steps: 1,
    rebuild: false,
    finalStateOnly: true,
    repeatable: false,
    prepare: ctx => {
        mixedInsertRows = cloneRows(ctx.plan.mixedInserted);
        const removed: TRow[] = [];
        for (const id of ctx.plan.mixedRemoved) {
            const row = ctx.rowById.get(id);
            if (row !== undefined) removed.push({ ...row });
        }
        mixedRemovedRows = removed;
    },
    restore: ctx => {
        const plan = ctx.plan;
        ctx.binding.remove(plan.mixedInsertedIds);
        ctx.binding.write(mixedRemovedRows);
        for (const id of plan.mixedPatched) {
            const row = ctx.rowById.get(id);
            if (row !== undefined) ctx.binding.patchLabel(id, row.label);
        }
        for (const id of plan.movers) ctx.binding.setGroup(id, ctx.view.groupA);
        for (const sorter of plan.sorters) ctx.binding.setRank(sorter.id, sorter.rest);
        ctx.binding.settle();
    },
    run: ctx => {
        const plan = ctx.plan;
        ctx.binding.frame(() => {
            ctx.binding.write(mixedInsertRows);
            ctx.binding.remove(plan.mixedRemoved);
            const patched = plan.mixedPatched;
            const labels = plan.mixedLabels;
            for (let i = 0; i < patched.length; i++) ctx.binding.patchLabel(patched[i], labels[i]);
            const movers = plan.movers;
            for (let i = 0; i < movers.length; i++) ctx.binding.setGroup(movers[i], ctx.view.groupB);
            const sorters = plan.sorters;
            for (let i = 0; i < sorters.length; i++) ctx.binding.setRank(sorters[i].id, sorters[i].low);
        });
        ctx.binding.settle();
    },
    check: ctx =>
        expect('view A rows', ctx.consumers.a.rowCount(), ctx.view.window) ??
        expect('view B rows', ctx.consumers.b.rowCount(), ctx.view.window) ??
        (ctx.consumers.a.head().startsWith('m')
            ? undefined
            : `view A's head is "${ctx.consumers.a.head()}", and every row the frame inserts ranks ` +
              'below every row of group A, so the head of the window after it must be an inserted row') ??
        atLeast('view A deliveries', ctx.consumers.a.deliveries, 1) ??
        atLeast('view B deliveries', ctx.consumers.b.deliveries, 1),
    oracle: (ctx, model) => {
        const plan = ctx.plan;
        for (const row of plan.mixedInserted) model.put(row);
        for (const id of plan.mixedRemoved) model.remove(id);
        for (let i = 0; i < plan.mixedPatched.length; i++) {
            model.setLabel(plan.mixedPatched[i], plan.mixedLabels[i]);
        }
        for (const id of plan.movers) model.setGroup(id, ctx.view.groupB);
        for (const sorter of plan.sorters) model.setRank(sorter.id, sorter.low);
        model.emit();
    },
};

/** Rows leave group A for group B and come back. Both views change every step. */
const moveGroup: TScenario = {
    key: 'moveGroup',
    label: 'row moves between groups',
    description:
        `${MOVER_COUNT * 2} steps. Each step moves one row from group A to group B or back. The moved ` +
        'rows sort first, so every move shows at the top of both views: view A loses a row and pulls ' +
        'in the next one from below, view B gains it.',
    standing: ORDINARY_SCRIPT,
    steps: MOVER_COUNT * 2,
    rebuild: false,
    // Every mover is toggled out and back, so a sample leaves the store exactly
    // as it found it and repeating the run is always a real change.
    repeatable: true,
    prepare: () => undefined,
    restore: ctx => {
        for (const id of ctx.plan.movers) ctx.binding.setGroup(id, ctx.view.groupA);
        ctx.binding.settle();
    },
    run: ctx => {
        const movers = ctx.plan.movers;
        const steps = movers.length * 2;
        for (let i = 0; i < steps; i++) {
            const to = i < movers.length ? ctx.view.groupB : ctx.view.groupA;
            ctx.binding.setGroup(movers[i % movers.length], to);
            ctx.binding.settle();
        }
    },
    check: ctx =>
        expect('view A distinct renders', ctx.consumers.a.distinct, ctx.plan.movers.length * 2) ??
        expect('view B distinct renders', ctx.consumers.b.distinct, ctx.plan.movers.length * 2),
    oracle: (ctx, model) => {
        const movers = ctx.plan.movers;
        const steps = movers.length * 2;
        for (let i = 0; i < steps; i++) {
            const to = i < movers.length ? ctx.view.groupB : ctx.view.groupA;
            model.setGroup(movers[i % movers.length], to);
            model.emit();
        }
    },
};

let moverRestRanks: readonly number[] = [];

const moveAndReorder: TScenario = {
    key: 'moveAndReorder',
    label: 'a row arrives mid-order',
    description:
        `${MOVER_COUNT} steps. Each step changes one row's \`group\` and \`rank\` together, so it ` +
        'leaves the top of view A and lands in the middle of view B, not at its top. Compare with ' +
        '"row moves between groups", where the row always lands at position 0, the cheapest place to ' +
        'insert into a sorted list. Both views must change every step and stay full, and the final ' +
        'positions are checked.',
    standing: ORDINARY_SCRIPT,
    steps: MOVER_COUNT,
    rebuild: false,
    finalStateOnly: true,
    repeatable: false,
    prepare: ctx => {
        moverRestRanks = ctx.plan.movers.map(id => ctx.rowById.get(id)?.rank ?? 0);
    },
    restore: ctx => {
        const movers = ctx.plan.movers;
        for (let i = 0; i < movers.length; i++) {
            ctx.binding.setGroup(movers[i], ctx.view.groupA);
            ctx.binding.setRank(movers[i], moverRestRanks[i]);
        }
        ctx.binding.settle();
    },
    run: ctx => {
        const movers = ctx.plan.movers;
        const arrivals = ctx.plan.arrivalRanks;
        for (let at = 0; at < movers.length; at++) {
            ctx.binding.frame(() => {
                ctx.binding.setGroup(movers[at], ctx.view.groupB);
                ctx.binding.setRank(movers[at], arrivals[at]);
            });
            ctx.binding.settle();
        }
    },
    check: ctx =>
        atLeast('view A distinct renders', ctx.consumers.a.distinct, ctx.plan.movers.length) ??
        atLeast('view B distinct renders', ctx.consumers.b.distinct, ctx.plan.movers.length) ??
        expect('view A rows', ctx.consumers.a.rowCount(), ctx.view.window) ??
        expect('view B rows', ctx.consumers.b.rowCount(), ctx.view.window),
    oracle: (ctx, model) => {
        const movers = ctx.plan.movers;
        const arrivals = ctx.plan.arrivalRanks;
        for (let at = 0; at < movers.length; at++) {
            model.setGroup(movers[at], ctx.view.groupB);
            model.setRank(movers[at], arrivals[at]);
            model.emit();
        }
    },
};

/** One row's sort key moves inside the window. Row set constant, order not. */
const sortKeyMove: TScenario = {
    key: 'sortKeyMove',
    label: 'sort key moves',
    description:
        `${SORTER_COUNT * 2} steps. Each step changes one row's \`rank\` so that it moves to another ` +
        'place inside view A. The same rows stay on screen; only their order changes. View B must not ' +
        'change.',
    standing: ORDINARY_SCRIPT,
    steps: SORTER_COUNT * 2,
    rebuild: false,
    // Each sorter goes low then high, ending where it started.
    repeatable: true,
    prepare: () => undefined,
    restore: ctx => {
        for (const sorter of ctx.plan.sorters) ctx.binding.setRank(sorter.id, sorter.rest);
        ctx.binding.settle();
    },
    run: ctx => {
        const sorters = ctx.plan.sorters;
        const steps = sorters.length * 2;
        for (let i = 0; i < steps; i++) {
            const sorter = sorters[i % sorters.length];
            ctx.binding.setRank(sorter.id, i < sorters.length ? sorter.low : sorter.high);
            ctx.binding.settle();
        }
    },
    check: ctx =>
        expect('view A distinct renders', ctx.consumers.a.distinct, ctx.plan.sorters.length * 2) ??
        expect('view B distinct renders', ctx.consumers.b.distinct, 0),
    oracle: (ctx, model) => {
        const sorters = ctx.plan.sorters;
        const steps = sorters.length * 2;
        for (let i = 0; i < steps; i++) {
            const sorter = sorters[i % sorters.length];
            model.setRank(sorter.id, i < sorters.length ? sorter.low : sorter.high);
            model.emit();
        }
    },
};

/**
 * THE WHOLE WINDOW RE-ORDERED, EVERY FRAME. A report holding only `sortKeyMove`
 * claimed the best point of a curve as the curve.
 *
 * WHY IT IS EXPECTED TO GO BADLY FOR US, before it is measured.
 *
 *  - THE BUDGET FLIPS TO A FULL SORT. `engine/bucket/array/OIMBucketSlotsServiceArrayDriven.ts` repairs a bucket
 *    row by row unless `2 · moved + arrived > settleBudget(n)` (about
 *    `2 · log₂ n`). One mover in a ~200-row bucket is 2 against ~16; a whole
 *    window is 64 against 16 at the default point, and takes `rows.sort` over
 *    the WHOLE bucket every frame — so we spend what an index-less store spends
 *    AND paid to maintain the bucket on the way in.
 *  - THE WINDOW'S SHAPE MOVES EVERY FRAME, so `adapters/oimdb.ts` and
 *    `adapters/tinybase.ts` — the two subscribing to the VISIBLE ROWS — re-point
 *    one subscription per visible row per frame. LINEAR IN `BENCH_WINDOW`, which
 *    is why this row must be read at the runner's `wide` point before any claim
 *    is made from the default one.
 *
 * MEMBERSHIP NEVER MOVES, AND THAT IS CONSTRUCTED: `plan.resortRanks` is `WINDOW`
 * distinct values all strictly below the lowest rank OUTSIDE the window, so no
 * permutation of them — nor any half-applied prefix of one — can pull a row in or
 * push one out. So an eager store that re-derives after each rank write sees a
 * full, correctly-ordered window in every intermediate state.
 */
const resortWindow: TScenario = {
    key: 'resortWindow',
    label: 'the whole window re-sorted',
    description:
        `${RESORT_FRAMES} steps. Each step changes the \`rank\` of all ${WINDOW} rows of view A at ` +
        'once, so the whole page is reordered while the same rows stay on it. Compare with "sort key ' +
        'moves", which moves one row: together they show how the cost of keeping a list sorted grows ' +
        'with how much of the order changed. View B must not change.',
    standing: ORDINARY_SCRIPT,
    steps: RESORT_FRAMES,
    rebuild: false,
    // Many writes, one settle — the render count is the store's. An eager store
    // re-derives after each rank write and every one of those states is a
    // genuinely different order. See `TScenario.finalStateOnly`.
    finalStateOnly: true,
    // Restored, and the rotation by `frame + 1` places never deals the same rank
    // to the same row on consecutive frames. See `run`.
    repeatable: true,
    prepare: () => undefined,
    restore: ctx => {
        for (const id of ctx.plan.windowA) {
            const row = ctx.rowById.get(id);
            if (row !== undefined) ctx.binding.setRank(id, row.rank);
        }
        ctx.binding.settle();
    },
    /**
     * A ROTATION OF THE POOL BY `frame + 1` PLACES, and every element of it is a
     * real change. `resortRanks` holds `WINDOW` DISTINCT values, so
     * `pool[(i + s) % WINDOW]` and `pool[(i + s') % WINDOW]` differ for every `i`
     * whenever `s ≠ s'`; consecutive frames use `s` and `s + 1`, the last frame
     * of a run uses `RESORT_FRAMES` against the next run's `1` (different because
     * `RESORT_FRAMES` is at least two and below `WINDOW`), and the first frame
     * after a `restore` writes pool values over the rows' own scattered ranks. So
     * a run is exactly `RESORT_FRAMES × WINDOW` rank writes and `RESORT_FRAMES`
     * settles.
     */
    run: ctx => {
        const ids = ctx.plan.windowA;
        const ranks = ctx.plan.resortRanks;
        const width = ids.length;
        for (let frame = 0; frame < RESORT_FRAMES; frame++) {
            const shift = frame + 1;
            ctx.binding.frame(() => {
                for (let i = 0; i < width; i++) {
                    ctx.binding.setRank(ids[i], ranks[(i + shift) % width]);
                }
            });
            ctx.binding.settle();
        }
    },
    /**
     * View A still FULL (a short window means a rank write changed a MEMBERSHIP,
     * which by construction none can), view B NOTHING DISTINCT, and view A
     * delivered at least once per frame for `patchMostRows.check`'s reason.
     *
     * The ORDER is not asked for here, deliberately: it is the measurement's
     * subject, and is adjudicated against the reference model by the final-state
     * comparison, which folds the rendered lines in view order.
     */
    check: ctx =>
        expect(
            'view A rows',
            ctx.consumers.a.rowCount(),
            Math.min(WINDOW, ctx.plan.groupSize)
        ) ??
        expect('view B distinct renders', ctx.consumers.b.distinct, 0) ??
        atLeast('view A distinct renders', ctx.consumers.a.distinct, RESORT_FRAMES),
    oracle: (ctx, model) => {
        const ids = ctx.plan.windowA;
        const ranks = ctx.plan.resortRanks;
        const width = ids.length;
        for (let frame = 0; frame < RESORT_FRAMES; frame++) {
            const shift = frame + 1;
            for (let i = 0; i < width; i++) {
                model.setRank(ids[i], ranks[(i + shift) % width]);
            }
            model.emit();
        }
    },
};

/**
 * A CONSUMER PER GROUP, AND ONE OF THEM MAY MOVE — the wake-up selectivity of a
 * whole screen, the one question the two-view wiring cannot put.
 *
 * WHY IT NEEDS FIFTY CONSUMERS AND NOT ONE. `BenchConsumer` folds one hash per
 * begin/end pair and increments one counter, so folding fifty groups into a
 * single consumer makes a store that woke once and a store that woke fifty times
 * produce identical digests and identical numbers. Hence `bindPerGroup` and a
 * second consumer set rather than a wider one.
 *
 * IT SETTLES INSIDE THE LOOP, DELIBERATELY, which makes the frame count the
 * SCRIPT's decision and is what lets `check` demand it.
 *
 * THE WINDOW MOVES WITH `BENCH_WINDOW`, because the per-shape-change cost of a
 * subscription scoped to the VISIBLE rows is linear in the window and oimdb and
 * tinybase are the two that pay it. A fan frozen at the smallest window would be
 * this report choosing the point where our own cost is least visible; the sweep
 * over the windows in `cells/points.ts` is what stops it.
 */
const consumerPerGroup: TScenario = {
    key: 'consumerPerGroup',
    label: 'a consumer per group',
    description:
        `${GROUPS} steps, with one view per group (${GROUPS} views) instead of two. Each step reorders ` +
        "rows inside one group's page, so exactly one view may re-render. Measured: how many of the " +
        `other ${GROUPS - 1} views were woken anyway. A library that notifies only the affected group ` +
        `wakes ${GROUPS} views in total; one that notifies everybody wakes ${GROUPS} × ${GROUPS}, and ` +
        'each of those views re-renders its page.',
    standing: ORDINARY_SCRIPT,
    steps: GROUPS,
    perGroup: true,
    rebuild: false,
    // Each sorter alternates between two ranks both inside its own window, so a
    // repeat is always a real change. Hence the turn reset in `restore`.
    repeatable: true,
    prepare: () => undefined,
    restore: ctx => {
        const groups = ctx.plan.groups;
        for (let i = 0; i < groups.length; i++) {
            ctx.binding.setRank(groups[i].sorter.id, groups[i].sorter.rest);
        }
        ctx.binding.settle();
        fanTurn = 0;
    },
    run: ctx => {
        const groups = ctx.plan.groups;
        fanTurn ^= 1;
        for (let i = 0; i < groups.length; i++) {
            const sorter = groups[i].sorter;
            ctx.binding.setRank(sorter.id, fanTurn === 1 ? sorter.low : sorter.high);
            // INSIDE the loop: one write, one frame, one consumer's worth of new
            // state. The forty-nine with nothing to show are the measurement.
            ctx.binding.settle();
        }
    },
    /**
     * ONE NEW STATE PER CONSUMER, asked of every one of the fifty rather than of
     * the total: a consumer that produced none was never told about the one step
     * that concerned it, and a store that quietly dropped a group would otherwise
     * post the best selectivity in the table. The row count is asked of each too,
     * because a short window means a rank move changed a MEMBERSHIP.
     */
    check: ctx => {
        const views = ctx.groupConsumers.views;
        for (let i = 0; i < views.length; i++) {
            const view = views[i];
            const failure =
                expect(`${view.group} distinct renders`, view.consumer.distinct, 1) ??
                expect(`${view.group} rows`, view.consumer.rowCount(), ctx.view.window);
            if (failure !== undefined) return failure;
        }
        return undefined;
    },
    oracle: (ctx, model) => {
        const groups = ctx.plan.groups;
        // The turn `run` just used: the two replays have to write the same ranks.
        for (let i = 0; i < groups.length; i++) {
            const sorter = groups[i].sorter;
            model.setRank(sorter.id, fanTurn === 1 ? sorter.low : sorter.high);
            model.emitEveryGroup();
        }
    },
};

/**
 * THE WINDOW DELETED, and the window has to refill from the rows behind it.
 * `OIMBucketServiceOrdered` — the bucket service the oimdb adapter uses — opens
 * its own documentation with "Removal is O(n)" and implements removal as
 * `indexOf` plus `splice`.
 *
 * The whole window rather than one row: a single deletion is one splice and one
 * re-render, which measures the delivery. `WINDOW` rows out of a ~200-row ordered
 * group in one batch measures the bucket service.
 */
const deleteRows: TScenario = {
    key: 'deleteRows',
    label: 'delete the visible window',
    description:
        `One step: all ${WINDOW} rows view A shows, the top of group A, are deleted in one batch. ` +
        'View A must re-render once, refilled with the rows that were below it. View B shows a ' +
        'different group and must not change.',
    standing: ORDINARY_SCRIPT,
    steps: 1,
    rebuild: false,
    // The rows are gone after one pass, so a second would report the no-op path
    // as the delete path.
    repeatable: false,
    prepare: () => undefined,
    // Untimed: the deleted rows written back with the values they had, so every
    // sample deletes the same rows from the same state. Harmless before the first
    // sample, where nothing has been deleted yet.
    restore: ctx => {
        ctx.binding.write(ctx.deletedRows);
        ctx.binding.settle();
    },
    run: ctx => {
        ctx.binding.remove(ctx.plan.windowA);
        ctx.binding.settle();
    },
    check: ctx =>
        expect('view A distinct renders', ctx.consumers.a.distinct, 1) ??
        expect('view B distinct renders', ctx.consumers.b.distinct, 0) ??
        // The window refilled: a store that deleted the rows and left a short
        // window did not do the same work as one that pulled the next rows in.
        expect(
            'view A rows',
            ctx.consumers.a.rowCount(),
            Math.min(WINDOW, ctx.plan.groupSize - ctx.plan.windowA.length)
        ),
    oracle: (ctx, model) => {
        const ids = ctx.plan.windowA;
        for (let i = 0; i < ids.length; i++) model.remove(ids[i]);
        model.emit();
    },
};

let deletedOneRows: readonly TRow[] = [];
let deletedOneIds: readonly (readonly string[])[] = [];

const deleteOneRow: TScenario = {
    key: 'deleteOneRow',
    label: 'delete one visible row',
    description:
        `${DELETE_ONE_STEPS} steps. Each step deletes one row view A shows, from different positions ` +
        'on the page: js-framework-benchmark\'s "remove row". View A must re-render once per step and ' +
        'stay full, pulling up the next row from below. View B must not change. Compare with "delete ' +
        'the visible window", which deletes the whole page at once.',
    standing: ORDINARY_SCRIPT,
    steps: DELETE_ONE_STEPS,
    rebuild: false,
    repeatable: false,
    prepare: ctx => {
        const held: TRow[] = [];
        for (const id of ctx.plan.deletedOne) {
            const row = ctx.rowById.get(id);
            if (row !== undefined) held.push({ ...row });
        }
        deletedOneRows = held;
        deletedOneIds = ctx.plan.deletedOne.map(id => [id]);
    },
    restore: ctx => {
        ctx.binding.write(deletedOneRows);
        ctx.binding.settle();
    },
    run: ctx => {
        for (let i = 0; i < deletedOneIds.length; i++) {
            ctx.binding.remove(deletedOneIds[i]);
            ctx.binding.settle();
        }
    },
    check: ctx =>
        expect('view A distinct renders', ctx.consumers.a.distinct, DELETE_ONE_STEPS) ??
        expect('view B distinct renders', ctx.consumers.b.distinct, 0) ??
        expect(
            'view A rows',
            ctx.consumers.a.rowCount(),
            Math.min(WINDOW, ctx.plan.groupSize - DELETE_ONE_STEPS)
        ),
    oracle: (ctx, model) => {
        const ids = ctx.plan.deletedOne;
        for (let i = 0; i < ids.length; i++) {
            model.remove(ids[i]);
            model.emit();
        }
    },
};

let drainRows: readonly TRow[] = [];
let drainIds: readonly string[] = [];

const drainGroup: TScenario = {
    key: 'drainGroup',
    label: 'the group empties under the view',
    description:
        'Two steps, starting with group A empty. Step one inserts every row of group A, so its list ' +
        'is built from nothing; step two deletes all of them in one batch, so view A must end showing ' +
        'an empty list. No other scenario empties a list. Afterwards the store is checked for rows a ' +
        'partial delete left behind. View B shows a different group and must not change.',
    standing: ORDINARY_SCRIPT,
    steps: 2,
    rebuild: false,
    finalStateOnly: true,
    repeatable: true,
    prepare: ctx => {
        drainRows = cloneRows(ctx.rows.filter(row => row.group === ctx.view.groupA));
        drainIds = drainRows.map(row => row.id);
    },
    restore: ctx => {
        ctx.binding.remove(drainIds);
        ctx.binding.settle();
    },
    run: ctx => {
        ctx.binding.write(drainRows);
        ctx.binding.settle();
        ctx.binding.remove(drainIds);
        ctx.binding.settle();
    },
    check: ctx =>
        atLeast('view A distinct renders', ctx.consumers.a.distinct, 2) ??
        expect('view B distinct renders', ctx.consumers.b.distinct, 0) ??
        expect('view A rows', ctx.consumers.a.rowCount(), 0),
    oracle: (_ctx, model) => {
        for (const id of drainIds) model.remove(id);
        model.emit();
        model.settled();
        for (const row of drainRows) model.put(row);
        model.emit();
        for (const id of drainIds) model.remove(id);
        model.emit();
    },
};

/**
 * ONE PAGE written again with the values it already holds. The array and its
 * objects are fresh every time, so only a genuine VALUE check can skip; see
 * `TBinding.write` for why an adapter may not supply one its library lacks.
 *
 * A re-send is a page refetched, and arrives at page size, not at population
 * size. The population audit compares the store's whole contents against the
 * model's afterwards, so a store that lost rows outside the page is still caught.
 */
const resendUnchanged: TScenario = {
    key: 'resendUnchanged',
    label: 're-send unchanged list',
    description:
        `One step: the ${WINDOW} rows view A shows are written again, as new objects, with exactly ` +
        'the values they already have, like a page fetched again from a server. The benchmark code ' +
        'does not filter them out, so this shows whether the library itself notices that nothing ' +
        'changed. No view may show new text; how often views were woken for nothing is counted.',
    standing: SILENT_SCRIPT,
    rendersNothing: true,
    steps: 1,
    rebuild: false,
    // Nothing changes, so nothing needs putting back.
    repeatable: true,
    prepare: () => undefined,
    restore: () => undefined,
    run: ctx => {
        // Cycled rather than reused, so that "the same array as last time" is
        // never true and a reference check cannot stand in for a value check.
        resendTurn = (resendTurn + 1) % ctx.resendCopies.length;
        ctx.binding.write(ctx.resendCopies[resendTurn]);
        ctx.binding.settle();
    },
    check: ctx =>
        expect('view A distinct renders', ctx.consumers.a.distinct, 0) ??
        expect('view B distinct renders', ctx.consumers.b.distinct, 0),
    oracle: (ctx, model) => {
        const copy = ctx.resendCopies[resendTurn];
        for (let i = 0; i < copy.length; i++) model.put(copy[i]);
        model.emit();
    },
};

/**
 * ONE COLUMN OF ONE ROW, WRITTEN TO A ROW THE CALLER HAD ALREADY RESOLVED.
 *
 * WHY THE ADDRESS IS PINNED. Every other write here is addressed by KEY, so the
 * report charges every library the map read, ours included:
 * `packages/core/src/abstract/OIMCollection.ts:469` states 103-132 ns for it
 * against 36-51 for the identity path, which left our documented identity
 * principle unmeasurable under the contract as it stood. For a library that hands
 * back nothing for a key, the honest answer is that the id is the handle and
 * these writes cost what the keyed ones cost.
 *
 * WHY B RENDERS WHAT IT IS DRIVEN BY, and it is load-bearing: both halves then
 * produce exactly one distinct render per pinned row for EVERY correct store, so
 * the entire discriminator moves into the DELIVERY and REDUNDANCY counters.
 *
 * FEW ROWS, so a redundant delivery stands above the per-delivery consumer
 * constant instead of under it.
 *
 * WHAT THIS ROW DOES NOT ISOLATE: the PIN. Both halves write through it, so what
 * the address itself is worth needs its own control — two harness-owned bodies
 * differing only in the lookup. See `WHY-EACH-ROW.md`.
 */
const cellDelivery: TScenario = {
    key: 'cellDelivery',
    label: 'targeted column delivery',
    description:
        `${PINNED_COUNT * 2} steps over ${PINNED_COUNT} rows that are looked up once before timing ` +
        'starts. View A shows their `label`, view B their `note`. The first half of the steps changes ' +
        'each `label`, the second half each `note`. A change must reach only the view showing that ' +
        'field: a library that tracks fields wakes one view per change, one that tracks whole rows ' +
        'wakes both, and one that tracks nothing re-reads everything.',
    // The ordinary standing with its own answers throughout, written out in full
    // rather than signed over `ORDINARY_SCRIPT`: this script is the one whose
    // subject is DELIVERY GRANULARITY, and five of the thirteen are wrong for
    // different reasons here than they would be anywhere else.
    standing: signedFor(['cellDelivery'], {
        A1: met(
            'both consumers left on the window views. The whole script addresses rows by POSITION off ' +
                'screen, so a consumer still rendering a window would be re-pointed at rows no write ' +
                'in this script touches and every step would deliver nothing.'
        ),
        A2: met(
            '`redundant` folded into `deliveries`. This row\'s answer IS the redundancy count: every ' +
                'correct store produces the same distinct renders, and the only thing separating one ' +
                'that routes by column from one whose granularity is the row is how often it woke the ' +
                'view holding text it already had.'
        ),
        A3: met(
            'the pinned writes bypassing the store — `patchPinnedLabel` reaching the consumer without ' +
                'the value being stored would leave both digests right and the population wrong, which ' +
                'is the exact case the column audit exists for.'
        ),
        A4: met(
            'the timed process ending without the clean pass. A store can produce every counter this ' +
                'script demands and have written the two columns to the wrong pinned positions.'
        ),
        B1: met(
            'one participant resolving a pinned position to a key inside the clock while another was ' +
                'allowed to resolve it in `prepare`. `pin` is the one untimed resolution in the suite ' +
                'and both halves write through it.'
        ),
        B2: met(
            'the anchor pinning a resolved reference where a person writing it would keep the key and ' +
                'look it up. Both halves of this script write through the pin, so a pin that cost ' +
                'nothing to use would flatter every row here alike.'
        ),
        B3: met(
            'an adapter remembering the last value and comparing to decide which column moved. That ' +
                'is the library\'s job, and it is exactly why LokiJS declines the column mount shape.'
        ),
        // MET SINCE 2026-08-30. The gap was that `consumerFloor` measures a WINDOW
        // delivery of `WINDOW` lines where a step here delivers a CELL VIEW of
        // `PINNED_COUNT`, so the floor was LARGER than a step and the multiple an
        // under-estimate — arithmetic pointing the wrong way, on which no row
        // could be refused a place. `cellFloor` measures one cell delivery of
        // `PINNED_COUNT` lines and `floorKeyFor` hands this table that one.
        B4: met(
            '`floorKeyFor` handing this table `consumerFloor`. A step here delivers `PINNED_COUNT` ' +
                'lines where that floor measures `WINDOW`, so the multiple would be an UNDER-estimate ' +
                'and the gate would refuse rows on arithmetic pointing the wrong way.'
        ),
        C1: met(
            'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
                'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
        ),
        C2: met(
            'a sampling plan derived per adapter rather than from the slowest participant of the ' +
                'scenario, or one cell of a minimum column carrying a mean.'
        ),
        C3: met(
            'a row whose spread is above `SPREAD_CEILING` being given a rank rather than the `·` ' +
                'that says its number is not being presented as a result.'
        ),
        C4: met(
            'the two arms of a pair measured in one process. One call site taught both shapes prices ' +
                'the second arm through a polymorphic site neither arm has in production.'
        ),
        C5: met(
            '`control-write` failing to clear this table\'s drift. Its gap is small because the write ' +
                'path is a minority of these scripts\' time, and this row is the one where that ' +
                'minority is largest — every step is a write and no window is derived.'
        ),
    }),
    steps: PINNED_COUNT * 2,
    rebuild: false,
    // The suffix alternates, so a repeat is always a real change.
    repeatable: true,
    // THE ONE UNTIMED RESOLUTION, and the only place in the suite where an
    // adapter may look a key up on the harness's behalf and keep the answer. It
    // also re-points both consumers; see `TBinding.pin`.
    prepare: ctx => {
        ctx.binding.pin(ctx.cells);
    },
    // Both columns of every pinned row put back through the SAME pinned path the
    // script writes through, so the state a sample starts from is the state
    // `pin` rendered.
    restore: ctx => {
        const ids = ctx.cells.ids;
        for (let at = 0; at < ids.length; at++) {
            const row = ctx.rowById.get(ids[at]);
            if (row === undefined) continue;
            ctx.binding.patchPinnedLabel(at, row.label);
            ctx.binding.patchPinnedNote(at, row.note);
        }
        ctx.binding.settle();
        cellTurn = 0;
    },
    // ONE SETTLE PER WRITE, in both halves: the frame count is the script's
    // decision, which is what lets this row keep the sequence digest as its
    // criterion. Values alternate for `patchColumn`'s reason.
    run: ctx => {
        const ids = ctx.cells.ids;
        cellTurn ^= 1;
        const suffix = cellTurn === 1 ? '' : 'x';
        const labels = ctx.plan.patchedLabels;
        const notes = ctx.plan.patchedNotes;
        for (let at = 0; at < ids.length; at++) {
            ctx.binding.patchPinnedLabel(at, `${labels[at]}${suffix}`);
            ctx.binding.settle();
        }
        for (let at = 0; at < ids.length; at++) {
            ctx.binding.patchPinnedNote(at, `${notes[at]}${suffix}`);
            ctx.binding.settle();
        }
    },
    /**
     * ONE DISTINCT RENDER PER PINNED ROW, PER VIEW. A's states come from the label
     * half and B's from the note half; in the other half each is handed text it
     * already shows, a redundant delivery and not a state. So it holds whether the
     * store woke one view per write or both, and the difference is reported by the
     * counters rather than failed here.
     */
    check: ctx =>
        expect('cell view A (label) distinct renders', ctx.consumers.a.distinct, PINNED_COUNT) ??
        expect('cell view B (note) distinct renders', ctx.consumers.b.distinct, PINNED_COUNT),
    /**
     * Opens by putting the model into the state `pin` left the adapter's consumers
     * in. The worker's load leaves the model's consumers on a WINDOW state while
     * the adapter's are on the CELL state `pin` delivered; without `emitCells` +
     * `settled()` the model's first cell delivery of the note half is distinct
     * where the adapter's was redundant, and every adapter is reported as
     * disagreeing with a model that had simply started somewhere else.
     */
    oracle: (ctx, model) => {
        const cells = ctx.cells;
        model.emitCells(cells);
        model.settled();
        const suffix = cellTurn === 1 ? '' : 'x';
        const labels = ctx.plan.patchedLabels;
        const notes = ctx.plan.patchedNotes;
        for (let at = 0; at < cells.ids.length; at++) {
            model.setLabel(cells.ids[at], `${labels[at]}${suffix}`);
            model.emitCells(cells);
        }
        for (let at = 0; at < cells.ids.length; at++) {
            model.setNote(cells.ids[at], `${notes[at]}${suffix}`);
            model.emitCells(cells);
        }
    },
};

/* ── subscription churn: what a mount and an unmount cost ──────────────── */

/**
 * THE CHURN FAMILY. ONE CYCLE, the same for every mount script, repeated
 * {@link CHURN_CYCLES} times:
 *
 *     mount every churned subscriber
 *     write `label` on churn row 0            ← `churnList` writes each subscriber's row
 *     settle                                  ← ONE delivery: `${woke}:${head}`
 *     unmount them, in this script's order
 *     write the same rows again
 *     settle                                  ← nothing standing → NO delivery
 *
 * The frame either side is one write and one settle because anything larger is
 * priced into every row alike and buries the difference between them. Repeating
 * it is what makes this a REMOUNT cost rather than one pair measured cold.
 *
 * WHAT MAKES THE MOUNTS AND UNMOUNTS PROVABLE. A row that timed
 * `mount()`/`unmount()` and checked nothing would rank the adapters whose author
 * wrote the emptiest pair of functions. So the delivery carries what the store
 * cannot fabricate (`deliverChurn` in `render.ts`, `TChurnBinding`): the mounted
 * frame must report exactly the standing count, the label subscriber 0 read and,
 * on audited passes, the fold of every standing slot's read; the unmounted frame
 * must deliver NOTHING AT ALL.
 *
 * ONE FACTORY, AND THE ORACLE IS INSIDE IT, because the oracle does not vary with
 * the mount shape — the shape decides who is woken, not what the frame shows.
 * What the factory must NOT be given, and is not, is anything read off an
 * adapter: it is handed the counts the SCRIPT mounts.
 */

/**
 * ONE MARK PER FRAME OF A CHURN RUN, pairwise distinct — `DIRTY_MARKS`'s idiom
 * for its reasons. The `s` prefix is distinct from every other value set in this
 * suite (`l` stored, `p` patched, `b` batched, `d` dirty), so a label found in
 * the wrong place names the script that wrote it.
 */
const CHURN_MARKS: readonly string[] = Array.from(
    { length: CHURN_CYCLES * 2 },
    (_, k) => `s${'x'.repeat(k)}`
);

/**
 * The churn wiring, or the reason there is none. `ctx.churn` unset means the
 * binding came from the wrong builder, and it says so rather than proceeding.
 */
const churnOf = (ctx: TScenarioContext): TChurnBinding => {
    if (ctx.churn === undefined) {
        throw new Error(
            'a churn script was run against a binding that was not built by ' +
                '`adapter.churn[shape].build`. The scenario must name its mount shape in `churn` so ' +
                'the worker picks the third builder.'
        );
    }
    return ctx.churn;
};

/** How subscriber `at` is wired. One line per shape, named at the call site. */
type TChurnMount = (churn: TChurnBinding, at: number) => void;

type TChurnShape = {
    key: TScenarioKey;
    label: string;
    description: string;
    /**
     * WHICH OF THE FIVE MOUNT SHAPES `mount` PERFORMS — the declaration this
     * script is answered from, and the unit an adapter declines in. Two scripts
     * with the same `mount` share a shape: five row scripts vary the subscriber
     * count and the unmount order, not what is subscribed to.
     */
    wiring: TChurnShapeKey;
    /**
     * WHERE THIS CHURN SCRIPT STANDS AGAINST THE STANDARD. Required here rather
     * than defaulted inside the factory: a default would make the two scripts
     * with a fourth NOT MET into overrides, an override is a spread, and a spread
     * hands back the guarantee that no item can go unanswered.
     */
    standing: TStandardStanding;
    /**
     * How many subscribers stay mounted for the WHOLE sample — mounted in
     * `prepare`, untimed, never touched by the timed loop. Zero for every script
     * but the resident one.
     *
     * They take the LOW indices, `0 .. resident - 1`, and that is load-bearing:
     * subscriber 0 is the one whose read is rendered, so it has to be standing in
     * every frame the script asserts a delivery for. With the residents on the
     * high indices, the unmounted frame of the resident script would render
     * whatever subscriber 0 read one frame ago.
     */
    resident: number;
    /** How many are mounted and unmounted inside the timed region, per cycle. */
    churned: number;
    mountResident: TChurnMount;
    mount: TChurnMount;
    /**
     * Unmount last-mounted-first rather than first-mounted-first.
     *
     * Different operations wherever a subscriber list is an array and leaving it
     * is `indexOf` plus `splice`: taking the FIRST out finds it in one compare
     * then moves every other element down; taking the LAST out scans the whole
     * array and moves nothing. Both orders happen in real code — a list unmounted
     * from the top, a stack of routes popped — and one order cannot report both.
     */
    reversed: boolean;
    rowsWrittenIn: (cycle: number) => number;
    wokeIn: (cycle: number, standing: number) => number;
    rowOf: (at: number) => number;
    headOf: (label: string) => string;
    headOfWindow?: (labels: readonly string[], at: number) => string;
};

type TChurnDelivery = { woke: number; reads: readonly string[] };

const churnLabelOf = (mark: string, row: number): string =>
    row === 0 ? mark : `${mark}.${row}`;

const CHURN_LIST_LABELS: readonly (readonly string[])[] = CHURN_MARKS.map(mark =>
    Array.from({ length: CHURN_SUBSCRIBERS }, (_, row) => churnLabelOf(mark, row))
);

const emitChurnLine = (
    model: BenchOracle,
    id: string,
    rank: number,
    woke: number,
    reads: readonly (string | undefined)[]
): void => {
    model.a.begin();
    model.a.row(id, rank, churnLineOf(woke, reads));
    model.a.end();
};

const expectChurnHead = (
    ctx: TScenarioContext,
    woke: number,
    reads: readonly (string | undefined)[]
): string | undefined => {
    const want = `${ctx.plan.churnRows[0]} ${ctx.plan.churnRanks[0]} ${churnLineOf(woke, reads)}`;
    const got = ctx.consumers.a.head();
    return got === want
        ? undefined
        : `the last churn line is "${got}", and the script's last delivering frame says "${want}"`;
};

const makeChurnScenario = (shape: TChurnShape): TScenario => {
    const standing = shape.resident + shape.churned;
    const deliveriesPerCycle = shape.resident > 0 ? 2 : 1;
    let mostWritten = 0;
    for (let cycle = 0; cycle < CHURN_CYCLES; cycle++) {
        const written = shape.rowsWrittenIn(cycle);
        if (written < 1 || written > CHURN_SUBSCRIBERS) {
            throw new Error(
                `${shape.key} writes ${written} churn rows in cycle ${cycle}; a frame writes at least ` +
                    `row 0, which subscriber 0 renders, and the label table holds ${CHURN_SUBSCRIBERS}.`
            );
        }
        if (written > mostWritten) mostWritten = written;
    }
    const deliveriesOf = (ctx: TScenarioContext): TChurnDelivery[] => {
        const ids = ctx.plan.churnRows;
        const labels = Array.from(
            { length: ids.length },
            (_, row) => ctx.rowById.get(ids[row])?.label ?? ''
        );
        const headOfWindow = shape.headOfWindow;
        const readsOf = (count: number): string[] =>
            Array.from({ length: count }, (_, at) => headOfWindow === undefined
                ? shape.headOf(labels[shape.rowOf(at)])
                : headOfWindow(labels, at));
        const write = (frame: number, count: number): void => {
            for (let row = 0; row < count; row++) {
                labels[row] = churnLabelOf(CHURN_MARKS[frame], row);
            }
        };
        const deliveries: TChurnDelivery[] = [];
        for (let cycle = 0; cycle < CHURN_CYCLES; cycle++) {
            const written = shape.rowsWrittenIn(cycle);
            write(cycle * 2, written);
            deliveries.push({ woke: shape.wokeIn(cycle, standing), reads: readsOf(standing) });
            write(cycle * 2 + 1, written);
            if (shape.resident > 0) {
                deliveries.push({ woke: shape.resident, reads: readsOf(shape.resident) });
            }
        }
        return deliveries;
    };
    const writeFrame = (ctx: TScenarioContext, frame: number, count: number): void => {
        const ids = ctx.plan.churnRows;
        if (count === 1) {
            ctx.binding.patchLabel(ids[0], CHURN_MARKS[frame]);
            return;
        }
        const labels = CHURN_LIST_LABELS[frame];
        ctx.binding.frame(() => {
            for (let row = 0; row < count; row++) ctx.binding.patchLabel(ids[row], labels[row]);
        });
    };
    return {
        key: shape.key,
        label: shape.label,
        description: shape.description,
        standing: shape.standing,
        // The operation count a reader multiplies against the printed time: one
        // mount and one unmount per churned subscriber per cycle.
        steps: CHURN_CYCLES * shape.churned,
        churn: shape.wiring,
        auditChurnReads: true,
        rebuild: false,
        // Every cycle ends with exactly what it mounted unmounted, and every
        // frame writes a mark no neighbouring frame writes — including the last
        // frame of one run against the first frame of the next.
        repeatable: true,
        /**
         * The identities resolved once and the resident population mounted, both
         * untimed: a component mounts on a row it already has, and the standing
         * population is the CONDITION this script measures under rather than part
         * of what it measures.
         */
        prepare: ctx => {
            const churn = churnOf(ctx);
            churn.holdChurnRows(ctx.plan.churnRows, ctx.plan.churnRanks);
            for (let at = 0; at < shape.resident; at++) {
                shape.mountResident(churn, at);
            }
        },
        // The rows the frames write, put back with the values they had. Nothing
        // about the SUBSCRIPTIONS needs putting back: `run` unmounts everything
        // it mounted, and the residents are the binding's for its whole life.
        restore: ctx => {
            for (let at = 0; at < mostWritten; at++) {
                const id = ctx.plan.churnRows[at];
                const row = ctx.rowById.get(id);
                if (row !== undefined) ctx.binding.patchLabel(id, row.label);
            }
            ctx.binding.settle();
        },
        run: ctx => {
            const churn = churnOf(ctx);
            const first = shape.resident;
            const last = shape.resident + shape.churned - 1;
            for (let cycle = 0; cycle < CHURN_CYCLES; cycle++) {
                const written = shape.rowsWrittenIn(cycle);
                for (let at = first; at <= last; at++) shape.mount(churn, at);
                // THE FRAME WITH EVERYTHING STANDING. One settle, one delivery
                // naming how many bodies ran.
                writeFrame(ctx, cycle * 2, written);
                ctx.binding.settle();
                if (shape.reversed) {
                    for (let at = last; at >= first; at--) churn.unmount(at);
                } else {
                    for (let at = first; at <= last; at++) churn.unmount(at);
                }
                // AND THE FRAME AFTER THEY HAVE GONE. Identical work for the
                // store; the difference is who is left to hear about it.
                writeFrame(ctx, cycle * 2 + 1, written);
                ctx.binding.settle();
            }
        },
        /**
         * ONE DELIVERY PER FRAME THAT HAD A SUBSCRIBER, AND NONE FOR A FRAME THAT
         * DID NOT — an equality both ways: too few and a mount did not wire
         * anything, too many and an unmount did not unwire anything. `distinct`
         * must equal `deliveries` because every frame writes a mark no other frame
         * writes. View B's silence is not a formality: a churn binding derives no
         * view, so a delivery there means the binding built window wiring it was
         * not asked for.
         */
        check: ctx => {
            const deliveries = deliveriesOf(ctx);
            const last = deliveries[deliveries.length - 1];
            return (
                expect(
                    'churn view deliveries',
                    ctx.consumers.a.deliveries,
                    CHURN_CYCLES * deliveriesPerCycle
                ) ??
                expect(
                    'churn view distinct renders',
                    ctx.consumers.a.distinct,
                    CHURN_CYCLES * deliveriesPerCycle
                ) ??
                expect('view B deliveries', ctx.consumers.b.deliveries, 0) ??
                expectChurnHead(ctx, last.woke, last.reads)
            );
        },
        oracle: (ctx, model) => {
            const ids = ctx.plan.churnRows;
            const id = ids[0];
            const rank = ctx.plan.churnRanks[0];
            const deliveries = deliveriesOf(ctx);
            let next = 0;
            const write = (frame: number, count: number): void => {
                for (let row = 0; row < count; row++) {
                    model.setLabel(ids[row], churnLabelOf(CHURN_MARKS[frame], row));
                }
            };
            for (let cycle = 0; cycle < CHURN_CYCLES; cycle++) {
                const written = shape.rowsWrittenIn(cycle);
                write(cycle * 2, written);
                emitChurnLine(model, id, rank, deliveries[next].woke, deliveries[next].reads);
                next++;
                write(cycle * 2 + 1, written);
                // NOTHING IS EMITTED WHEN NOTHING IS STANDING. That absence is
                // the model's entire statement about unmounting: a store whose
                // `unmount` did nothing parts from this sequence rather than
                // posting the fastest time in the table.
                if (shape.resident > 0) {
                    emitChurnLine(model, id, rank, deliveries[next].woke, deliveries[next].reads);
                    next++;
                }
            }
        },
    };
};

/** Subscriber `at` reads churn row 0 and nothing else — the ordinary binding. */
const onSharedRow: TChurnMount = (churn, at) => churn.mountOnRows(at, 0, 1);

const asRead = (label: string): string => label;

const churnRowOnly = (): number => 1;

const everyStanding = (_cycle: number, standing: number): number => standing;

const onRowZero = (): number => 0;

const CHURN_LIST_SHRINK = Math.floor(CHURN_SUBSCRIBERS / CHURN_CYCLES);

const churnListPrefix = (cycle: number): number => CHURN_SUBSCRIBERS - cycle * CHURN_LIST_SHRINK;

const chainHead = (label: string): string => chainHeadOf(label, CHURN_CHAIN_DEPTH);

const chainWindowHead = (labels: readonly string[], at: number): string =>
    chainHeadOf(chainWindowOf(labels, at, CHURN_CHAIN_ROOTS), CHURN_CHAIN_DEPTH);

const onlyTheFirstWindow = (): number => 1;

const onOwnWindow = (churn: TChurnBinding, at: number): void =>
    churn.mountOnChain(at, at, CHURN_CHAIN_ROOTS, CHURN_CHAIN_DEPTH);

const churnOne = makeChurnScenario({
    key: 'churnOne',
    wiring: 'row',
    label: 'mount and unmount one subscriber',
    description:
        `${CHURN_CYCLES} cycles of: subscribe one component to one row, change the row; unsubscribe, ` +
        'change it again. The smallest mount and unmount, which every other mount and unmount ' +
        'scenario is compared with. The first change must reach the component once; the second must ' +
        'reach nobody.',
    standing: CHURN_SCRIPT,
    resident: 0,
    churned: 1,
    mountResident: onSharedRow,
    mount: onSharedRow,
    reversed: false,
    rowsWrittenIn: churnRowOnly,
    wokeIn: everyStanding,
    rowOf: onRowZero,
    headOf: asRead,
});

const churnShared = makeChurnScenario({
    key: 'churnShared',
    wiring: 'row',
    label: 'N subscribers on one root, oldest out first',
    description:
        `${CHURN_CYCLES} cycles of: subscribe ${CHURN_SUBSCRIBERS} components to the same row, change ` +
        'it, unsubscribe them oldest first, change it again. This is a list of components bound to ' +
        'one shared object being mounted and unmounted. Compare with "mount and unmount one ' +
        'subscriber" for the cost per component, and with the N×8 variant for whether that cost grows ' +
        'with the number already subscribed.',
    standing: CHURN_SCRIPT,
    resident: 0,
    churned: CHURN_SUBSCRIBERS,
    mountResident: onSharedRow,
    mount: onSharedRow,
    reversed: false,
    rowsWrittenIn: churnRowOnly,
    wokeIn: everyStanding,
    rowOf: onRowZero,
    headOf: asRead,
});

const churnSharedReversed = makeChurnScenario({
    key: 'churnSharedReversed',
    wiring: 'row',
    label: 'N subscribers on one root, newest out first',
    description:
        `The same as "N subscribers on one root, oldest out first", but the ${CHURN_SUBSCRIBERS} ` +
        'components unsubscribe newest first. The difference shows whether the order of unmounting ' +
        'matters: a library that keeps subscribers in an array pays differently for removing from ' +
        'its front and from its back.',
    standing: CHURN_SCRIPT,
    resident: 0,
    churned: CHURN_SUBSCRIBERS,
    mountResident: onSharedRow,
    mount: onSharedRow,
    reversed: true,
    rowsWrittenIn: churnRowOnly,
    wokeIn: everyStanding,
    rowOf: onRowZero,
    headOf: asRead,
});

const churnSharedDeep = makeChurnScenario({
    key: 'churnSharedDeep',
    wiring: 'row',
    label: 'N×8 subscribers on one root, oldest out first',
    description:
        `The same as "N subscribers on one root, oldest out first" with ${CHURN_SUBSCRIBERS_DEEP} ` +
        `components instead of ${CHURN_SUBSCRIBERS}. If unsubscribing is linear, eight times the ` +
        'components cost eight times more; sixty-four times more means it is quadratic. One size ' +
        'cannot tell those apart, which is why there are two.',
    standing: CHURN_SCRIPT,
    resident: 0,
    churned: CHURN_SUBSCRIBERS_DEEP,
    mountResident: onSharedRow,
    mount: onSharedRow,
    reversed: false,
    rowsWrittenIn: churnRowOnly,
    wokeIn: everyStanding,
    rowOf: onRowZero,
    headOf: asRead,
});

const churnSharedDeepReversed = makeChurnScenario({
    key: 'churnSharedDeepReversed',
    wiring: 'row',
    label: 'N×8 subscribers on one root, newest out first',
    description:
        `${CHURN_SUBSCRIBERS_DEEP} components on one row, unsubscribing newest first. With the other ` +
        'three variants it shows whether the effect of unmount order grows with the number of ' +
        'components or stays constant.',
    standing: CHURN_SCRIPT,
    resident: 0,
    churned: CHURN_SUBSCRIBERS_DEEP,
    mountResident: onSharedRow,
    mount: onSharedRow,
    reversed: true,
    rowsWrittenIn: churnRowOnly,
    wokeIn: everyStanding,
    rowOf: onRowZero,
    headOf: asRead,
});

const churnWide = makeChurnScenario({
    key: 'churnWide',
    wiring: 'wide',
    label: 'one subscriber over many sources',
    description:
        `${CHURN_CYCLES} cycles of: subscribe one component that reads ${CHURN_WIDE} rows, change the ` +
        'first of them, unsubscribe, change it again. The other variants vary how many components ' +
        'watch one row; this one varies how many rows one component watches, which is what a ' +
        'subscription pays to register with each of its sources and to leave them. Compare with ' +
        '"mount and unmount one subscriber", whose component reads one row.',
    standing: CHURN_SCRIPT,
    resident: 0,
    churned: 1,
    mountResident: onSharedRow,
    mount: (churn, at) => churn.mountOnRows(at, 0, CHURN_WIDE),
    reversed: false,
    rowsWrittenIn: churnRowOnly,
    wokeIn: everyStanding,
    rowOf: onRowZero,
    headOf: asRead,
});

const churnColumn = makeChurnScenario({
    key: 'churnColumn',
    wiring: 'column',
    label: 'N subscribers on one column',
    description:
        `The same as "N subscribers on one root, oldest out first" (${CHURN_SUBSCRIBERS} components, ` +
        `${CHURN_CYCLES} cycles), but each component subscribes to one field of the row, \`label\`, ` +
        'instead of the whole row. The difference is what subscribing to a single field costs. A ' +
        'library with no per-field subscription skips this scenario rather than repeat its whole-row ' +
        'number.',
    /**
     * THE CHURN WIRING'S TWO EXCEPTIONS, WRITTEN OUT RATHER THAN SIGNED OVER
     * `CHURN_SCRIPT` — because this table no longer holds the same libraries as
     * the tables it is READ AGAINST.
     *
     * The per-shape split took
     * `lokijs` and `oimdb-3.12.1` out of this table and left them in the other
     * three churn shapes, so the pair this script exists for — this row against
     * "N subscribers on one root, oldest out first" — is now a comparison across
     * two populations for those two libraries. B5 is derived and says so with the
     * counts, in the block above the results and in the participation line under
     * this table.
     */
    standing: signedFor(['churnColumn'], {
        A1: met(
            'the cycle\'s first frame delivering nothing. One write and one settle between the mounts ' +
                'is what proves the subscribers this script just mounted are live, and `check` asserts ' +
                'that count rather than inferring it.'
        ),
        A2: met(
            'a delivery in the cycle\'s SECOND frame. Everything mounted has been unmounted by then, ' +
                'so a wake there is a subscriber that did not leave.'
        ),
        A3: notMet(
            'a churn binding derives no view and keeps no grouping, so `groupOrder` answers ' +
                '`undefined` for the participants whose churn wiring is a subscriber store rather than ' +
                'a full one, and the fifty-bucket half of the audit does not run. The stored columns ' +
                'are audited in full against the reference model.'
        ),
        A4: met(
            'the mount and unmount counts, and the per-slot read fold, checked in the verify pass and ' +
                'not in the timed process\'s proof pass. A store that mounted nothing leaves the same ' +
                'population behind as one that mounted everything.'
        ),
        B1: met(
            'a participant subscribing to the ROW here while the rest subscribe to the column. Two ' +
                'adapters did exactly that until 2026-08-31, with the substitution disclosed in a ' +
                '`departure` and the number unchanged by the disclosure.'
        ),
        B2: met(
            'the anchor\'s unmount becoming an O(1) swap-remove. `indexOf` plus `splice` over an ' +
                'array of subscribers is what a person writing this writes; the O(1) unmount belongs ' +
                'to the FLOOR beside it.'
        ),
        B3: met(
            'an adapter remembering the last value and comparing it to decide which column moved. ' +
                'That is the library\'s job; LokiJS declines this shape rather than do it, and its ' +
                'reason is printed under `churn.column.absent`.'
        ),
        B4: met(
            '`floorKeyFor` handing this table `consumerFloor` again. A churn step is a mount, not a ' +
                'window delivery.'
        ),
        C1: met(
            'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
                'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
        ),
        C2: met(
            'a sampling plan derived per adapter rather than from the slowest participant of the ' +
                'scenario, or one cell of a minimum column carrying a mean.'
        ),
        C3: met(
            'a row whose spread is above `SPREAD_CEILING` being given a rank rather than the `·` ' +
                'that says its number is not being presented as a result.'
        ),
        C4: met(
            'the two arms of a pair measured in one process. One call site taught both shapes prices ' +
                'the second arm through a polymorphic site neither arm has in production.'
        ),
        C5: notMet(
            'ONE ARM AND NOT TWO. `control-lean` and `control-heavy` supply a churn wiring since ' +
                '2026-08-30 and attest a DOUBLED MOUNT PATH, so this table has a resolution where it ' +
                'had none; `control-write` declines the churn wiring in writing, because a churn frame ' +
                'performs ONE store mutation against every mount and unmount of the cycle and a ' +
                'doubled write path here is a difference smaller than this table\'s drift. The ' +
                'remaining gap is that the one arm is roughly a doubling where the gaps a reader is ' +
                'asked to read are not.'
        ),
    }),
    resident: 0,
    churned: CHURN_SUBSCRIBERS,
    mountResident: onSharedRow,
    mount: (churn, at) => churn.mountOnColumn(at),
    reversed: false,
    rowsWrittenIn: churnRowOnly,
    wokeIn: everyStanding,
    rowOf: onRowZero,
    headOf: asRead,
});

const churnList = makeChurnScenario({
    key: 'churnList',
    wiring: 'row',
    label: 'N subscribers on N rows, a list',
    description:
        `${CHURN_CYCLES} cycles of: subscribe ${CHURN_SUBSCRIBERS} components, each to its own row, ` +
        'the way a list mounts one component per row; change some of those rows in one batch; ' +
        `unsubscribe them oldest first; change the same rows again. Each cycle changes ` +
        `${CHURN_LIST_SHRINK} fewer rows, so the number of components that re-render proves each ` +
        'watches its own row. After unsubscribing nobody may be notified. Compare with "N ' +
        'subscribers on one root, oldest out first", where all components share one row.',
    standing: CHURN_SCRIPT,
    resident: 0,
    churned: CHURN_SUBSCRIBERS,
    mountResident: onSharedRow,
    mount: (churn, at) => churn.mountOnRows(at, at, 1),
    reversed: false,
    rowsWrittenIn: churnListPrefix,
    wokeIn: churnListPrefix,
    rowOf: at => at,
    headOf: asRead,
});

const churnChain = makeChurnScenario({
    key: 'churnChain',
    wiring: 'chain',
    label: 'N subscribers over a derivation chain',
    description:
        `A dashboard of ${CHURN_SUBSCRIBERS} tiles; tile i summarises rows i to ` +
        `i+${CHURN_CHAIN_ROOTS - 1} through a chain of ${CHURN_CHAIN_DEPTH} derived values, built when ` +
        `the tile mounts, like a component's selectors. ${CHURN_CYCLES} cycles of: mount all tiles, ` +
        'change row 0, unmount them oldest first, change row 0 again. Only tile 0 reads row 0, so ' +
        'exactly one tile may update, and after unmounting none may. Measured: building chains of ' +
        'derived values on mount and taking them apart on unmount.',
    // The churn wiring's two exceptions plus one of this row's own, written out
    // in full rather than signed over `CHURN_SCRIPT`.
    standing: signedFor(['churnChain'], {
        A1: met(
            'the cycle\'s first frame delivering nothing. The write lands on the FIRST of the chain ' +
                'roots, so a delivery is also the proof that the derivations mounted above it reach ' +
                'down to that root at all.'
        ),
        A2: met(
            'a delivery in the cycle\'s SECOND frame. A stack of derived values torn down leaves more ' +
                'places for a subscription to survive than a flat root list does, and a wake there is ' +
                'where that shows.'
        ),
        A3: notMet(
            'a churn binding derives no view and keeps no grouping, so the fifty-bucket half of the ' +
                'audit does not run for the participants whose churn wiring is a subscriber store. ' +
                'The stored columns are audited in full against the reference model.'
        ),
        A4: met(
            'the delivered head ceasing to be `chainHeadOf(label, CHURN_CHAIN_DEPTH)` for EVERY ' +
                'standing slot in the read fold, or that text being compared in the verify pass and ' +
                'not in the timed process\'s own clean pass. A store that built one derivation instead ' +
                'of four leaves the same population and the same woke count behind, and the read text ' +
                'is the only thing that tells them apart.'
        ),
        B1: notMet(
            'THE TWO SIDES DO NOT DO THE SAME JOB ON THIS ROW, and the asymmetry is not printed ' +
                'beside it. The hand-written floor mounts a chain for nothing extra, because a person ' +
                'writing it KNOWS STATICALLY which rows their derived value reads and subscribes to ' +
                'those — there is no walk down a graph to find the roots. An engine that builds the ' +
                'chain at mount has to find them. The derivation itself still runs in both bodies, so ' +
                'the FRAME is comparable and the MOUNT is not; the reason is written in the anchor ' +
                'and in this description, and the report prints no per-row note for it.'
        ),
        B2: met(
            'the anchor\'s chain being fewer derivations than the engine is asked for. The mount is ' +
                'not comparable here and B1 says so; the FRAME is, and it stops being so the moment ' +
                'the two sides derive different amounts.'
        ),
        B3: met(
            'this adapter walking the chain itself to find the roots. Finding them is the cost this ' +
                'row exists to price, and an adapter that does it has moved that cost out of the ' +
                'library and into the suite.'
        ),
        // MET SINCE 2026-08-30, for the reason spelled out on `CHURN_SCRIPT`:
        // this table is scaled by `mountFloor` and not by a window delivery.
        B4: met(
            '`floorKeyFor` handing this table `consumerFloor` again. A step here is a mount of ' +
                '`CHURN_CHAIN_DEPTH` derivations, not a window delivery.'
        ),
        C1: met(
            'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
                'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
        ),
        C2: met(
            'a sampling plan derived per adapter rather than from the slowest participant of the ' +
                'scenario, or one cell of a minimum column carrying a mean.'
        ),
        C3: met(
            'a row whose spread is above `SPREAD_CEILING` being given a rank rather than the `·` ' +
                'that says its number is not being presented as a result.'
        ),
        C4: met(
            'the two arms of a pair measured in one process. One call site taught both shapes prices ' +
                'the second arm through a polymorphic site neither arm has in production.'
        ),
        C5: notMet(
            'ONE ARM AND NOT TWO. `control-lean` and `control-heavy` supply a churn wiring since ' +
                '2026-08-30 and attest a DOUBLED MOUNT PATH, so this table has a resolution where it ' +
                'had none; `control-write` declines the wiring in writing, because a churn frame ' +
                'performs one store mutation against every mount of the cycle. The full reasoning is ' +
                'on `CHURN_SCRIPT`.'
        ),
    }),
    resident: 0,
    churned: CHURN_SUBSCRIBERS,
    mountResident: onSharedRow,
    mount: onOwnWindow,
    reversed: false,
    rowsWrittenIn: churnRowOnly,
    wokeIn: onlyTheFirstWindow,
    rowOf: onRowZero,
    headOf: chainHead,
    headOfWindow: chainWindowHead,
});

const CHAIN_FRAME_ROW = CHURN_CHAIN_ROOTS - 1;
const CHAIN_FRAME_WAKES = CHURN_CHAIN_ROOTS;

const chainFrameReadsOf = (ctx: TScenarioContext, mark: string): readonly string[] => {
    const ids = ctx.plan.churnRows;
    const labels = ids.map((id, row) => (row === CHAIN_FRAME_ROW ? mark : ctx.rowById.get(id)?.label ?? ''));
    return Array.from({ length: CHURN_SUBSCRIBERS }, (_, at) => chainWindowHead(labels, at));
};

const chainFrameWrite: TScenario = {
    key: 'chainFrameWrite',
    label: 'a write through standing chains',
    description:
        `The same ${CHURN_SUBSCRIBERS}-tile dashboard as "N subscribers over a derivation chain", ` +
        `mounted before timing starts. ${CHURN_CYCLES * 2} steps, each changing row ` +
        `${CHURN_CHAIN_ROOTS - 1}: the ${CHURN_CHAIN_ROOTS} tiles that read it must recompute their ` +
        'chains and the rest must not wake. Nothing is mounted or unmounted, so this is the cost of ' +
        'running the chains; the other scenario is the cost of building them.',
    standing: signedFor(['chainFrameWrite'], {
        A1: met(
            'a step delivering nothing. Every step writes a row the first tiles\' windows read, and ' +
                '`check` asserts one delivery per step rather than inferring it.'
        ),
        A2: met(
            '`redundant` folded into `deliveries`. Every step writes a mark no neighbouring step ' +
                'writes, so a redundant delivery here is a chain that re-ran and produced nothing new.'
        ),
        A3: notMet(
            'a churn binding derives no view and keeps no grouping, so the fifty-bucket half of the ' +
                'audit does not run for the participants whose churn wiring is a subscriber store. ' +
                'The stored columns are audited in full against the reference model.'
        ),
        A4: met(
            'the woke count, the chain head and the per-slot read fold each delivery names being ' +
                'checked in the verify pass and not in the timed process\'s proof pass. A store that ' +
                'tore down half the chains in `prepare`, or built one level instead of four on any ' +
                'one of them, leaves the same population behind.'
        ),
        B1: met(
            'the mount entering this clock on one side and not the other. Both sides build their ' +
                'chains in `prepare`, so what is timed is the frame alone, which is the half of ' +
                '`churnChain` both sides do comparably.'
        ),
        B2: met(
            'the anchor\'s chain body deriving fewer levels than `CHURN_CHAIN_DEPTH` per wake. The ' +
                'frame is all this row times, so a body that skipped a level would flatter every ' +
                'store above it.'
        ),
        B3: met(
            'this adapter caching the chain head between frames and re-delivering it, where the ' +
                'library is asked to re-derive the stack it was handed.'
        ),
        B4: met(
            'this table being scaled by `mountFloor`, or `stepDeliveryOf` calling its step a mount. ' +
                'Nothing is mounted inside this clock: a step is a `frame` through standing ' +
                'subscribers, and `UNBOUNDED_BECAUSE` declares why that shape has no floor.'
        ),
        C1: met(
            'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
                'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
        ),
        C2: met(
            'a sampling plan derived per adapter rather than from the slowest participant of the ' +
                'scenario, or one cell of a minimum column carrying a mean.'
        ),
        C3: met(
            'a row whose spread is above `SPREAD_CEILING` being given a rank rather than the `·` ' +
                'that says its number is not being presented as a result.'
        ),
        C4: met(
            'the two arms of a pair measured in one process. One call site taught both shapes prices ' +
                'the second arm through a polymorphic site neither arm has in production.'
        ),
        C5: notMet(
            'ONE ARM AND NOT TWO. `control-lean` and `control-heavy` supply a churn wiring and attest ' +
                'a DOUBLED MOUNT PATH; `control-write` declines the wiring in writing, and here that ' +
                'decline costs more than anywhere else in the family, because a step here is ONE ' +
                'store mutation and no mount at all. The full reasoning is on `CHURN_SCRIPT`.'
        ),
    }),
    steps: CHURN_CYCLES * 2,
    churn: 'chain',
    auditChurnReads: true,
    rebuild: false,
    repeatable: true,
    prepare: ctx => {
        const churn = churnOf(ctx);
        churn.holdChurnRows(ctx.plan.churnRows, ctx.plan.churnRanks);
        for (let at = 0; at < CHURN_SUBSCRIBERS; at++) onOwnWindow(churn, at);
    },
    restore: ctx => {
        const id = ctx.plan.churnRows[CHAIN_FRAME_ROW];
        const row = ctx.rowById.get(id);
        if (row !== undefined) ctx.binding.patchLabel(id, row.label);
        ctx.binding.settle();
    },
    run: ctx => {
        const id = ctx.plan.churnRows[CHAIN_FRAME_ROW];
        for (let step = 0; step < CHURN_MARKS.length; step++) {
            ctx.binding.patchLabel(id, CHURN_MARKS[step]);
            ctx.binding.settle();
        }
    },
    check: ctx =>
        expect('chain view deliveries', ctx.consumers.a.deliveries, CHURN_MARKS.length) ??
        expect('chain view distinct renders', ctx.consumers.a.distinct, CHURN_MARKS.length) ??
        expect('view B deliveries', ctx.consumers.b.deliveries, 0) ??
        expectChurnHead(
            ctx,
            CHAIN_FRAME_WAKES,
            chainFrameReadsOf(ctx, CHURN_MARKS[CHURN_MARKS.length - 1])
        ),
    oracle: (ctx, model) => {
        const id = ctx.plan.churnRows[0];
        const rank = ctx.plan.churnRanks[0];
        for (let step = 0; step < CHURN_MARKS.length; step++) {
            model.setLabel(ctx.plan.churnRows[CHAIN_FRAME_ROW], CHURN_MARKS[step]);
            emitChurnLine(model, id, rank, CHAIN_FRAME_WAKES, chainFrameReadsOf(ctx, CHURN_MARKS[step]));
        }
    },
};

const churnDiamond = makeChurnScenario({
    key: 'churnDiamond',
    wiring: 'diamond',
    label: 'N subscribers over a diamond',
    description:
        `${CHURN_CYCLES} cycles of: mount ${CHURN_SUBSCRIBERS} components, each building its own ` +
        'diamond, two values derived from row 0 and a third that combines both; change row 0; ' +
        'unmount them oldest first; change it again. The combined value must be computed once per ' +
        'change, not once per branch: computing it twice is the "glitch" this checks for. Compare ' +
        'with "N subscribers over a derivation chain", where the derived values form a line.',
    standing: signedFor(['churnDiamond'], {
        A1: met(
            'the cycle\'s first frame delivering nothing. The write lands on the diamond\'s root, so a ' +
                'delivery is also the proof that both arms and the join mounted above it reach that root.'
        ),
        A2: met(
            'a delivery in the cycle\'s SECOND frame. A diamond torn down leaves three derived nodes ' +
                'per subscriber for a subscription to survive in, and a wake there is where one did.'
        ),
        A3: notMet(
            'a churn binding derives no view and keeps no grouping, so the fifty-bucket half of the ' +
                'audit does not run for the participants whose churn wiring is a subscriber store. ' +
                'The stored columns are audited in full against the reference model.'
        ),
        A4: met(
            'the woke count and every standing slot\'s joined text being checked in the verify pass ' +
                'and not in the timed process\'s proof pass. A store whose join ran once per arm leaves ' +
                'the same population behind as one whose join ran once, and only the line tells them apart.'
        ),
        B1: notMet(
            'THE TWO SIDES DO NOT DO THE SAME JOB AT MOUNT, for `churnChain`\'s reason: the ' +
                'hand-written floor knows statically that its value reads one row and computes both ' +
                'arms and the join inline in one body, so it is glitch-free for nothing and has no ' +
                'graph to build or to schedule. An engine builds three derived nodes per subscriber and ' +
                'has to order them. The FRAME is comparable and the MOUNT is not, and the report prints ' +
                'no per-row note for it.'
        ),
        B2: met(
            'the anchor deriving fewer than both arms and the join per wake, or reading anything but ' +
                'the root. The frame is comparable only while both sides derive the same three values.'
        ),
        B3: met(
            'this adapter computing the join itself from the arms\' last values, or deduplicating the ' +
                'subscriber\'s wake, where the library is asked to schedule the diamond glitch-free.'
        ),
        B4: met(
            '`floorKeyFor` handing this table `consumerFloor`. A step here is the mount of a diamond — ' +
                'two derivations and a join — and not a window delivery.'
        ),
        C1: met(
            'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
                'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
        ),
        C2: met(
            'a sampling plan derived per adapter rather than from the slowest participant of the ' +
                'scenario, or one cell of a minimum column carrying a mean.'
        ),
        C3: met(
            'a row whose spread is above `SPREAD_CEILING` being given a rank rather than the `·` ' +
                'that says its number is not being presented as a result.'
        ),
        C4: met(
            'the two arms of a pair measured in one process. One call site taught both shapes prices ' +
                'the second arm through a polymorphic site neither arm has in production.'
        ),
        C5: notMet(
            'ONE ARM AND NOT TWO. `control-lean` and `control-heavy` supply the diamond wiring and ' +
                'attest a DOUBLED MOUNT PATH; `control-write` declines the churn wiring in writing, ' +
                'because a churn frame performs one store mutation against every mount of the cycle. ' +
                'The full reasoning is on `CHURN_SCRIPT`.'
        ),
    }),
    resident: 0,
    churned: CHURN_SUBSCRIBERS,
    mountResident: onSharedRow,
    mount: (churn, at) => churn.mountOnDiamond(at, 0),
    reversed: false,
    rowsWrittenIn: churnRowOnly,
    wokeIn: everyStanding,
    rowOf: onRowZero,
    headOf: diamondHeadOf,
});

const diamondFrameReadsOf = (mark: string): readonly string[] =>
    Array.from({ length: CHURN_SUBSCRIBERS }, () => diamondHeadOf(mark));

const diamondFrameWrite: TScenario = {
    key: 'diamondFrameWrite',
    label: 'a write through standing diamonds',
    description:
        `The same ${CHURN_SUBSCRIBERS} diamonds as "N subscribers over a diamond", mounted before ` +
        `timing starts. ${CHURN_CYCLES * 2} steps, each changing row 0: every diamond recomputes once ` +
        'per step. Nothing is mounted or unmounted, so this is the cost of running diamonds; the ' +
        'other scenario is the cost of building them.',
    standing: signedFor(['diamondFrameWrite'], {
        A1: met(
            'a step delivering nothing. Every step writes the root every diamond reads, and `check` ' +
                'asserts one delivery per step rather than inferring it.'
        ),
        A2: met(
            '`redundant` folded into `deliveries`. Every step writes a mark no neighbouring step ' +
                'writes, so a redundant delivery here is a diamond that re-ran and produced nothing new.'
        ),
        A3: notMet(
            'a churn binding derives no view and keeps no grouping, so the fifty-bucket half of the ' +
                'audit does not run for the participants whose churn wiring is a subscriber store. ' +
                'The stored columns are audited in full against the reference model.'
        ),
        A4: met(
            'the woke count and every standing slot\'s joined text being checked in the verify pass ' +
                'and not in the timed process\'s proof pass. A store whose join ran once per arm leaves ' +
                'the same population behind as one whose join ran once, and only the line tells them apart.'
        ),
        B1: met(
            'the mount entering this clock on one side and not the other. Both sides build their ' +
                'diamonds in `prepare`, so what is timed is the frame alone, which is the half of ' +
                '`churnDiamond` both sides do comparably.'
        ),
        B2: met(
            'the anchor deriving fewer than both arms and the join per wake, or reading anything but ' +
                'the root. The frame is all this row times, so a body that skipped an arm would flatter ' +
                'every store above it.'
        ),
        B3: met(
            'this adapter computing the join itself from the arms\' last values, or deduplicating the ' +
                'subscriber\'s wake, where the library is asked to schedule the diamond glitch-free.'
        ),
        B4: met(
            'this table being scaled by `mountFloor`, or `stepDeliveryOf` calling its step a mount. ' +
                'Nothing is mounted inside this clock: a step is a `frame` through standing ' +
                'subscribers, and `UNBOUNDED_BECAUSE` declares why that shape has no floor.'
        ),
        C1: met(
            'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
                'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
        ),
        C2: met(
            'a sampling plan derived per adapter rather than from the slowest participant of the ' +
                'scenario, or one cell of a minimum column carrying a mean.'
        ),
        C3: met(
            'a row whose spread is above `SPREAD_CEILING` being given a rank rather than the `·` ' +
                'that says its number is not being presented as a result.'
        ),
        C4: met(
            'the two arms of a pair measured in one process. One call site taught both shapes prices ' +
                'the second arm through a polymorphic site neither arm has in production.'
        ),
        C5: notMet(
            'ONE ARM AND NOT TWO. `control-lean` and `control-heavy` supply the diamond wiring and ' +
                'attest a DOUBLED MOUNT PATH; `control-write` declines the churn wiring in writing, and ' +
                'here that decline costs the most, because a step here is ONE store mutation and no ' +
                'mount at all. The full reasoning is on `CHURN_SCRIPT`.'
        ),
    }),
    steps: CHURN_CYCLES * 2,
    churn: 'diamond',
    auditChurnReads: true,
    rebuild: false,
    repeatable: true,
    prepare: ctx => {
        const churn = churnOf(ctx);
        churn.holdChurnRows(ctx.plan.churnRows, ctx.plan.churnRanks);
        for (let at = 0; at < CHURN_SUBSCRIBERS; at++) churn.mountOnDiamond(at, 0);
    },
    restore: ctx => {
        const id = ctx.plan.churnRows[0];
        const row = ctx.rowById.get(id);
        if (row !== undefined) ctx.binding.patchLabel(id, row.label);
        ctx.binding.settle();
    },
    run: ctx => {
        const id = ctx.plan.churnRows[0];
        for (let step = 0; step < CHURN_MARKS.length; step++) {
            ctx.binding.patchLabel(id, CHURN_MARKS[step]);
            ctx.binding.settle();
        }
    },
    check: ctx =>
        expect('diamond view deliveries', ctx.consumers.a.deliveries, CHURN_MARKS.length) ??
        expect('diamond view distinct renders', ctx.consumers.a.distinct, CHURN_MARKS.length) ??
        expect('view B deliveries', ctx.consumers.b.deliveries, 0) ??
        expectChurnHead(ctx, CHURN_SUBSCRIBERS, diamondFrameReadsOf(CHURN_MARKS[CHURN_MARKS.length - 1])),
    oracle: (ctx, model) => {
        const id = ctx.plan.churnRows[0];
        const rank = ctx.plan.churnRanks[0];
        for (let step = 0; step < CHURN_MARKS.length; step++) {
            model.setLabel(id, CHURN_MARKS[step]);
            emitChurnLine(model, id, rank, CHURN_SUBSCRIBERS, diamondFrameReadsOf(CHURN_MARKS[step]));
        }
    },
};

const churnResident = makeChurnScenario({
    key: 'churnResident',
    wiring: 'row',
    label: 'churn against a standing population',
    description:
        `${CHURN_RESIDENT} components stay subscribed to one row the whole time. ${CHURN_CYCLES} ` +
        `cycles of: subscribe ${CHURN_CHURNED} more to the same row, change it, unsubscribe those, ` +
        'change it again. A real screen keeps most of its subscriptions and mounts or unmounts a few; ' +
        'this shows whether that costs more when many subscribers are already there.',
    // The one churn script that does not isolate what it was built to isolate,
    // plus the churn wiring's two. Written out in full.
    standing: signedFor(['churnResident'], {
        A1: notMet(
            'THIS ROW CANNOT ISOLATE THE COST OF A MOUNT AGAINST A STANDING POPULATION, and the limit ' +
                'is intrinsic rather than a bug: the residents must share the churned root for the ' +
                "subscriber list to be long, and sharing it means the proof frame wakes them too. So " +
                'what is timed is END-TO-END CHURN against a standing population — the mounts, the ' +
                'unmounts, and the resident wake-ups in the same frames — rather than the mount cost ' +
                'alone. Separating them would need residents on a different root, and then the list ' +
                'this row exists to lengthen would not be long.'
        ),
        A2: met(
            'the cycle\'s second frame naming the FULL subscriber count rather than the resident one, ' +
                'or a read fold still holding a churned slot. That figure is the proof the churned ' +
                'subscribers left, and it is the one script here where both frames of a cycle deliver.'
        ),
        A3: notMet(
            'a churn binding derives no view and keeps no grouping, so the fifty-bucket half of the ' +
                'audit does not run for the participants whose churn wiring is a subscriber store. ' +
                'The stored columns are audited in full against the reference model.'
        ),
        A4: met(
            'the resident mounts happening inside the clock. They are the CONDITION this script ' +
                'measures under, mounted in `prepare`, and the timed process asserts the delivery ' +
                'counts and the per-slot read fold that only hold if they are still standing.'
        ),
        B1: met(
            'the hand-written floor keeping a resident set of a different size. What separates this ' +
                'row from "N subscribers on one root" is what is already standing, so both sides have ' +
                'to be standing the same amount.'
        ),
        B2: met(
            'the anchor\'s unmount becoming an O(1) swap-remove. This is the row where that matters ' +
                'most: a linear unmount over a long resident list is precisely what this script asks ' +
                'whether an engine pays.'
        ),
        B3: met(
            'this adapter holding the resident subscriber bodies itself rather than handing them to ' +
                'the library\'s own subscribe, which would move the cost this row measures out of the ' +
                'library.'
        ),
        // MET SINCE 2026-08-30, for the reason spelled out on `CHURN_SCRIPT`:
        // this table is scaled by `mountFloor` and not by a window delivery.
        B4: met(
            '`floorKeyFor` handing this table `consumerFloor` again. A churn step is a mount, not a ' +
                'window delivery, and this row\'s steps are the smallest in the family.'
        ),
        C1: met(
            'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
                'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
        ),
        C2: met(
            'a sampling plan derived per adapter rather than from the slowest participant of the ' +
                'scenario, or one cell of a minimum column carrying a mean.'
        ),
        C3: met(
            'a row whose spread is above `SPREAD_CEILING` being given a rank rather than the `·` ' +
                'that says its number is not being presented as a result.'
        ),
        C4: met(
            'the two arms of a pair measured in one process. One call site taught both shapes prices ' +
                'the second arm through a polymorphic site neither arm has in production.'
        ),
        C5: notMet(
            'ONE ARM AND NOT TWO. `control-lean` and `control-heavy` supply a churn wiring since ' +
                '2026-08-30 and attest a DOUBLED MOUNT PATH, so this table has a resolution where it ' +
                'had none; `control-write` declines the wiring in writing, because a churn frame ' +
                'performs one store mutation against every mount of the cycle. The full reasoning is ' +
                'on `CHURN_SCRIPT`.'
        ),
    }),
    resident: CHURN_RESIDENT,
    churned: CHURN_CHURNED,
    mountResident: onSharedRow,
    mount: onSharedRow,
    reversed: false,
    rowsWrittenIn: churnRowOnly,
    wokeIn: everyStanding,
    rowOf: onRowZero,
    headOf: asRead,
});

const APP_DECK_FROM = APP_CARDS;
const APP_USER_FROM = APP_CARDS + APP_DECKS;
const APP_NAME_AT = APP_CARDS;
const APP_DATE_AT = APP_CARDS + APP_DECKS;
const APP_TAG_AT = APP_CARDS + APP_DECKS * 2;
const APP_DATES_PER_USER = APP_DECKS / APP_USERS;

const appTagAt = (card: number, tag: number): number => APP_TAG_AT + card * APP_TAGS + tag;
const appUserOfDeck = (deck: number): number => Math.floor((deck * APP_USERS) / APP_DECKS);
const appTagsAfter = (round: number): number => ((round + 1) % APP_TAGS) + 1;
const appRoundWoke = (round: number): number =>
    APP_CARDS * (1 + appTagsAfter(round)) + APP_DECKS + APP_DATES_PER_USER;

const appMark = (kind: string, from: number, count: number): readonly string[] =>
    Array.from({ length: count }, (_, i) => scrambledText(`o${kind}`, from + i));

const APP_FILL_LABELS = appMark('f', 0, APP_ROWS);
const APP_PRIME_LABELS = appMark('p', 0, APP_ROWS);
const APP_CARD_MARKS: readonly (readonly string[])[] = [
    appMark('c', 0, APP_CARDS),
    appMark('k', 0, APP_CARDS),
];
const APP_DECK_NAMES: readonly (readonly string[])[] = Array.from(
    { length: APP_ROUNDS },
    (_, round) => appMark('d', round * APP_DECKS, APP_DECKS)
);
const APP_ROUND_SETTINGS = appMark('r', 0, APP_ROUNDS);
const APP_SETTING_MARKS = appMark('s', 0, APP_SETTING_STEPS);

let appIds: readonly string[] = [];
let appRanks: readonly number[] = [];
let appRestLabels: readonly string[] = [];
let appFillMounted = false;

const holdAppScene = (ctx: TScenarioContext): TChurnBinding => {
    const churn = churnOf(ctx);
    const scene = ctx.rows.slice(0, APP_ROWS);
    appIds = scene.map(row => row.id);
    appRanks = scene.map(row => row.rank);
    appRestLabels = scene.map(row => row.label);
    churn.holdChurnRows(appIds, appRanks);
    return churn;
};

type TAppMount = { at: number; from: number };

const APP_SCENE: readonly TAppMount[] = [
    ...Array.from({ length: APP_CARDS }, (_, card) => [
        { at: card, from: card },
        { at: appTagAt(card, 0), from: card },
    ]).flat(),
    ...Array.from({ length: APP_DECKS }, (_, deck) => [
        { at: APP_NAME_AT + deck, from: APP_DECK_FROM + deck },
        { at: APP_DATE_AT + deck, from: APP_USER_FROM + appUserOfDeck(deck) },
    ]).flat(),
];

const mountAppScene = (churn: TChurnBinding): void => {
    for (let i = 0; i < APP_SCENE.length; i++) {
        churn.mountOnRows(APP_SCENE[i].at, APP_SCENE[i].from, 1);
    }
};

const unmountAppScene = (churn: TChurnBinding): void => {
    for (let i = 0; i < APP_SCENE.length; i++) churn.unmount(APP_SCENE[i].at);
};

const APP_FILL_WRITTEN: readonly number[] = [
    ...Array.from({ length: APP_CARDS / 2 }, (_, i) => i * 2),
    ...Array.from({ length: APP_DECKS / 2 }, (_, deck) => APP_DECK_FROM + deck),
    APP_USER_FROM,
];

const APP_FILL_WOKE = APP_SCENE.filter(mount => APP_FILL_WRITTEN.includes(mount.from)).length;

const appReadsOf = (labels: readonly string[], tags: number): (string | undefined)[] => {
    const reads: (string | undefined)[] = [];
    for (let i = 0; i < APP_SCENE.length; i++) reads[APP_SCENE[i].at] = labels[APP_SCENE[i].from];
    for (let card = 0; card < APP_CARDS; card++) {
        for (let tag = 1; tag < tags; tag++) reads[appTagAt(card, tag)] = labels[card];
    }
    return reads;
};

const emitAppLine = (
    model: BenchOracle,
    woke: number,
    labels: readonly string[],
    tags: number
): void => {
    model.a.begin();
    model.a.row(appIds[0], appRanks[0], churnLineOf(woke, appReadsOf(labels, tags)));
    model.a.end();
};

const appFilledLabelsOf = (): string[] => {
    const labels = appRestLabels.slice();
    for (let i = 0; i < APP_FILL_WRITTEN.length; i++) {
        labels[APP_FILL_WRITTEN[i]] = APP_FILL_LABELS[APP_FILL_WRITTEN[i]];
    }
    return labels;
};

const appSettingLinesOf = (): string[] => {
    const labels = appRestLabels.slice();
    const lines: string[] = [];
    for (let step = 0; step < APP_SETTING_STEPS; step++) {
        labels[APP_USER_FROM + (step % APP_USERS)] = APP_SETTING_MARKS[step];
        lines.push(churnLineOf(APP_DATES_PER_USER, appReadsOf(labels, 1)));
    }
    return lines;
};

const writeAppLabels = (ctx: TScenarioContext, labels: readonly string[]): void => {
    for (let i = 0; i < appIds.length; i++) ctx.binding.patchLabel(appIds[i], labels[i]);
    ctx.binding.settle();
};

// Primed so `restore` is a change even where the library compares before it notifies.
const prepareStandingAppScene = (ctx: TScenarioContext): void => {
    mountAppScene(holdAppScene(ctx));
    writeAppLabels(ctx, APP_PRIME_LABELS);
};

const APP_SCRIPT: TStandardStanding = signedFor(['appFill', 'appRound', 'appSettingMove'], {
    A1: met(
        'a frame of this family delivering nothing. Every frame writes a row some subscriber ' +
            'standing or mounted in that frame reads, and `check` asserts the delivery count.'
    ),
    A2: met(
        '`redundant` folded into `deliveries`. "one setting moves" delivers once per step and, on a ' +
            'timed sample, is distinct once by construction, so the redundant count is that row\'s ' +
            'whole answer; audited passes fold the moved dates in and expect a distinct line per step.'
    ),
    A3: notMet(
        'a churn binding derives no view and keeps no grouping, so the fifty-bucket half of the ' +
            'audit does not run for the participants whose churn wiring is a subscriber store. The ' +
            'stored columns of every card, deck and user row are audited in full against the model.'
    ),
    A4: met(
        'the woke count and the per-slot read fold each delivery names being checked in the verify ' +
            'pass and not in the timed process\'s proof pass. A store that mounted no tag subscribers, ' +
            'or a deck date on its deck, leaves the same population behind as one that mounted them right.'
    ),
    B1: met(
        'the anchor mounting a different scene — fewer tags, a deck date on the deck rather than on ' +
            'its user — than the libraries are asked for. The woke count each line names is the ' +
            'scene, so a different scene is a different line.'
    ),
    B2: met(
        'the anchor\'s unmount becoming an O(1) swap-remove. The tag list shrinking from four to one ' +
            'every fourth round is where `indexOf` plus `splice` is paid here.'
    ),
    B3: met(
        'an adapter remembering which rows a frame wrote and waking the subscribers itself, rather ' +
            'than handing each body to the library\'s own subscribe and being called by it.'
    ),
    B4: met(
        'one step shape being claimed for all three. "an application screen fills" and "an ' +
            'application screen in use" mount inside the clock, a `mount` step; "one setting moves" ' +
            'mounts nothing, a `frame` step (`STANDING_FRAME_SCENARIO_KEYS`). `UNBOUNDED_BECAUSE` ' +
            'declares why neither shape has a floor, and a floor handed to either would bound the ' +
            "other's act."
    ),
    C1: met(
        'the load banner printed only when the gate is exceeded, or the busy judgement made against ' +
            'a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
    ),
    C2: met(
        'a sampling plan derived per adapter rather than from the slowest participant of the ' +
            'scenario, or one cell of a minimum column carrying a mean.'
    ),
    C3: met(
        'a row whose spread is above `SPREAD_CEILING` being given a rank rather than the `·` that ' +
            'says its number is not being presented as a result.'
    ),
    C4: met(
        'the two arms of a pair measured in one process. One call site taught both shapes prices the ' +
            'second arm through a polymorphic site neither arm has in production.'
    ),
    C5: notMet(
        'ONE ARM AND NOT TWO. `control-lean` and `control-heavy` supply a churn wiring and attest a ' +
            'DOUBLED MOUNT PATH; `control-write` declines the wiring in writing. Two of these three ' +
            `scripts write many rows a frame — ${APP_FILL_WRITTEN.length} in the one frame of "an ` +
            `application screen fills", ${APP_DECKS + APP_CARDS + 1} in each round of "an application ` +
            'screen in use" — where "one setting moves" and most of the churn family write one, so the ' +
            'write arm would have had something to attest on those two tables, and the decline is per ' +
            'wiring rather than per script.'
    ),
});

const appFill: TScenario = {
    key: 'appFill',
    label: 'an application screen fills',
    description:
        `An app screen: ${APP_CARDS} cards in ${APP_DECKS} decks owned by ${APP_USERS} users, already ` +
        `in the store. In one step, ${APP_SUBSCRIBERS} components mount (one per card, one per tag ` +
        "shown on a card, one per deck name, and one per deck date, which reads a setting of the " +
        `deck's user) and ${APP_FILL_WRITTEN.length} of the ${APP_ROWS} records change. The only ` +
        'scenario where data changes and components mount together. Exactly ' +
        `${APP_FILL_WOKE} components, those whose own record changed, must re-render.`,
    standing: APP_SCRIPT,
    steps: 1,
    churn: 'row',
    auditChurnReads: true,
    rebuild: false,
    repeatable: false,
    prepare: ctx => {
        holdAppScene(ctx);
    },
    restore: ctx => {
        writeAppLabels(ctx, appRestLabels);
        if (!appFillMounted) return;
        unmountAppScene(churnOf(ctx));
        appFillMounted = false;
    },
    run: ctx => {
        mountAppScene(churnOf(ctx));
        appFillMounted = true;
        ctx.binding.frame(() => {
            for (let i = 0; i < APP_FILL_WRITTEN.length; i++) {
                const at = APP_FILL_WRITTEN[i];
                ctx.binding.patchLabel(appIds[at], APP_FILL_LABELS[at]);
            }
        });
        ctx.binding.settle();
    },
    check: ctx => {
        const want = `${appIds[0]} ${appRanks[0]} ${churnLineOf(
            APP_FILL_WOKE,
            appReadsOf(appFilledLabelsOf(), 1)
        )}`;
        return (
            expect('app view deliveries', ctx.consumers.a.deliveries, 1) ??
            expect('app view distinct renders', ctx.consumers.a.distinct, 1) ??
            expect('view B deliveries', ctx.consumers.b.deliveries, 0) ??
            (ctx.consumers.a.head() === want
                ? undefined
                : `the app line is "${ctx.consumers.a.head()}", and the subscribers on the rows this ` +
                  `frame wrote make it "${want}"`)
        );
    },
    oracle: (_ctx, model) => {
        for (let i = 0; i < APP_FILL_WRITTEN.length; i++) {
            const at = APP_FILL_WRITTEN[i];
            model.setLabel(appIds[at], APP_FILL_LABELS[at]);
        }
        emitAppLine(model, APP_FILL_WOKE, appFilledLabelsOf(), 1);
    },
};

const appRound: TScenario = {
    key: 'appRound',
    label: 'an application screen in use',
    description:
        `The same app screen as "an application screen fills", mounted before timing starts. ` +
        `${APP_ROUNDS} rounds, each one step: every card's tag list grows by one tag, or drops from ` +
        `${APP_TAGS} back to one, mounting or unmounting tag components; every deck is renamed, every ` +
        "card toggled, and one user's setting changed. Mounts, unmounts and changes to cards, decks " +
        'and users happen together. Each round must produce one update with exactly the expected ' +
        'components re-rendered.',
    standing: APP_SCRIPT,
    steps: APP_ROUNDS,
    churn: 'row',
    auditChurnReads: true,
    rebuild: false,
    repeatable: true,
    prepare: prepareStandingAppScene,
    restore: ctx => {
        writeAppLabels(ctx, appRestLabels);
    },
    run: ctx => {
        const churn = churnOf(ctx);
        let standing = 1;
        for (let round = 0; round < APP_ROUNDS; round++) {
            const tags = appTagsAfter(round);
            for (let card = 0; card < APP_CARDS; card++) {
                for (let tag = tags; tag < standing; tag++) churn.unmount(appTagAt(card, tag));
                for (let tag = standing; tag < tags; tag++) {
                    churn.mountOnRows(appTagAt(card, tag), card, 1);
                }
            }
            standing = tags;
            const names = APP_DECK_NAMES[round];
            const cards = APP_CARD_MARKS[round % 2];
            ctx.binding.frame(() => {
                for (let deck = 0; deck < APP_DECKS; deck++) {
                    ctx.binding.patchLabel(appIds[APP_DECK_FROM + deck], names[deck]);
                }
                for (let card = 0; card < APP_CARDS; card++) {
                    ctx.binding.patchLabel(appIds[card], cards[card]);
                }
                ctx.binding.patchLabel(
                    appIds[APP_USER_FROM + (round % APP_USERS)],
                    APP_ROUND_SETTINGS[round]
                );
            });
            ctx.binding.settle();
        }
    },
    check: ctx =>
        expect('app view deliveries', ctx.consumers.a.deliveries, APP_ROUNDS) ??
        expect('app view distinct renders', ctx.consumers.a.distinct, APP_ROUNDS) ??
        expect('view B deliveries', ctx.consumers.b.deliveries, 0),
    oracle: (_ctx, model) => {
        const labels = appRestLabels.slice();
        const setLabel = (at: number, label: string): void => {
            labels[at] = label;
            model.setLabel(appIds[at], label);
        };
        for (let round = 0; round < APP_ROUNDS; round++) {
            const names = APP_DECK_NAMES[round];
            for (let deck = 0; deck < APP_DECKS; deck++) setLabel(APP_DECK_FROM + deck, names[deck]);
            const cards = APP_CARD_MARKS[round % 2];
            for (let card = 0; card < APP_CARDS; card++) setLabel(card, cards[card]);
            setLabel(APP_USER_FROM + (round % APP_USERS), APP_ROUND_SETTINGS[round]);
            emitAppLine(model, appRoundWoke(round), labels, appTagsAfter(round));
        }
    },
};

const appSettingMove: TScenario = {
    key: 'appSettingMove',
    label: 'one setting moves',
    description:
        `The same app screen as "an application screen fills", mounted before timing starts. ` +
        `${APP_SETTING_STEPS} steps, each changing one user's setting. Only that user's ` +
        `${APP_DATES_PER_USER} deck-date components read it and must update; nothing else may. ` +
        'Measured: how quickly a library finds the few components that depend on a value stored in ' +
        'another record.',
    standing: APP_SCRIPT,
    steps: APP_SETTING_STEPS,
    churn: 'row',
    auditChurnReads: true,
    rebuild: false,
    repeatable: true,
    prepare: prepareStandingAppScene,
    restore: ctx => {
        writeAppLabels(ctx, appRestLabels);
    },
    run: ctx => {
        for (let step = 0; step < APP_SETTING_STEPS; step++) {
            ctx.binding.patchLabel(
                appIds[APP_USER_FROM + (step % APP_USERS)],
                APP_SETTING_MARKS[step]
            );
            ctx.binding.settle();
        }
    },
    check: ctx => {
        const lines = appSettingLinesOf();
        const distinct = lines.filter((line, step) => step === 0 || line !== lines[step - 1]).length;
        return (
            expect('app view deliveries', ctx.consumers.a.deliveries, APP_SETTING_STEPS) ??
            expect('app view distinct renders', ctx.consumers.a.distinct, distinct) ??
            expect('view B deliveries', ctx.consumers.b.deliveries, 0)
        );
    },
    oracle: (_ctx, model) => {
        const lines = appSettingLinesOf();
        for (let step = 0; step < APP_SETTING_STEPS; step++) {
            model.setLabel(appIds[APP_USER_FROM + (step % APP_USERS)], APP_SETTING_MARKS[step]);
            model.a.begin();
            model.a.row(appIds[0], appRanks[0], lines[step]);
            model.a.end();
        }
    },
};

let resendTurn = 0;
let patchTurn = 0;
let outsideTurn = 0;
let noteTurn = 0;
let batchTurn = 0;
let batchNoteTurn = 0;
let fanTurn = 0;
let cellTurn = 0;

/** The load: N rows into an empty store, ending at a consumer that rendered them. */
const batchInsert: TScenario = {
    key: 'batchInsert',
    label: 'batch insert',
    description:
        'One step: every row is inserted into an empty store in one batch. Both views go from empty ' +
        'to a full page and must each re-render exactly once.',
    standing: ORDINARY_SCRIPT,
    steps: 1,
    rebuild: true,
    // The run IS the load: a second pass against the same store would write
    // rows that are already there, which is the re-send scenario, not this one.
    repeatable: false,
    prepare: () => undefined,
    restore: () => undefined,
    run: ctx => {
        ctx.binding.write(ctx.loadRows);
        ctx.binding.settle();
    },
    check: ctx =>
        expect('view A distinct renders', ctx.consumers.a.distinct, 1) ??
        expect('view B distinct renders', ctx.consumers.b.distinct, 1) ??
        expect(
            'view A rows',
            ctx.consumers.a.rowCount(),
            Math.min(WINDOW, ctx.plan.groupSize)
        ),
    // The model starts EMPTY: `rebuild` means there is no previous state either
    // side continues from, so the load's delivery is the first state there is.
    oracle: (ctx, model) => {
        const rows = ctx.loadRows;
        for (let i = 0; i < rows.length; i++) model.put(rows[i]);
        model.emit();
    },
};

/**
 * THE CONSUMER, ALONE — over PLAIN OBJECTS. No store, no library, no
 * subscription: the harness drives the consumer directly over a fixed array.
 *
 * IT MAY NOT BE SUBTRACTED FROM A ROW OF THE TABLES ABOVE, because the floor is
 * per-shape and THIS IS THE SHAPE OIMDB USES. Read "oimdb is near the floor" as
 * "near the floor measured on oimdb's own storage shape", and "mobx is N× the
 * floor" as partly a statement about a floor never measured for a proxy.
 *
 * The honest fix is a floor per storage shape, unimplemented because it needs
 * something the binding contract lacks: a way to ask an adapter for the rows it
 * would hand a consumer, without delivering.
 *
 * What is still worth having: a scenario whose total is close to
 * `steps × this number` measured nothing about its store, whatever shape it
 * holds — a lower bound is enough to say that.
 */
const consumerFloor: TScenario = {
    key: 'consumerFloor',
    label: 'consumer lower bound',
    description:
        `Lower bound, no library: a page of ${WINDOW} rows rendered ${WINDOW} times straight from an ` +
        'array of plain objects. Every participant renders through the same code, so no library can ' +
        'render a page for less; one that stores rows as proxies or wrapped objects also pays to read ' +
        'through them.',
    // THE FIRST OF THE FIVE SCRIPTS WITH NO STORE. Written out in full: an item
    // that does not apply is still an item this script has to answer for.
    standing: signedFor(['consumerFloor'], {
        A1: met(
            'a step here rendering without producing a DISTINCT state. The label is varied per step ' +
                'for exactly that reason: a redundant render skips the digest fold, and a floor that ' +
                'skipped it would be a bound on less work than every row it scales performs.'
        ),
        A2: met(
            '`redundant` folded into `deliveries`. This script asserts `distinct === WINDOW`, so a ' +
                'redundant delivery counted as a distinct one would let a cheaper floor pass as this ' +
                'one and lower every multiple in the report.'
        ),
        A3: notMet(
            'there is no store. The reference model still checks the one thing there is to be wrong ' +
                'about — WHICH ROWS the harness rendered, derived independently from the population — ' +
                'but there is no stored state and no grouping to audit, so the half of A3 that asks for ' +
                'the STORED state rather than the rendered window cannot run here at all.'
        ),
        A4: met(
            'the row-count and render-count assertions running only in the verify pass. Every ' +
                'multiple printed in this report divides by this number, so the process that produced ' +
                'it is the process that has to have proved it.'
        ),
        B1: met(
            'this floor rendering fewer rows or fewer lines per row than the consumer every adapter ' +
                'shares. It drives `BenchConsumer` itself, which is what makes the subtraction it ' +
                'licenses a subtraction of the same work.'
        ),
        B2: met(
            'this being read as the hand-written anchor. It is not one — it keeps no store at all — ' +
                'and the anchor has its own row in every table this floor scales.'
        ),
        B3: met(
            'a library appearing in this table. There is no adapter in this script by construction; ' +
                'it is measured in `FLOOR_ADAPTER`\'s process for that adapter\'s STORAGE SHAPE and ' +
                'for nothing else.'
        ),
        B4: met(
            'this number being subtracted rather than divided into. It is a lower bound on one ' +
                'delivery over the cheapest storage shape measured here, so it over-states nobody\'s ' +
                'consumer cost and understates most.'
        ),
        C1: met(
            'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
                'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
        ),
        C2: met(
            'this row measured under a different sampling plan from the tables it scales. The plan is ' +
                'per scenario per point and applied to every adapter in that table.'
        ),
        C3: met(
            'a spread above `SPREAD_CEILING` here passing quietly. A floor whose own variation is ' +
                'unreported would carry that variation into every multiple in the report.'
        ),
        C4: met(
            'this floor measured in the same process as a row it scales. It has its own process for ' +
                'the reason every pair here does.'
        ),
        C5: notMet(
            'the resolution controls are two derivation bodies over a store, and this script has none, ' +
                'so no control is measured above this table. There is also only one row in it, so there ' +
                'is no gap for a control to attest — but the number itself is unattested all the same, ' +
                'and every other table in the report is scaled by it.'
        ),
    }),
    steps: WINDOW,
    rebuild: false,
    repeatable: true,
    prepare: () => undefined,
    restore: () => undefined,
    run: ctx => {
        const rows = ctx.floorRows;
        const consumer = ctx.consumers.a;
        for (let step = 0; step < WINDOW; step++) {
            consumer.begin();
            for (let i = 0; i < rows.length; i++) {
                // The label is varied per step so the render is DISTINCT every
                // time: a redundant render skips the digest fold and would
                // measure less.
                const row = rows[i];
                consumer.row(row.id, row.rank, i === step % rows.length ? `p${step}` : row.label);
            }
            consumer.end();
        }
    },
    check: ctx =>
        expect('renders', ctx.consumers.a.distinct, WINDOW) ??
        expect('rows per render', ctx.consumers.a.rowCount(), ctx.floorRows.length),
    /**
     * The one thing there is to be right or wrong about here: WHICH ROWS. The
     * model derives view A's window from the population itself and renders it, so
     * a `floorRows` that drifted from the real window — making this a measurement
     * of some other rows — parts the digests.
     */
    oracle: (ctx, model) => {
        model.load(ctx.rows);
        const visible = model.windowOf(ctx.view.groupA);
        const consumer = model.a;
        for (let step = 0; step < WINDOW; step++) {
            consumer.begin();
            for (let i = 0; i < visible.length; i++) {
                const row = visible[i];
                consumer.row(
                    row.id,
                    row.rank,
                    i === step % visible.length ? `p${step}` : row.label
                );
            }
            consumer.end();
        }
    },
};

/* ── the other four floors: one per family whose step is not a window ───── */

/**
 * WHY THERE ARE FIVE FLOORS AND NOT ONE, stated once for the three below and the
 * relation floor beside its own family.
 *
 * `consumerFloor` measures ONE WINDOW DELIVERY, and four families' steps are not
 * that: a churn step mounts a subscriber, a teardown step delivers nothing at all,
 * a cell step delivers `PINNED_COUNT` lines and a relation step `RELATION_ROWS`.
 * Scaling those four tables by a window delivery produced an arbitrary number for
 * the first two and an UNDER-estimate of the multiple for the last two, so no row
 * of them could be refused a place on it — thirteen (scenario, B4) pairs declared
 * NOT MET, and the one gate that refuses a row for measuring the harness was dead
 * in four of the report's families.
 *
 * ─── WHAT A FLOOR HERE MAY AND MAY NOT BE ────────────────────────────────
 *
 * A floor is used to REFUSE A ROW A PLACE, so it must be a quantity NOBODY IN THE
 * TABLE CAN BEAT. That is a sharper requirement than "what a competent person
 * would write", and where the two part, this file takes the first:
 *
 *  - THE MOUNT FLOOR'S UNMOUNT IS O(1) — a swap-remove against a recorded
 *    position — and NOT the `indexOf` plus `splice` the hand-written ANCHOR pays
 *    (`baseline-array`, `bindChurnStore`). The anchor's shape is deliberate there:
 *    it is what the engine pays, so the gap is the engine's. A FLOOR built that way
 *    would be beaten by any store with an O(1) unmount, and the row that beat it
 *    would be refused a place for it. The anchor answers "what would you have
 *    written"; the floor answers "what can nobody get below".
 *  - THE TEARDOWN FLOOR DROPS ONE REFERENCE. Clearing the maps would be a floor
 *    linear in the population that a store releasing its root beats.
 *  - THE MOUNT FLOOR AMORTISES ITS FRAME OVER THE LARGEST SUBSCRIBER COUNT IN THE
 *    FAMILY (`CHURN_SUBSCRIBERS_DEEP`), so its per-step share of the write and the
 *    delivery is the SMALLEST any churn script's is. At any smaller count each
 *    step carries more of the frame, not less, so the bound holds for all nine.
 *
 * WHAT THIS BUYS, and it is the whole of it: `steps × perStepMs` is now a genuine
 * lower bound in every family, `floorIsABoundOn` is true for every guarded script,
 * and a row under `FLOOR_MULTIPLE_A_ROW_MUST_CLEAR` in the churn, teardown, cell or
 * relation tables is refused a place exactly as one in the write tables is.
 */

/**
 * THE ROOT EVERY MOUNTED SUBSCRIBER READS — one plain object, which is the whole
 * of what this floor stores. Its `id` and `rank` are the address of the one line a
 * churn delivery renders (`deliverChurn`).
 */
const mountFloorRoot = { id: '', rank: 0, label: '' };
/** The live subscriber bodies. A dense array; a mount pushes, an unmount swaps. */
const mountFloorList: (() => void)[] = [];
/** Subscriber `at` -> where it sits in `mountFloorList`, or -1 when it is not up. */
const mountFloorSlot: number[] = [];
/** List position -> which subscriber owns the body there. The swap-remove needs it. */
const mountFloorOwner: number[] = [];
/** Incremented by the bodies and by nothing else — the delivery's `woke`. */
let mountFloorWoke = 0;
/** What each standing body last read out of the root, by subscriber; undefined once it leaves. */
const mountFloorReads: (string | undefined)[] = [];

/** Everything back to nothing standing and the root at the value it rests at. */
const mountFloorClear = (label: string): void => {
    mountFloorList.length = 0;
    mountFloorSlot.length = 0;
    mountFloorOwner.length = 0;
    mountFloorWoke = 0;
    mountFloorReads.length = 0;
    mountFloorRoot.label = label;
};

/**
 * ONE FRAME: every standing body runs, and if any did, ONE line is delivered
 * saying how many ran and what the first of them read.
 *
 * `deliverChurn`'s guard, copied exactly — a frame in which nothing was standing
 * must produce NO DELIVERY AT ALL, which is the assertion an unmount has to
 * satisfy here as it does in every churn adapter.
 */
const mountFloorSettle = (consumer: BenchConsumer): void => {
    const list = mountFloorList;
    for (let i = 0; i < list.length; i++) list[i]();
    if (mountFloorWoke === 0) return;
    deliverChurn(
        consumer,
        mountFloorRoot.id,
        mountFloorRoot.rank,
        mountFloorWoke,
        mountFloorReads
    );
    mountFloorWoke = 0;
};

/**
 * A MOUNT AND AN UNMOUNT WITH NO LIBRARY AT ALL — the lower bound the nine churn
 * tables are scaled by.
 *
 * THE CYCLE IS THE CHURN FAMILY'S OWN, so that a step here is a step there:
 * mount every subscriber, write the root, settle (one delivery), unmount them all,
 * write the root again, settle (nothing standing, so no delivery).
 *
 * WHAT ONE STEP IS: one closure allocated and stored, and one taken out again.
 * Every store measured in those tables must at minimum record a subscriber
 * somewhere and take the record away, so nothing in them can come out below this —
 * which is what lets the gate refuse a row on it. See the block above for why the
 * unmount is a swap-remove and not the anchor's `indexOf` plus `splice`.
 *
 * IT IS NOT THE HAND-WRITTEN ANCHOR AND MUST NOT BE READ AS ONE. `baseline-array`
 * has a row in every one of those tables and answers "what would you have written
 * instead"; this answers "what can nobody get below", and the two are different
 * numbers on purpose.
 */
const mountFloor: TScenario = {
    key: 'mountFloor',
    label: 'mount lower bound',
    description:
        `Lower bound, no library: ${CHURN_CYCLES} cycles of subscribing ${CHURN_SUBSCRIBERS_DEEP} ` +
        'callbacks to one plain object, changing it, running them, unsubscribing all, changing it ' +
        'again. Subscribers live in a plain array with constant-time removal. No library can ' +
        'subscribe and unsubscribe for less; the mount and unmount tables are scaled by it.',
    // The floor's own thirteen, written out in full: an item that does not apply
    // is still an item this script has to answer for.
    standing: signedFor(['mountFloor'], {
        A1: met(
            'the frame between the mounts delivering nothing. A mount that never runs its body is ' +
                'not a mount, and a floor built out of them would be a bound on allocation alone.'
        ),
        A2: met(
            'a delivery in the frame after the unmounts. The floor performs the same two frames a ' +
                'churn cycle does, so a subscriber left behind here would lower the bound the nine ' +
                'churn tables are divided by.'
        ),
        A3: notMet(
            'there is no store. The reference model still checks what there is to be wrong about — ' +
                'how many bodies ran in each frame and what they read, stated independently — but there ' +
                'is no stored state and no grouping to audit, so the half of A3 that asks for the ' +
                'STORED state cannot run here at all.'
        ),
        A4: met(
            'the woke-count assertions running only in the verify pass. Nine tables divide by this ' +
                'number, so the process that produced it is the process that has to have proved it.'
        ),
        B1: met(
            'this floor mounting fewer subscribers than the churn scripts do. It uses the family\'s ' +
                'LARGEST subscriber count so that its per-step share of the two writes and the one ' +
                'delivery is the smallest any churn step\'s is.'
        ),
        B2: met(
            'this being read as the hand-written anchor. Its unmount is an O(1) swap-remove where the ' +
                'anchor pays `indexOf` plus `splice`, deliberately: a store with an O(1) unmount would ' +
                'beat a floor built the anchor\'s way and be refused a place FOR having beaten it.'
        ),
        B3: met(
            'a library appearing in this table. There is no adapter in this script by construction.'
        ),
        B4: met(
            'a churn row coming out BELOW this number. That would mean the floor is not a floor, and ' +
                'the gate would be refusing places on a bound somebody had beaten.'
        ),
        C1: met(
            'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
                'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
        ),
        C2: met(
            'this row measured under a different sampling plan from the churn tables it scales.'
        ),
        C3: met(
            'a spread above `SPREAD_CEILING` here passing quietly. A floor whose own variation is ' +
                'unreported would carry that variation into nine tables of multiples.'
        ),
        C4: met(
            'this floor measured in the same process as a churn row it scales. It has its own ' +
                'process for the reason every pair here does.'
        ),
        C5: notMet(
            'the resolution controls are bodies over a STORE and this script has none, so no control ' +
                'is measured above this table; and with one row in it there is no gap for a control to ' +
                'attest. The number is unattested all the same, and nine churn tables are scaled by it.'
        ),
    }),
    steps: CHURN_CYCLES * CHURN_SUBSCRIBERS_DEEP,
    auditChurnReads: true,
    rebuild: false,
    // Every cycle ends with everything it mounted unmounted, and every frame
    // writes a mark no neighbouring frame writes — the churn family's reason.
    repeatable: true,
    prepare: ctx => {
        const id = ctx.plan.churnRows[0];
        const row = ctx.rowById.get(id);
        mountFloorRoot.id = id;
        mountFloorRoot.rank = ctx.plan.churnRanks[0];
        mountFloorClear(row === undefined ? '' : row.label);
    },
    restore: ctx => {
        const row = ctx.rowById.get(mountFloorRoot.id);
        mountFloorClear(row === undefined ? '' : row.label);
    },
    run: ctx => {
        const consumer = ctx.consumers.a;
        for (let cycle = 0; cycle < CHURN_CYCLES; cycle++) {
            for (let at = 0; at < CHURN_SUBSCRIBERS_DEEP; at++) {
                // One closure per subscriber, allocated by the mount: a body is
                // per-subscriber by nature and every library allocates at least
                // this much.
                const body = (): void => {
                    mountFloorWoke++;
                    mountFloorReads[at] = mountFloorRoot.label;
                };
                mountFloorReads[at] = mountFloorRoot.label;
                const slot = mountFloorList.length;
                mountFloorList.push(body);
                mountFloorOwner[slot] = at;
                mountFloorSlot[at] = slot;
            }
            mountFloorRoot.label = CHURN_MARKS[cycle * 2];
            mountFloorSettle(consumer);
            for (let at = 0; at < CHURN_SUBSCRIBERS_DEEP; at++) {
                const slot = mountFloorSlot[at];
                if (slot < 0) continue;
                const last = mountFloorList.length - 1;
                const moved = mountFloorOwner[last];
                mountFloorList[slot] = mountFloorList[last];
                mountFloorOwner[slot] = moved;
                mountFloorSlot[moved] = slot;
                mountFloorList.length = last;
                mountFloorSlot[at] = -1;
                mountFloorReads[at] = undefined;
            }
            mountFloorRoot.label = CHURN_MARKS[cycle * 2 + 1];
            mountFloorSettle(consumer);
        }
    },
    /**
     * ONE DELIVERY PER FRAME THAT HAD A SUBSCRIBER AND NONE FOR A FRAME THAT DID
     * NOT — the churn family's own criterion, and what makes an unmount that
     * unmounted nothing a failure here rather than the fastest row in the report.
     */
    check: ctx =>
        expect('mount floor deliveries', ctx.consumers.a.deliveries, CHURN_CYCLES) ??
        expect('mount floor distinct renders', ctx.consumers.a.distinct, CHURN_CYCLES) ??
        expect('view B deliveries', ctx.consumers.b.deliveries, 0),
    /**
     * The model loads the population itself — a storeless script is not pre-loaded
     * — and then states, independently, the two things a frame can be wrong about:
     * HOW MANY bodies ran, and WHAT they read. The unmounted frames have no call
     * here at all, which is the model's whole statement about unmounting.
     */
    oracle: (ctx, model) => {
        model.load(ctx.rows);
        const id = mountFloorRoot.id;
        const rank = mountFloorRoot.rank;
        for (let cycle = 0; cycle < CHURN_CYCLES; cycle++) {
            const mark = CHURN_MARKS[cycle * 2];
            model.setLabel(id, mark);
            emitChurnLine(
                model,
                id,
                rank,
                CHURN_SUBSCRIBERS_DEEP,
                Array.from({ length: CHURN_SUBSCRIBERS_DEEP }, () => mark)
            );
            model.setLabel(id, CHURN_MARKS[cycle * 2 + 1]);
        }
    },
};

/**
 * THE SCREEN THE TEARDOWN FLOOR BUILDS AND GIVES BACK: the population, the two
 * windows over it, one subscriber per visible row, and the two view bodies that
 * deliver.
 *
 * The two view bodies are what the PROOF FRAME calls: a teardown that left them
 * reachable delivers there, and the row fails rather than posting the fastest time
 * in the table.
 */
type TFloorScreen = {
    rows: Map<string, TRow>;
    windows: TRow[][];
    /** One per visible row of each window — what a real teardown has to detach. */
    subscribers: (() => void)[];
    /** The two views. Empty here IS what "the screen is gone" means. */
    views: (() => void)[];
};

/**
 * THE SCREEN THAT IS NOT THERE — one object, allocated once, so that giving a
 * screen back costs ONE REFERENCE STORE and not an allocation. A `dispose` that
 * allocated its own replacement would put that allocation in the timed region and
 * make the floor beatable by any store that does not.
 */
const TORN_DOWN_SCREEN: TFloorScreen = {
    rows: new Map<string, TRow>(),
    windows: [],
    subscribers: [],
    views: [],
};

let floorScreen: TFloorScreen = TORN_DOWN_SCREEN;
/** What a per-row subscriber last read. Never called inside the clock. */
let floorScreenRead = '';

/**
 * GIVING A SCREEN BACK WITH NO LIBRARY AT ALL — the lower bound the teardown table
 * is scaled by.
 *
 * WHAT A COMPETENT PERSON WRITES, and it is one line: everything the screen owns
 * is reachable only from the screen, so dropping the reference to it drops all of
 * it and the collector does the rest. Clearing the maps and the arrays instead
 * would be a teardown linear in the population, and a store that releases a root
 * would BEAT it — which is exactly what a floor may not permit, since the row that
 * beat it would be refused a place for having done so.
 *
 * THE PROOF FRAME IS THE SAME ONE `tearDown` RUNS, for the same reason: a row that
 * timed a reference store and checked nothing would rank whoever wrote the emptiest
 * function. Untimed, in `check`: a page is written into the torn-down screen and
 * its views are called, and NOTHING MAY BE DELIVERED. A run that dropped nothing
 * leaves both view bodies standing, and they deliver.
 */
const tearDownFloor: TScenario = {
    key: 'tearDownFloor',
    label: 'teardown lower bound',
    description:
        'Lower bound, no library: a hand-written screen (every row in a Map, two views and one ' +
        'subscriber per visible row) is discarded by dropping the single reference to it. No library ' +
        'can tear a screen down for less. Afterwards, outside the timing, rows are written into the ' +
        'discarded screen and nothing may render.',
    standing: signedFor(['tearDownFloor'], {
        A1: notMet(
            'the timed operation gives a screen back and its whole assertion is that NOTHING is ' +
                'delivered — a consumer that re-rendered inside this clock would be a failure, not a ' +
                'result. What drives a consumer is the UNTIMED proof frame afterwards. `tearDown` ' +
                'declares the same thing for the same reason, and this row is the floor under it.'
        ),
        A2: met(
            'a delivery in the proof frame. The view bodies ARE called there, so a delivery is a ' +
                'screen that was never given back, and it is counted rather than inferred.'
        ),
        A3: notMet(
            'there is no store, and after the step there is not even a screen. The proof frame stands ' +
                'in for the audit and is weaker in the same named way `tearDown` is: it cannot ' +
                'distinguish "dropped the reference" from "kept it and stayed quiet" — except that ' +
                'here the view bodies ARE called, so silence means they are gone.'
        ),
        A4: met(
            'the proof frame running only in the verify pass. The teardown table divides by this ' +
                'number, so the process that produced it is the process that has to have proved it.'
        ),
        B1: met(
            'this floor giving back a smaller screen than `tearDown` tears down. It builds the whole ' +
                'screen untimed — two windows and a subscriber per visible row — so that every sample ' +
                'gives back the identical thing.'
        ),
        B2: met(
            'this being read as the hand-written anchor. It drops ONE reference where the anchor ' +
                'clears its structures, deliberately: a store that releases a root would beat a floor ' +
                'built the anchor\'s way and be refused a place for it.'
        ),
        B3: met(
            'a library appearing in this table. There is no adapter in this script by construction.'
        ),
        B4: met(
            'the teardown row coming out BELOW this number. That would mean the floor is not a floor.'
        ),
        C1: met(
            'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
                'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
        ),
        C2: met(
            'this row measured under a different sampling plan from the teardown table it scales.'
        ),
        C3: met(
            'a spread above `SPREAD_CEILING` here passing quietly. This script is `repeatable: ' +
                'false` — the screen is gone after one pass — so it is the row where a short sample ' +
                'is likeliest and the variation likeliest to be real.'
        ),
        C4: met(
            'this floor measured in the same process as the teardown row it scales.'
        ),
        C5: notMet(
            'the resolution controls are bodies over a store and this script has none, so no control ' +
                'is measured above this table; and with one row in it there is no gap for a control ' +
                'to attest.'
        ),
    }),
    steps: 1,
    rebuild: false,
    populationDestroyed: true,
    // The screen is gone after one pass. A second would time a reference store
    // over a screen that is already the empty one.
    repeatable: false,
    prepare: () => undefined,
    /**
     * Untimed: a whole screen built, so every sample gives back the identical
     * thing. The windows are the SAME rows twice: what the floor measures is the
     * cost of letting a screen go, and which rows were on it does not enter that.
     */
    restore: ctx => {
        const rows = new Map<string, TRow>();
        for (let i = 0; i < ctx.rows.length; i++) {
            const row = ctx.rows[i];
            rows.set(row.id, row);
        }
        const windowA = ctx.floorRows.slice(0, ctx.view.window);
        const windowB = ctx.floorRows.slice(0, ctx.view.window);
        const subscribers: (() => void)[] = [];
        for (let i = 0; i < windowA.length; i++) {
            const row = windowA[i];
            subscribers.push(() => {
                floorScreenRead = row.label;
            });
        }
        for (let i = 0; i < windowB.length; i++) {
            const row = windowB[i];
            subscribers.push(() => {
                floorScreenRead = row.label;
            });
        }
        const consumerA = ctx.consumers.a;
        const consumerB = ctx.consumers.b;
        const window = ctx.view.window;
        floorScreen = {
            rows,
            windows: [windowA, windowB],
            subscribers,
            views: [
                () => deliver(consumerA, windowA, window),
                () => deliver(consumerB, windowB, window),
            ],
        };
    },
    // THE WHOLE TIMED REGION. One reference store, and the screen is unreachable.
    run: () => {
        floorScreen = TORN_DOWN_SCREEN;
    },
    /**
     * TWO STATEMENTS, and the second is the proof. First: the teardown itself woke
     * nobody. Second: a page written into the torn-down screen and its view bodies
     * CALLED reach no consumer — because after a real drop there are no view bodies
     * left to call.
     */
    check: ctx => {
        const quiet =
            expect('deliveries during the teardown, view A', ctx.consumers.a.deliveries, 0) ??
            expect('deliveries during the teardown, view B', ctx.consumers.b.deliveries, 0);
        if (quiet !== undefined) return quiet;
        const page = ctx.resendCopies[0];
        for (let i = 0; i < page.length; i++) floorScreen.rows.set(page[i].id, page[i]);
        // THE PER-ROW SUBSCRIBERS FIRST: each writes what it read into
        // `floorScreenRead`, so a screen that kept its subscriber list leaves a
        // label there where a torn-down one leaves the sentinel.
        floorScreenRead = '';
        const subscribers = floorScreen.subscribers;
        for (let i = 0; i < subscribers.length; i++) subscribers[i]();
        // AND THEN THE VIEWS, which is the delivery half of the proof.
        const views = floorScreen.views;
        for (let i = 0; i < views.length; i++) views[i]();
        // The torn-down screen is a module singleton: a page left in it would be
        // carried into the next sample's proof frame.
        floorScreen.rows.clear();
        return (
            (floorScreenRead === ''
                ? undefined
                : `a per-row subscriber ran after the teardown and read "${floorScreenRead}", so the ` +
                  'screen still holds the subscriptions it was asked to give back') ??
            expect('deliveries after the teardown, view A', ctx.consumers.a.deliveries, 0) ??
            expect('deliveries after the teardown, view B', ctx.consumers.b.deliveries, 0)
        );
    },
    /**
     * NOTHING: the script delivers nothing, so the two empty sequences agree —
     * `tearDown.oracle`'s position, for its reason. The proof frame asserts a
     * delivery COUNT, which `check` owns.
     */
    oracle: () => undefined,
};

/** The text each cell view is showing — this floor's whole state. */
const cellFloorLabels: string[] = [];
const cellFloorNotes: string[] = [];
/** Which of the two disjoint value sets this run is writing. */
let cellFloorTurn = 0;

/**
 * ONE CELL DELIVERY, `PINNED_COUNT` LINES, WITH NO STORE — the lower bound
 * `targeted column delivery` is scaled by.
 *
 * WHAT EVERY PARTICIPANT IN THAT TABLE PAYS ALIKE: a delivery of `PINNED_COUNT`
 * formatted lines per step, through the same `deliverCells` every adapter is
 * required to reach a cell view through. A store that routes by column delivers
 * exactly one of those a step; one whose granularity is the row delivers two. So
 * this is a bound for both and tight for the first.
 *
 * WHY IT COULD NOT BE `consumerFloor`: that measures a WINDOW delivery of `WINDOW`
 * lines, four times as many at the default point, so the multiple printed beside
 * every row of the cell table was an UNDER-estimate and no row of it could be
 * refused a place on arithmetic pointing the wrong way.
 */
const cellFloor: TScenario = {
    key: 'cellFloor',
    label: 'cell lower bound',
    description:
        `Lower bound, no library: the steps of "targeted column delivery", each rendering one changed ` +
        `line of a ${PINNED_COUNT}-line view straight from an array of strings. A library that ` +
        'notifies only the view showing the changed field renders this much; one that notifies both ' +
        'views renders twice as much.',
    standing: signedFor(['cellFloor'], {
        A1: met(
            'a step delivering no cell view. Each step writes one line and delivers the whole view ' +
                'through the same `deliverCells` every adapter must reach a cell view through, which ' +
                'is what makes it a bound on the same act.'
        ),
        A2: met(
            'the suffix ceasing to alternate. A repeat would then hand the consumer text it already ' +
                'shows, the delivery would be redundant, and the bound would be measured on the ' +
                'cheaper of the two paths.'
        ),
        A3: notMet(
            'there is no store. The reference model still checks WHICH LINES were rendered, derived ' +
                'independently from the population, but there is no stored state and no grouping to ' +
                'audit, so the half of A3 that asks for the STORED state cannot run here at all.'
        ),
        A4: met(
            'the line-count check running only in the verify pass. The cell table divides by this ' +
                'number, so the process that produced it is the process that has to have proved it.'
        ),
        B1: met(
            'this floor delivering a different number of lines from a cell step. It delivers ' +
                '`PINNED_COUNT`, which is what a store that routes by column delivers and half of ' +
                'what a store that does not delivers.'
        ),
        B2: met(
            'this being read as the hand-written anchor. It holds two arrays of strings and no store ' +
                'at all; the anchor has its own row in the table this scales.'
        ),
        B3: met(
            'a library appearing in this table. There is no adapter in this script by construction.'
        ),
        B4: met(
            'the cell row coming out BELOW this number. A store that routes by column delivers one ' +
                'of these a step and one that does not delivers two, so neither can.'
        ),
        C1: met(
            'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
                'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
        ),
        C2: met(
            'this row measured under a different sampling plan from the cell table it scales.'
        ),
        C3: met(
            'a spread above `SPREAD_CEILING` here passing quietly. A floor whose own variation is ' +
                'unreported would carry that variation into every multiple in its table.'
        ),
        C4: met(
            'this floor measured in the same process as the cell row it scales.'
        ),
        C5: notMet(
            'the resolution controls are bodies over a store and this script has none, so no control ' +
                'is measured above this table; and with one row in it there is no gap for a control ' +
                'to attest.'
        ),
    }),
    steps: PINNED_COUNT * 2,
    rebuild: false,
    // The suffix alternates, so a repeat is always a real change — the cell
    // script's reason.
    repeatable: true,
    prepare: ctx => {
        const ids = ctx.cells.ids;
        cellFloorLabels.length = ids.length;
        cellFloorNotes.length = ids.length;
    },
    /** Both views back to the values the population rests at. */
    restore: ctx => {
        const ids = ctx.cells.ids;
        for (let at = 0; at < ids.length; at++) {
            const row = ctx.rowById.get(ids[at]);
            cellFloorLabels[at] = row === undefined ? '' : row.label;
            cellFloorNotes[at] = row === undefined ? '' : row.note;
        }
        cellFloorTurn = 0;
    },
    run: ctx => {
        const cells = ctx.cells;
        const ids = cells.ids;
        cellFloorTurn ^= 1;
        const suffix = cellFloorTurn === 1 ? '' : 'x';
        const labels = ctx.plan.patchedLabels;
        const notes = ctx.plan.patchedNotes;
        for (let at = 0; at < ids.length; at++) {
            cellFloorLabels[at] = `${labels[at]}${suffix}`;
            deliverCells(ctx.consumers.a, cells, cellFloorLabels);
        }
        for (let at = 0; at < ids.length; at++) {
            cellFloorNotes[at] = `${notes[at]}${suffix}`;
            deliverCells(ctx.consumers.b, cells, cellFloorNotes);
        }
    },
    check: ctx =>
        expect('cell floor A (label) distinct renders', ctx.consumers.a.distinct, PINNED_COUNT) ??
        expect('cell floor B (note) distinct renders', ctx.consumers.b.distinct, PINNED_COUNT) ??
        expect('lines per delivery', ctx.consumers.b.rowCount(), PINNED_COUNT),
    /**
     * The model loads the population itself and then replays the two halves through
     * `emitCells` — the same body `targeted column delivery` is checked against.
     *
     * IT EMITS BOTH VIEWS EVERY STEP where this script emits one, and that is not a
     * disagreement: the digest folds DISTINCT states only, so the view that was
     * handed the text it already shows folds nothing. Both sides arrive at
     * `PINNED_COUNT` distinct states per view, in the same order.
     */
    oracle: (ctx, model) => {
        model.load(ctx.rows);
        const cells = ctx.cells;
        model.emitCells(cells);
        model.settled();
        const suffix = cellFloorTurn === 1 ? '' : 'x';
        const labels = ctx.plan.patchedLabels;
        const notes = ctx.plan.patchedNotes;
        for (let at = 0; at < cells.ids.length; at++) {
            model.setLabel(cells.ids[at], `${labels[at]}${suffix}`);
            model.emitCells(cells);
        }
        for (let at = 0; at < cells.ids.length; at++) {
            model.setNote(cells.ids[at], `${notes[at]}${suffix}`);
            model.emitCells(cells);
        }
    },
};

/* ── the lifecycle of a screen: arriving, filling up, going away ────────── */

/**
 * KEYS THE STORE DOES NOT HOLD, WRITTEN INTO A STORE THAT IS ALREADY FULL.
 *
 * IT IS AN INSERT AND NOT AN UPSERT, and that is a property of the DATA rather
 * than of a method: `write` is the same call the load and the re-send make, but
 * not one of these keys exists in the store, so no adapter's write path can take
 * the "already there" arm. The rows are given ids of their own — `f…`, which
 * `makeRows` never produces — and the untimed restore takes them out again with
 * `remove` so every sample inserts into the same populated state.
 *
 * WHERE THEY LAND. `INSERT_COUNT` rows dealt round-robin into the same fifty
 * groups, ranked BELOW everything the population holds, so each arrives at the
 * head of its own group's window and both views change by construction rather
 * than by arithmetic accident.
 */
const insertIntoPopulated: TScenario = {
    key: 'insertIntoPopulated',
    label: 'insert into a populated store',
    description:
        `One step: ${INSERT_COUNT} new rows are inserted in one batch into a full store, with every ` +
        'group sorted and every visible row subscribed. They sort first, so they appear at the top of ' +
        'every group and both views must change. "batch insert" fills an empty store; this adds to ' +
        'one already in use.',
    standing: ORDINARY_SCRIPT,
    steps: 1,
    rebuild: false,
    // Many writes, one settle — see `TScenario.finalStateOnly`.
    finalStateOnly: true,
    // The rows are in the store after one pass, so a second one inside the same
    // sample would be an UPSERT — the re-send scenario, not this one.
    repeatable: false,
    prepare: () => undefined,
    // Untimed. Harmless before the first sample, where the rows are not there
    // yet: an id the store does not hold is not an error (`TBinding.remove`).
    restore: ctx => {
        ctx.binding.remove(ctx.plan.freshIds);
        ctx.binding.settle();
    },
    run: ctx => {
        ctx.binding.write(ctx.insertRows);
        ctx.binding.settle();
    },
    /**
     * VIEW A'S HEAD IS AN INSERTED ROW. Every fresh rank is below every stored
     * rank, so this is what makes the insert VISIBLE rather than merely stored: a
     * store that accepted the rows and did not re-derive the window fails here
     * rather than posting the fastest time. Both windows must also still be FULL,
     * and each view must have delivered at least once — a floor, because the
     * render count is the store's answer.
     */
    check: ctx =>
        expect(
            'view A rows',
            ctx.consumers.a.rowCount(),
            Math.min(WINDOW, ctx.plan.groupSize + INSERT_COUNT / GROUPS)
        ) ??
        expect('view B rows', ctx.consumers.b.rowCount(), ctx.view.window) ??
        (ctx.consumers.a.head().startsWith('f')
            ? undefined
            : `view A's head is "${ctx.consumers.a.head()}", and every inserted row ranks below ` +
              'every stored one, so the head of the window after the insert must be an inserted row') ??
        atLeast('view A deliveries', ctx.consumers.a.deliveries, 1) ??
        atLeast('view B deliveries', ctx.consumers.b.deliveries, 1),
    oracle: (ctx, model) => {
        const fresh = ctx.plan.fresh;
        for (let i = 0; i < fresh.length; i++) model.put(fresh[i]);
        // ONE emit, matching the one settle.
        model.emit();
    },
};

let growthCopies: readonly (readonly TRow[])[] = [];

const growUnderSubscription: TScenario = {
    key: 'growUnderSubscription',
    label: 'the population keeps growing',
    description:
        `${GROWTH_FRAMES} steps. Each inserts a batch of new rows spread over every group and sorted ` +
        'first, and nothing is deleted, so the store ends forty per cent larger than it started. A ' +
        'store grown step by step is not the same as one loaded in one go: sorted lists and indexes ' +
        'can cost more as they grow. Every batch shows at the top of both views.',
    standing: ORDINARY_SCRIPT,
    steps: GROWTH_FRAMES,
    rebuild: false,
    finalStateOnly: true,
    repeatable: false,
    prepare: ctx => {
        growthCopies = ctx.plan.growth.map(batch => cloneRows(batch));
    },
    restore: ctx => {
        ctx.dropBinding();
        ctx.newBinding();
        ctx.binding.write(ctx.loadRows);
        ctx.binding.settle();
    },
    run: ctx => {
        for (let frame = 0; frame < growthCopies.length; frame++) {
            ctx.binding.write(growthCopies[frame]);
            ctx.binding.settle();
        }
    },
    check: ctx =>
        expect('view A rows', ctx.consumers.a.rowCount(), ctx.view.window) ??
        expect('view B rows', ctx.consumers.b.rowCount(), ctx.view.window) ??
        (ctx.consumers.a.head().startsWith('h')
            ? undefined
            : `view A's head is "${ctx.consumers.a.head()}", and every batch ranks below everything ` +
              'stored before it, so the head of the window after the last one must be a grown row') ??
        atLeast('view A distinct renders', ctx.consumers.a.distinct, GROWTH_FRAMES) ??
        atLeast('view B distinct renders', ctx.consumers.b.distinct, GROWTH_FRAMES),
    oracle: (ctx, model) => {
        const growth = ctx.plan.growth;
        for (let frame = 0; frame < growth.length; frame++) {
            const batch = growth[frame];
            for (let i = 0; i < batch.length; i++) model.put(batch[i]);
            model.emit();
        }
    },
};

/**
 * NOTHING EXISTS, AND THEN A SCREEN IS ON — the whole of it inside the clock:
 * `newBinding`, `write`, `settle`, and nothing else.
 *
 * WHAT IS NOT IN IT, named so the number is falsifiable: allocating the row
 * objects (`loadRows` is built once per process, exactly as for `batch insert`)
 * and disposing whatever store the last sample left behind.
 *
 * Read against `batch insert`, which is this script with the construction taken
 * out. Every other row is measured on a binding built before the clock, which is
 * how a library expensive to construct and cheap to write has been able to look
 * uniformly cheap here.
 */
const coldStart: TScenario = {
    key: 'coldStart',
    label: 'cold start to first render',
    description:
        'One step, timed from nothing: create the store and both views, subscribe them, insert every ' +
        'row, and render the first page of each view. The only scenario that times creating the ' +
        'store. Compare with "batch insert", the same work without creating the store: the ' +
        'difference is what setting up a store and its subscriptions costs.',
    standing: ORDINARY_SCRIPT,
    steps: 1,
    // NOT `rebuild`. That flag builds the store in the UNTIMED setup, which is
    // exactly the thing this row exists to time.
    rebuild: false,
    // No state either side continues from, so the consumers forget and the model
    // starts empty — `rebuild`'s position, reached the other way round.
    fromEmpty: true,
    /**
     * HOW MANY FRAMES A COLD START TAKES IS THE STORE'S ANSWER, and this row must
     * not also make it the pass condition.
     *
     * MEASURED, NOT ASSUMED. Six of the sixteen adapters produce TWO distinct
     * states here — mobx, legend-state, effector, nanostores, preact-signals and
     * alien-signals (worker `verify`, N=10 000, 2026-08-29, each `view A distinct
     * renders: got 2`) — because subscribing runs the reaction immediately, and it
     * runs against an EMPTY store. That is what a user sees: an empty frame and
     * then a full one.
     *
     * `batch insert` CANNOT SHOW IT: there the binding is built in the untimed
     * setup and the consumers are reset with `forget`, so the empty subscribe-time
     * render is discarded before the clock starts.
     */
    finalStateOnly: true,
    // The run IS the construction: a second pass would ask for a second store
    // while the first is still standing, and `newBinding` throws rather than
    // quietly timing a teardown as part of a cold start.
    repeatable: false,
    prepare: () => undefined,
    // Untimed: give back whatever store the last sample built. Idempotent, so the
    // first sample — whose binding the worker built and never loaded — is no
    // different.
    restore: ctx => {
        ctx.dropBinding();
    },
    run: ctx => {
        ctx.newBinding();
        ctx.binding.write(ctx.loadRows);
        ctx.binding.settle();
    },
    /**
     * BOTH VIEWS ARRIVED — a floor, for the reason above; what it catches is a
     * store that delivered NOTHING. And VIEW A IS FULL AT THE END, so the window
     * it ends on is the window every other script starts from. The TEXT is
     * adjudicated by the final-state comparison, the writes by the audit.
     */
    check: ctx =>
        atLeast('view A deliveries', ctx.consumers.a.deliveries, 1) ??
        atLeast('view B deliveries', ctx.consumers.b.deliveries, 1) ??
        expect(
            'view A rows',
            ctx.consumers.a.rowCount(),
            Math.min(WINDOW, ctx.plan.groupSize)
        ),
    oracle: (ctx, model) => {
        const rows = ctx.loadRows;
        for (let i = 0; i < rows.length; i++) model.put(rows[i]);
        model.emit();
    },
};

/**
 * THE SCREEN GOES AWAY — the teardown inside the clock. What a navigation costs
 * is every subscription detached, every derivation dropped and every identity
 * released: for this engine `OIMEffect.detach` per per-slot effect of every
 * window plus the holds, for a rescanning store a list of consumers dropped.
 *
 * THE PROOF FRAME, AND WHY A TIMED `dispose()` NEEDS ONE. A row that timed
 * `dispose()` and checked nothing would rank the adapters whose author wrote the
 * emptiest function. It is UNTIMED AND LIVES IN `check`: inside `run` it would
 * price a page write and a settle into every one of these rows, against a
 * teardown of tens of microseconds.
 *
 * A store that REFUSES the write after `dispose` has proved the teardown more
 * strongly — `@oimdb/core` refuses, because its bucket collection was given back
 * — so the throw is caught and the demand is the same either way: NOTHING WAS
 * DELIVERED. See `check` for what this row therefore cannot tell apart.
 *
 * THE POPULATION AUDIT DOES NOT RUN: there is no population, which is the
 * subject. See `TScenario.populationDestroyed` for what stands in for it.
 */
const tearDown: TScenario = {
    key: 'tearDown',
    label: 'tear the screen down',
    description:
        'One step: the whole screen, a full store with both views and every subscription, is ' +
        'disposed. The teardown itself must render nothing. Afterwards, outside the timing, rows are ' +
        'written into the disposed screen and nothing may render, so a dispose that disposed nothing ' +
        'fails instead of looking fastest. A library that refuses that write also passes.',
    // The one script whose subject is the store ceasing to be; two items follow
    // from that rather than from an omission.
    standing: signedFor(['tearDown'], {
        A1: notMet(
            'the timed operation is a `dispose()` and its whole assertion is that NOTHING is ' +
                'delivered — a consumer that re-rendered inside this clock would be a failure, not a ' +
                'result. What drives a consumer here is the UNTIMED proof frame afterwards, which ' +
                'writes a page into the torn-down binding and demands silence. So the timed region of ' +
                'this row ends in no consumer by construction.'
        ),
        A2: met(
            'a delivery in the proof frame counted as anything but a failure. This is the one script ' +
                'where the delivery counters are read for a ZERO rather than for a count, and the ' +
                'sabotage test that removed one line from the anchor\'s `dispose` is what showed they ' +
                'are read at all.'
        ),
        A3: notMet(
            'the store does not exist when the script ends, so neither the stored columns nor the ' +
                'fifty buckets can be audited. The proof frame stands in for both and is weaker in a ' +
                'named way: it CANNOT DISTINGUISH "refused the write" from "took it and stayed quiet". ' +
                'Both pass, only a delivery fails, and the report has no column that tells them apart.'
        ),
        A4: met(
            'the proof frame running only in the verify pass. A `dispose()` that disposed nothing ' +
                'produces a time in the timed process and no evidence at all without it.'
        ),
        B1: met(
            'one participant tearing down a screen another never built. `restore` puts the whole ' +
                'screen back untimed before every sample, and `dropBinding` first, because ' +
                '`newBinding` refuses to build over a live store.'
        ),
        B2: met(
            'the anchor\'s `dispose` dropping one reference. That is the FLOOR\'s move and it is ' +
                'cheaper on purpose; the anchor clears its view list, which is what a person writing ' +
                'a screen teardown by hand writes.'
        ),
        B3: met(
            'an adapter disposing more than the library gives it — a store cleared by hand where the ' +
                'library offers no teardown would measure this suite\'s code and call it the ' +
                'library\'s.'
        ),
        // MET SINCE 2026-08-30. A step here delivers nothing, so a floor measured
        // on a window delivery was not a bound on it in either direction.
        // `tearDownFloor` measures the same act with no library at all — a screen
        // built out of the population, two windows and a subscriber per visible
        // row, given back by dropping the one reference that reaches it — and
        // `floorKeyFor` hands this table that one.
        B4: met(
            '`floorKeyFor` handing this table `consumerFloor`. A step here DELIVERS NOTHING, so a ' +
                'floor measured on a window delivery is not a bound on it in either direction and no ' +
                'row of this table could be refused a place on it.'
        ),
        C1: met(
            'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
                'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
        ),
        C2: met(
            'a sampling plan derived per adapter rather than from the slowest participant of the ' +
                'scenario, or one cell of a minimum column carrying a mean.'
        ),
        C3: met(
            'a spread above `SPREAD_CEILING` here given a rank. This script is `repeatable: false`, ' +
                'so its samples are the shortest in the report and this gate is likelier to fire here ' +
                'than anywhere else.'
        ),
        C4: met(
            'the two arms of a pair measured in one process. One call site taught both shapes prices ' +
                'the second arm through a polymorphic site neither arm has in production.'
        ),
        C5: met(
            '`control-write` failing to clear this table\'s drift. A teardown performs no store ' +
                'mutation to double, so this arm attests the derivation the screen was built out of ' +
                'and nothing about the `dispose()` itself.'
        ),
    }),
    steps: 1,
    rebuild: false,
    populationDestroyed: true,
    // The store is gone after one pass. A second would dispose a binding that is
    // already disposed and report that as a teardown.
    repeatable: false,
    prepare: () => undefined,
    /**
     * Untimed: a whole screen put back, so every sample tears down the identical
     * thing. `dropBinding` first is not redundant — before the FIRST sample the
     * binding is the loaded one the worker built, and `newBinding` refuses to
     * build over a live store.
     */
    restore: ctx => {
        ctx.dropBinding();
        ctx.newBinding();
        ctx.binding.write(ctx.loadRows);
        ctx.binding.settle();
    },
    run: ctx => {
        ctx.dropBinding();
    },
    /**
     * TWO STATEMENTS, and the second is the proof. First: the teardown itself woke
     * nobody. Second: a write into the torn-down binding reaches nothing — the
     * page is the rows view A was showing, the strongest wake this dataset has, so
     * if one subscription survived, this is the write that finds it.
     */
    check: ctx => {
        const quiet =
            expect('deliveries during the teardown, view A', ctx.consumers.a.deliveries, 0) ??
            expect('deliveries during the teardown, view B', ctx.consumers.b.deliveries, 0);
        if (quiet !== undefined) return quiet;
        /**
         * A THROW IS AN ACCEPTABLE ANSWER, AND THE STRONGER ONE. `@oimdb/core`
         * refuses this write outright, which proves more than silence does; a
         * store that ACCEPTS it and delivers nothing has also proved it, one step
         * more weakly. Only a DELIVERY fails, and that demand is made either way,
         * because a throw part-way through cannot undo a render that happened.
         *
         * WHAT THIS ROW THEREFORE DOES NOT DISTINGUISH: "refused the write" from
         * "took it and stayed quiet". Both pass and the report has no column that
         * tells them apart.
         */
        try {
            ctx.binding.write(ctx.resendCopies[0]);
            ctx.binding.settle();
        } catch {
            // Deliberately swallowed. The assertion below is the one that runs
            // either way.
        }
        return (
            expect('deliveries after the teardown, view A', ctx.consumers.a.deliveries, 0) ??
            expect('deliveries after the teardown, view B', ctx.consumers.b.deliveries, 0)
        );
    },
    /**
     * NOTHING: the script delivers nothing, so the two empty sequences agree. The
     * proof frame is not replayed here on purpose — it runs against a store that
     * no longer exists, and what it asserts is a delivery COUNT, which `check`
     * owns.
     */
    oracle: () => undefined,
};

/* ── the read side: by key, at a moving offset, through two predicates ──── */

/**
 * The read wiring, or the reason there is none — `churnOf`'s refusal, for the
 * other optional builder.
 */
const readOf = (ctx: TScenarioContext): TReadBinding => {
    if (ctx.read === undefined) {
        throw new Error(
            'a read script was run against a binding that was not built by ' +
                '`adapter.reads[shape].build`. The scenario must name its read shape in `read` so ' +
                'the worker picks the fourth builder.'
        );
    }
    return ctx.read;
};

/**
 * ROWS FETCHED BY KEY — the one operation this suite had no timed instance of,
 * every method on `TBinding` being a write.
 *
 * THE LOOKUP IS THE MEASUREMENT and no adapter may pre-resolve these keys — one
 * that kept a handle per key from bind time would be printing `targeted column
 * delivery`'s answer under a read. A read the engine answers from state it
 * already maintains is not cheating: both arms resolve `WINDOW` keys and read
 * three columns each, and the gap is what the store's addressing is worth.
 *
 * THE PAGES ARE DISJOINT AND STRIDED: disjoint so every step's render is distinct
 * with no write having happened, strided rather than sliced because a page of
 * consecutive keys is a page some stores would already have contiguous.
 */
const readByKey: TScenario = {
    key: 'readByKey',
    label: 'read a page by key',
    description:
        `${READ_PAGES} steps. Each looks up ${WINDOW} rows by key, spread across the whole store, ` +
        'and renders `id rank label` for each. Nothing is written: the only scenario that times ' +
        'reading rather than reacting to a change. The keys may not be looked up in advance. The ' +
        'hand-written baseline answers with one Map lookup per key.',
    standing: READ_SCRIPT,
    steps: READ_PAGES,
    read: 'byKey',
    rebuild: false,
    // Nothing is written, so nothing needs putting back; and the pages are
    // disjoint, so the last page of one run differs from the first page of the
    // next.
    repeatable: true,
    prepare: () => undefined,
    restore: () => undefined,
    run: ctx => {
        const read = readOf(ctx);
        for (let page = 0; page < READ_PAGES; page++) {
            read.readKeys(page * WINDOW, WINDOW);
        }
    },
    /**
     * ONE DELIVERY PER PAGE AND EVERY ONE OF THEM DISTINCT, an equality both ways;
     * the pages are disjoint, so `distinct` must equal `deliveries`. View B is
     * asked for silence: no read step writes anything, so a delivery there means
     * the binding woke a derivation for a pull.
     */
    check: ctx =>
        expect('read deliveries', ctx.consumers.a.deliveries, READ_PAGES) ??
        expect('read distinct renders', ctx.consumers.a.distinct, READ_PAGES) ??
        expect('rows per page', ctx.consumers.a.rowCount(), WINDOW) ??
        expect('view B deliveries', ctx.consumers.b.deliveries, 0),
    oracle: (ctx, model) => {
        const keys = ctx.plan.readKeys;
        for (let page = 0; page < READ_PAGES; page++) {
            model.emitKeys(keys, page * WINDOW, WINDOW);
        }
    },
};

/**
 * THE WINDOW MOVES AND NOTHING ELSE DOES.
 *
 * THAT IT MUST NOT BECOME A RE-SORT is the trap this row is built around, closed
 * on both sides: the contract says so on `TReadBinding.scrollTo`, and an adapter
 * that re-derived its ordering here would be printing `the whole window
 * re-sorted`'s work under this row's name.
 *
 * WHAT IT SEPARATES. A store with an ordered index walks further into a list it
 * already maintains and pays whatever re-pointing its per-row subscriptions cost
 * — for this engine, one detach and one attach per visible row, every step, the
 * same cost `the whole window re-sorted` charges. A store with no index re-derives
 * from the whole population and throws away `offset` more rows than before, so a
 * deeper offset is very nearly free to it.
 */
const scrollWindow: TScenario = {
    key: 'scrollWindow',
    label: 'scroll the window',
    description:
        `${SCROLL_STEPS} steps. Each scrolls view A within group A, a quarter page at a time down to ` +
        'one full page and back to the top. No data changes. Every step must show a new page; view ' +
        'B, a filtered view of the same group that does not scroll, must not change. Compare with ' +
        '"the whole window re-sorted": there the data moves under a fixed page, here the page moves ' +
        'over fixed data.',
    standing: READ_SCRIPT,
    steps: SCROLL_STEPS,
    read: 'byWindow',
    rebuild: false,
    // Every run ends at offset 0, where it started, and consecutive offsets always
    // differ — including the last of one run against the first of the next.
    repeatable: true,
    prepare: () => undefined,
    restore: ctx => {
        readOf(ctx).scrollTo(0);
        ctx.binding.settle();
    },
    run: ctx => {
        const read = readOf(ctx);
        const offsets = ctx.plan.scrollOffsets;
        for (let i = 0; i < offsets.length; i++) {
            read.scrollTo(offsets[i]);
            ctx.binding.settle();
        }
    },
    check: ctx =>
        expect(
            'view A distinct renders',
            ctx.consumers.a.distinct,
            ctx.plan.scrollOffsets.length
        ) ??
        expect('view A rows', ctx.consumers.a.rowCount(), ctx.view.window) ??
        expect('view B distinct renders', ctx.consumers.b.distinct, 0),
    oracle: (ctx, model) => {
        const offsets = ctx.plan.scrollOffsets;
        for (let i = 0; i < offsets.length; i++) model.emitReadViews(offsets[i]);
    },
};

const deepScroll: TScenario = {
    key: 'deepScroll',
    label: 'scroll deep into the group',
    description:
        `${SCROLL_STEPS} steps. Like "scroll the window", but view A jumps in four equal steps to the ` +
        'last full page of the group and back, as in virtual scrolling far from the top. No data ' +
        'changes. A library that keeps the group sorted jumps straight to the position; one that does ' +
        'not sorts the whole group again and discards everything above the page. Every step must ' +
        'show a full new page; view B must not change.',
    standing: READ_SCRIPT,
    steps: SCROLL_STEPS,
    read: 'byWindow',
    rebuild: false,
    repeatable: true,
    prepare: () => undefined,
    restore: ctx => {
        readOf(ctx).scrollTo(0);
        ctx.binding.settle();
    },
    run: ctx => {
        const read = readOf(ctx);
        const offsets = ctx.plan.deepScrollOffsets;
        for (let i = 0; i < offsets.length; i++) {
            read.scrollTo(offsets[i]);
            ctx.binding.settle();
        }
    },
    check: ctx =>
        expect(
            'view A distinct renders',
            ctx.consumers.a.distinct,
            ctx.plan.deepScrollOffsets.length
        ) ??
        expect('view A rows', ctx.consumers.a.rowCount(), ctx.view.window) ??
        expect('view B distinct renders', ctx.consumers.b.distinct, 0),
    oracle: (ctx, model) => {
        const offsets = ctx.plan.deepScrollOffsets;
        for (let i = 0; i < offsets.length; i++) model.emitReadViews(offsets[i]);
    },
};

const viewSwitch: TScenario = {
    key: 'viewSwitch',
    label: 'the view switches group',
    description:
        `${SWITCH_STEPS} steps. Each switches view A to another group, like a user changing tab or ` +
        `filter: ${SWITCH_STEPS - 1} different groups, then back to group A. No data changes. Every ` +
        'step must show a full page of the new group from its top; view B must not change. A library ' +
        'that keeps a list per group reads another list; one that does not filters the whole store ' +
        'again.',
    standing: signedFor(['viewSwitch'], {
        A1: met(
            'a switch answered from a window derived before the clock — every group\'s first window ' +
                'kept warm by the adapter — so that a step re-delivers a cached answer instead of ' +
                'asking the store for the selection.'
        ),
        A2: met(
            'the deliveries to view B folded into its total. A switch moves view A\'s selection and ' +
                'nothing view B selects on, so every delivery to B is redundant by construction and ' +
                'the count of them is a store waking a view the switch did not concern.'
        ),
        A3: met(
            'the population audit reading the store through its own view instead of `readAll`, or the ' +
                'grouping audit answered out of the rows the column audit compared. Nothing is ' +
                'written, so the audits afterwards are the proof that a switch moved no row.'
        ),
        A4: met(
            'the exact state count — one per switch — being checked in the verify pass and not in the ' +
                'timed one. A switch that delivered the previous group\'s window again leaves the ' +
                'same population behind as one that delivered the new group.'
        ),
        B1: met(
            'one participant re-pointing a view it keeps per group while another rebuilds a view from ' +
                'nothing, with no arm beside either. Both anchors have a read row, and the gap between ' +
                'them is the price of the group index on a selection that moves.'
        ),
        B2: met(
            'the indexed anchor rescanning the population on a switch, or the lean anchor keeping a ' +
                'bucket per group. Either stops the gap between them pricing the index.'
        ),
        B3: met(
            'an adapter keeping one derived view per group alive and swapping between them, where the ' +
                'library is asked to re-select. That would price the adapter\'s cache under the ' +
                'library\'s name.'
        ),
        B4: met(
            'this table scaled by a floor whose step is not a window delivery. A switch delivers one ' +
                'full window of `WINDOW` lines, which is what `consumerFloor` measures.'
        ),
        C1: met(
            'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
                'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
        ),
        C2: met(
            'a sampling plan derived per adapter rather than from the slowest participant of the ' +
                'scenario, or one cell of a minimum column carrying a mean.'
        ),
        C3: met(
            'a row whose spread is above `SPREAD_CEILING` being given a rank rather than the `·` ' +
                'that says its number is not being presented as a result.'
        ),
        C4: met(
            'the two arms of a pair measured in one process. One call site taught both shapes prices ' +
                'the second arm through a polymorphic site neither arm has in production.'
        ),
        C5: notMet(
            'ONE ARM AND NOT TWO. `control-lean` and `control-heavy` supply the switch wiring and ' +
                'attest a DOUBLED READ; `control-write` declines the read wiring in writing, because ' +
                'four of the five read scripts write nothing at all, this one among them. The full ' +
                'reasoning is on `READ_SCRIPT`.'
        ),
    }),
    steps: SWITCH_STEPS,
    read: 'bySwitch',
    rebuild: false,
    repeatable: true,
    prepare: () => undefined,
    restore: ctx => {
        readOf(ctx).switchGroup(ctx.view.groupA);
        ctx.binding.settle();
    },
    run: ctx => {
        const read = readOf(ctx);
        const groups = ctx.plan.switchGroups;
        for (let i = 0; i < groups.length; i++) {
            read.switchGroup(groups[i]);
            ctx.binding.settle();
        }
    },
    check: ctx =>
        expect('view A distinct renders', ctx.consumers.a.distinct, ctx.plan.switchGroups.length) ??
        expect('view A rows', ctx.consumers.a.rowCount(), ctx.view.window) ??
        expect('view B distinct renders', ctx.consumers.b.distinct, 0),
    oracle: (ctx, model) => {
        const groups = ctx.plan.switchGroups;
        for (let i = 0; i < groups.length; i++) model.send(model.a, model.windowOf(groups[i]));
    },
};

/**
 * TWO PREDICATES INSTEAD OF ONE. Both views are over GROUP A, so the gap between
 * them is the predicate count and not the group.
 *
 * WHAT THIS ROW DOES NOT ISOLATE: THE SECOND AXIS NEVER MOVES. It is derived from
 * the KEY (see `onSecondAxis`), so no script can change it and a store is free to
 * decide a row's row set of it once. What is measured is a change on axis ONE
 * against a fixed predicate on axis TWO; a store re-filing a row because the
 * second axis itself moved — the harder half of multi-axis selection — is not.
 *
 * The reason is the dataset's and is not fixable inside this row: `TRow`'s five
 * columns are all spoken for — `note` in particular exists to be the column
 * NOTHING selects on — and a sixth would have to be stored, returned and audited
 * in all eighteen adapters, including the sixteen with no row here.
 */
const filterTwoAxes: TScenario = {
    key: 'filterTwoAxes',
    label: 'a view filtered on two axes',
    description:
        '4 steps with two views of the same group: view A filters by `group` only, view B by `group` ' +
        'and a second condition. The steps move two rows out of the group and back: one that matches ' +
        "view B's second condition and one that does not. View A must update all four times, view B " +
        'only twice. Measured: how often view B was woken for a row its filter already excluded.',
    // The read wiring's one exception plus one of its own, written out in full
    // rather than signed over `READ_SCRIPT`.
    //
    // `reads.byTwoAxes` is this script's alone: a library that can answer the
    // scroll and not this declines this by name.
    standing: signedFor(['filterTwoAxes'], {
        A1: notMet(
            'HALF OF WHAT THIS ROW CLAIMS TO MEASURE IS NEVER PERFORMED. The second axis is derived ' +
                'from the KEY and is therefore immutable: no timed operation moves it, so no consumer ' +
                'ever re-renders because of a second-axis change, and a store re-filing a row because ' +
                'the second axis itself moved — the harder half of multi-axis selection — is not ' +
                'measured. What IS measured is a change on axis one against a fixed predicate on axis ' +
                'two. The dataset is the reason and it is not fixable inside this row: all five columns ' +
                'are spoken for, and a sixth would have to be stored, returned and audited in all ' +
                'seventeen adapters and the three controls.'
        ),
        A2: met(
            'the redundant deliveries to view B folded into its total. HOW OFTEN VIEW B WAS WOKEN ' +
                'ANYWAY IS THIS ROW: both movers change on axis one, and two of the four steps ' +
                'concern a row its second predicate had already excluded.'
        ),
        A3: met(
            'the population audit reading the store through its own view instead of `readAll`. Both ' +
                'movers end where they started, so the audit afterwards is what proves four real ' +
                'group moves happened rather than none.'
        ),
        A4: met(
            'the exact per-view state counts — four for A, two for B — checked in the verify pass ' +
                'and not in the timed one. A store that woke B four times leaves the same population ' +
                'behind as one that woke it twice.'
        ),
        B1: met(
            'the two views selecting on different GROUPS. They are over the same group deliberately, ' +
                'so the gap between them is the predicate COUNT and not the group.'
        ),
        B2: met(
            'the anchor filtering on the second axis outside its view — a hand-written screen that ' +
                'post-filters what its own selector returned is not what a competent person writes, ' +
                'and it would hide the wake this row counts.'
        ),
        B3: met(
            'an adapter filtering the result of its own view. The second predicate is the ' +
                'LIBRARY\'S in every row — `where(callback)`, `$regex`, `q.fn.where`, `applyWhere`, a ' +
                'second derived index keyed on both — and an adapter narrowing afterwards would be ' +
                'answering with the suite\'s code.'
        ),
        B4: met(
            'this table scaled by a floor whose step is not a window delivery. Each step here ' +
                'delivers a window, which is what `consumerFloor` measures.'
        ),
        C1: met(
            'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
                'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
        ),
        C2: met(
            'a sampling plan derived per adapter rather than from the slowest participant of the ' +
                'scenario, or one cell of a minimum column carrying a mean.'
        ),
        C3: met(
            'a row whose spread is above `SPREAD_CEILING` being given a rank rather than the `·` ' +
                'that says its number is not being presented as a result.'
        ),
        C4: met(
            'the two arms of a pair measured in one process. One call site taught both shapes prices ' +
                'the second arm through a polymorphic site neither arm has in production.'
        ),
        C5: notMet(
            'ONE ARM AND NOT TWO. `control-lean` and `control-heavy` supply a read wiring since ' +
                '2026-08-30 and attest a DOUBLED READ, so this table has a resolution where it had ' +
                'none; `control-write` declines the wiring in writing, because four of the five read ' +
                'scripts write nothing at all. The full reasoning is on `READ_SCRIPT`.'
        ),
    }),
    steps: 4,
    read: 'byTwoAxes',
    rebuild: false,
    // Both movers end where they started, so a repeat inside one sample performs
    // the identical four real group moves.
    repeatable: true,
    prepare: () => undefined,
    restore: ctx => {
        ctx.binding.setGroup(ctx.plan.axisMover, ctx.view.groupA);
        ctx.binding.setGroup(ctx.plan.plainMover, ctx.view.groupA);
        ctx.binding.settle();
    },
    run: ctx => {
        const { axisMover, plainMover } = ctx.plan;
        const { groupA, groupB } = ctx.view;
        ctx.binding.setGroup(axisMover, groupB);
        ctx.binding.settle();
        ctx.binding.setGroup(plainMover, groupB);
        ctx.binding.settle();
        ctx.binding.setGroup(axisMover, groupA);
        ctx.binding.settle();
        ctx.binding.setGroup(plainMover, groupA);
        ctx.binding.settle();
    },
    /**
     * FOUR NEW STATES FOR ONE PREDICATE AND TWO FOR TWO, both equalities. View B's
     * row count comes from the plan rather than being assumed to be a full window:
     * the axis splits a group roughly in half, and at the smallest population half
     * of group A is about one window.
     */
    check: ctx =>
        expect('view A (one axis) distinct renders', ctx.consumers.a.distinct, 4) ??
        expect('view B (two axes) distinct renders', ctx.consumers.b.distinct, 2) ??
        expect('view A rows', ctx.consumers.a.rowCount(), ctx.view.window) ??
        expect('view B rows', ctx.consumers.b.rowCount(), ctx.plan.axisWindowSize),
    oracle: (ctx, model) => {
        const { axisMover, plainMover } = ctx.plan;
        const { groupA, groupB } = ctx.view;
        model.setGroup(axisMover, groupB);
        model.emitReadViews(0);
        model.setGroup(plainMover, groupB);
        model.emitReadViews(0);
        model.setGroup(axisMover, groupA);
        model.emitReadViews(0);
        model.setGroup(plainMover, groupA);
        model.emitReadViews(0);
    },
};

/* ── two entity types: a relationship, and a key made of two identities ─── */

/**
 * THE TWO-ENTITY-TYPE FAMILY — the last of the seventeen things
 * `how-a-benchmark-earns-belief.md` section D says a front-end asks for.
 *
 * THEY ARE ONE FAMILY AND IN THIS ORDER because a composite key in this engine is
 * made of COLLECTION IDENTITIES — `OIMSlotByKeyStoreTreeDriven` is typed on
 * `readonly TOIMEntitySlot[]` — so a suite with one collection has no second
 * segment to offer. The relationship row brings the second collection.
 *
 * A COMPOSITE KEY OVER SCALARS IS NOT MEASURED, and there is nothing shipped to
 * measure: the tree store's key type is a list of slots, a scalar selector is a
 * compile error, and past a cast a scalar segment throws inside the mint
 * (`Cannot create property 'holdCount' on string`) after the edge is already in
 * the tree — a named known defect in `packages/core/src/index.ts`.
 *
 * ONE ENGINE BACK IT DOES HAVE AN ANSWER: `packages/core-legacy`, registered here
 * as `oimdb-3.12.1`, keys composite stores by `readonly TOIMPk[]` over
 * `OIMTrieMap`. So the scalar-tuple arm exists in this repository, at a row
 * already in the tables, and is NOT WIRED for these two scripts — a gap in the
 * report and not a property of either engine. `oimdb-3.12.1`'s own
 * `relations.absent` says so where a reader meets the absence.
 */

/**
 * The relationship wiring, or the reason there is none — `churnOf`'s refusal, for
 * the fifth builder.
 */
const relationOf = (ctx: TScenarioContext): TRelationBinding => {
    if (ctx.relation === undefined) {
        throw new Error(
            'a relation script was run against a binding that was not built by ' +
                '`adapter.relations.build`. The scenario must set `relation: true` so the worker ' +
                'picks the fifth builder.'
        );
    }
    return ctx.relation;
};

/**
 * ONE NAME PER STEP OF THE JOIN SCRIPT, pairwise distinct — `DIRTY_MARKS`' idiom
 * and its reasons. The `v` prefix is distinct from every other value set in this
 * suite (`w` owners at rest, `l`/`n` stored, `p`/`q` patched, `b` batched, `d`
 * dirty, `s` churned, `z` a pair seed, `y` a pair mark), so a name found in the
 * wrong place names the script that wrote it.
 */
const RELATION_NAMES: readonly string[] = Array.from(
    { length: RELATION_STEPS },
    (_, k) => `v${'x'.repeat(k)}`
);

/** The mark each pair record is written to, one per relation row. */
const PAIR_MARKS: readonly string[] = Array.from(
    { length: RELATION_ROWS },
    (_, i) => scrambledText('y', i)
);

/** Which of the two disjoint mark sets the composite-key script is writing. */
let pairTurn = 0;

/**
 * THE STANDING BOTH RELATION SCRIPTS SHARE, and the THREE items a relation wiring
 * cannot meet however it is written — A1, A3 and B3. A named full record for
 * `ORDINARY_SCRIPT`'s reason, signed for the two scripts it was written for.
 */
const RELATION_SCRIPT: TStandardStanding = signedFor(
    ['relationWrite', 'compositeKeyWrite'],
    {
    A1: notMet(
        'THE RELATIONSHIP ITSELF NEVER MOVES. `TRow` has five columns and every one is spoken for, ' +
            'so the foreign key is DERIVED FROM THE ROW\'S ID (`ownerOf` in `dataset.ts`) and handed ' +
            'to the binding as an address, exactly as `ids` and `ranks` are — and a derived key is ' +
            'immutable. So no timed operation re-parents a row, and a store re-filing a child ' +
            'because its foreign key moved is NOT measured here. What is measured is a write to a ' +
            'PARENT reaching a view over its children, and a record addressed by a parent and a ' +
            'child together. Closing it needs a sixth column, which would have to be stored, ' +
            'returned by `readAll` and compared by the population audit in every adapter, including ' +
            'the fifteen with no row in these tables at all.'
    ),
    A2: met(
        'view B\'s deliveries folded into its total. VIEW B IS `patchNote`\'S INSTRUMENT ONE TYPE ' +
            'UP: a delivery there is a store that could not tell a write to an owner from a write to ' +
            'a record keyed by that owner, and the count of them is the result rather than a failure.'
    ),
    A3: notMet(
        'a relation binding derives NO VIEW and keeps no grouping — there is no window, no group ' +
            'and no sort in it anywhere — so `groupOrder` answers `undefined` and the fifty-bucket ' +
            'half of the audit does not run. What DOES run is three population audits against the ' +
            'reference model: the rows and their four columns, the owners and their names, and every ' +
            'pair record read back UNDER THE PAIR IT IS FILED AT.'
    ),
    A4: met(
        'the three population audits — the rows, the owners, and every pair record under the pair it ' +
            'is filed at — running in the verify pass and not in the timed one. A join that answered ' +
            'from the wrong owner delivers the same NUMBER of lines as one that did not.'
    ),
    B1: met(
        'the anchor working out at BIND TIME that a view over rows depends on owners, where the ' +
            'engine is asked to. The fan-out is two rows per owner deliberately, so one owner write ' +
            'moves exactly two of view A\'s lines and a one-to-one relationship cannot stand in.'
    ),
    B2: met(
        'the anchor keeping a per-owner index of its children. It rescans, as the lean anchor does ' +
            'everywhere else, and the participant that keeps the index has its own row here.'
    ),
    B3: notMet(
        'ONE relation declaration covers both scripts (`TRelationEntry`), so a library that could ' +
            'hold two entity types but not key a record by one identity of each has to decline both ' +
            'and this report cannot say which of them it was declining. It is one entry because the ' +
            'two are not independent: the second collection the relationship brings is where the ' +
            "composite key's second segment comes from."
    ),
    // MET SINCE 2026-08-30. The gap was `targeted column delivery`'s, at the same
    // size and for the same reason: a step here delivers `RELATION_ROWS` lines
    // where `consumerFloor` measures `WINDOW`, so the floor was larger than a step
    // and the multiple an under-estimate. `relationFloor` measures ONE RELATION
    // DELIVERY of `RELATION_ROWS` lines — the delivery and NOT the join, which is
    // these rows' own subject — and `floorKeyFor` hands both tables that one.
    B4: met(
        '`floorKeyFor` handing these tables `consumerFloor`. A step here delivers `RELATION_ROWS` ' +
            'lines where that floor measures `WINDOW`, so the multiple would be an UNDER-estimate and ' +
            'the gate would refuse rows on arithmetic pointing the wrong way.'
    ),
    C1: met(
        'the load banner printed only when the gate is exceeded, or the busy judgement made against ' +
            'a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
    ),
    C2: met(
        'a sampling plan derived per adapter rather than from the slowest participant of the ' +
            'scenario, or one cell of a minimum column carrying a mean.'
    ),
    C3: met(
        'a row whose spread is above `SPREAD_CEILING` being given a rank. With two participants a ' +
            'tie and a verdict are one row apart, so this gate decides more here than anywhere else.'
    ),
    C4: met(
        'the two arms of a pair measured in one process. One call site taught both shapes prices the ' +
            'second arm through a polymorphic site neither arm has in production.'
    ),
    // MET SINCE 2026-08-30: the three resolution controls now supply a relation
    // wiring — a second population, a pair table composed per call, and both
    // views — and the arm these tables are attested on computes BOTH RELATION
    // VIEWS TWICE and delivers once.
    C5: met(
        'the doubled-join arm failing to clear these tables\' drift. It computes BOTH RELATION VIEWS ' +
            'TWICE and delivers once, so what it attests is the join — the quantity these rows are ' +
            'about — and a gap that cannot clear the drift attests nothing.'
    ),
    }
);

/**
 * A WRITE TO ONE ENTITY TYPE WAKING A VIEW BUILT OVER ANOTHER — the operation a
 * one-type suite structurally cannot contain.
 *
 * THE FAN-OUT IS DELIBERATE: the rows point at the owners two each, so one owner
 * write moves exactly two of view A's lines, which a one-to-one relationship
 * would not do. A store with per-entity subscriptions has to have worked out, at
 * bind time, that a view over ROWS depends on OWNERS — which is why what the
 * timed region shows is the DELIVERY.
 *
 * VIEW B is `patchNote`'s instrument one type up: a delivery there is a store
 * that could not tell a write to an owner from a write to a record keyed by that
 * owner, and the count of them is the result rather than a failure.
 */
const relationWrite: TScenario = {
    key: 'relationWrite',
    label: 'a write to a related entity',
    description:
        `${RELATION_STEPS} steps with two record types: ${RELATION_ROWS} rows each point to an owner, ` +
        `${RELATION_TOUCHED} owners with two rows each. Each step changes one owner's \`name\`; no row ` +
        "changes. View A shows each row with its owner's name, so it must update and two of its lines " +
        'change. View B shows the same rows through another linked record and must not change. No ' +
        'row changes its owner.',
    standing: RELATION_SCRIPT,
    steps: RELATION_STEPS,
    relation: true,
    rebuild: false,
    // Every step writes a name no neighbouring step writes — including the last
    // step of one run against the first step of the next.
    repeatable: true,
    // THE ONE UNTIMED RESOLUTION; it also re-points both consumers onto the
    // relation views. See `TRelationBinding.holdRelation`.
    prepare: ctx => {
        relationOf(ctx).holdRelation(ctx.relationConfig);
    },
    // Every touched owner put back through the SAME positional path the script
    // writes through, so a sample starts from the state `holdRelation` rendered.
    restore: ctx => {
        const relation = relationOf(ctx);
        const names = ctx.relationConfig.names;
        for (let at = 0; at < names.length; at++) {
            relation.patchOwnerName(at, names[at]);
        }
        ctx.binding.settle();
    },
    run: ctx => {
        const relation = relationOf(ctx);
        for (let step = 0; step < RELATION_STEPS; step++) {
            relation.patchOwnerName(step % RELATION_TOUCHED, RELATION_NAMES[step]);
            ctx.binding.settle();
        }
    },
    // ONE NEW STATE PER STEP IN VIEW A AND NONE IN VIEW B, an equality both ways.
    // Zero in B is the whole of what "this store knows the two apart" means here;
    // a store that WOKE B anyway shows it in the redundancy counter, not a failure.
    check: ctx =>
        expect('joined view distinct renders', ctx.consumers.a.distinct, RELATION_STEPS) ??
        expect('joined view rows', ctx.consumers.a.rowCount(), RELATION_ROWS) ??
        expect('pair view distinct renders', ctx.consumers.b.distinct, 0),
    /**
     * Opens by putting the model into the state `holdRelation` left the adapter's
     * consumers in — `cellDelivery.oracle`'s move, for its reason. The owners and
     * the pair records are loaded here on the same grounds: the harness's untimed
     * load put them in the store, and the model has to be where the store is.
     */
    oracle: (ctx, model) => {
        const config = ctx.relationConfig;
        model.loadOwners(ctx.owners);
        model.seedPairs(config);
        model.emitRelation(config);
        model.settled();
        for (let step = 0; step < RELATION_STEPS; step++) {
            model.setOwnerName(
                config.touched[step % RELATION_TOUCHED],
                RELATION_NAMES[step]
            );
            model.emitRelation(config);
        }
    },
};

/**
 * A RECORD ADDRESSED BY A COMBINATION OF TWO IDENTITIES.
 *
 * THE COMPOSITION IS THE MEASUREMENT — the exact opposite of every other
 * positional write here, where `pin` and `holdChurnRows` exist to take a lookup
 * OUT of a write. NEITHER ARM MAY CACHE THE COMPOSED KEY, or the row prints the
 * cost of an array read under the name of a composite key.
 *
 * NOT A MINT: `holdRelation` creates the records before the clock, so every step
 * is a resolution and an update. A script that minted on its first run and
 * updated on the rest would not be repeatable and the timing loop would fold two
 * operations into one number.
 *
 * WHY THE AUDIT CARRIES THIS ROW. A mark written into the WRONG pair — a descent
 * that lost a segment, a join that dropped its separator, a key composed the
 * wrong way round — is text a digest cannot tell from the right answer while both
 * confused records are on screen. `readPairs` reads the KEY back out of the store
 * and `firstPairMismatch` compares it against the model's.
 */
const compositeKeyWrite: TScenario = {
    key: 'compositeKeyWrite',
    label: 'a record keyed by two identities',
    description:
        `${RELATION_ROWS} steps. Each changes the \`mark\` of a record identified by a pair (owner, ` +
        'row), with the two-part key built fresh on every call. View B shows these marks and must ' +
        'update every step; view A must not change. Measured: finding a record by a two-part key; a ' +
        'hand-written store joins the two ids into a string and looks it up in a Map. The records ' +
        'exist before timing starts, so nothing is created.',
    standing: RELATION_SCRIPT,
    steps: RELATION_ROWS,
    relation: true,
    rebuild: false,
    // Two disjoint mark sets, alternated, for `patchColumn`'s reason.
    repeatable: true,
    prepare: ctx => {
        relationOf(ctx).holdRelation(ctx.relationConfig);
    },
    // Every pair record put back to its seed through the SAME composed-key path
    // the script writes through.
    restore: ctx => {
        const relation = relationOf(ctx);
        const seeds = ctx.relationConfig.seeds;
        for (let at = 0; at < seeds.length; at++) relation.writePair(at, seeds[at]);
        ctx.binding.settle();
        pairTurn = 0;
    },
    run: ctx => {
        const relation = relationOf(ctx);
        pairTurn ^= 1;
        const suffix = pairTurn === 1 ? '' : 'x';
        for (let at = 0; at < RELATION_ROWS; at++) {
            relation.writePair(at, `${PAIR_MARKS[at]}${suffix}`);
            ctx.binding.settle();
        }
    },
    // ONE NEW STATE PER PAIR IN VIEW B AND NONE IN VIEW A — the mirror image of
    // `relationWrite.check`, an equality on both sides for its reasons.
    check: ctx =>
        expect('pair view distinct renders', ctx.consumers.b.distinct, RELATION_ROWS) ??
        expect('pair view rows', ctx.consumers.b.rowCount(), RELATION_ROWS) ??
        expect('joined view distinct renders', ctx.consumers.a.distinct, 0),
    oracle: (ctx, model) => {
        const config = ctx.relationConfig;
        model.loadOwners(ctx.owners);
        model.seedPairs(config);
        model.emitRelation(config);
        model.settled();
        const suffix = pairTurn === 1 ? '' : 'x';
        for (let at = 0; at < config.ids.length; at++) {
            model.putPair(
                config.owners[at],
                config.ids[at],
                `${PAIR_MARKS[at]}${suffix}`
            );
            model.emitRelation(config);
        }
    },
};

/** The text each relation view is showing — this floor's whole state. */
const relationFloorNames: string[] = [];
const relationFloorMarks: string[] = [];
/**
 * WHICH RELATION ROWS EACH TOUCHED OWNER IS THE PARENT OF, worked out ONCE in
 * `prepare` and never inside the clock.
 *
 * A step of the join script writes one owner's name and the view shows it against
 * TWO lines. Searching `config.owners` for those two lines inside the timed region
 * would put a scan in the floor that no participant pays, and a floor bigger than
 * the thing it bounds refuses places it has no right to.
 */
const relationFloorOwned: number[][] = [];
/** Which of the two disjoint mark sets this run is writing. */
let relationFloorTurn = 0;

/**
 * ONE RELATION DELIVERY, `RELATION_ROWS` LINES, WITH NO STORE — the lower bound
 * both relation tables are scaled by.
 *
 * `cellFloor`'S CONSTRUCTION AT THE OTHER FAMILY'S SCALE, and it closes the same
 * gap: `consumerFloor` measures a WINDOW delivery of `WINDOW` lines where a
 * relation step delivers `RELATION_ROWS`, so the multiple printed beside every row
 * of those two tables was an UNDER-estimate and no row of them could be refused a
 * place on it.
 *
 * WHAT IT DOES NOT MEASURE, deliberately: THE JOIN. A hand-written relation store
 * performs two map reads per rendered line inside the delivery, and that is the
 * store's own work — the thing the two rows exist to price. What every participant
 * pays alike is the delivery of `RELATION_ROWS` formatted lines through
 * `deliverRelation`, and that is what this is.
 *
 * BOTH HALVES, because the family has two scripts and they deliver into different
 * views: the join script produces `RELATION_STEPS` new states in view A, and the
 * composite-key script `RELATION_ROWS` in view B. One floor, `steps` counting
 * both, so `perStepMs` is one relation delivery whichever table quotes it.
 */
const relationFloor: TScenario = {
    key: 'relationFloor',
    label: 'relation lower bound',
    description:
        `Lower bound, no library: the ${RELATION_STEPS + RELATION_ROWS} steps of "a write to a ` +
        'related entity" and "a record keyed by two identities", each rendering the changed view ' +
        'straight from arrays of strings. Looking up the linked records is left out, because that is ' +
        'what those two scenarios measure. No library can come out below it.',
    standing: signedFor(['relationFloor'], {
        A1: met(
            'a step delivering no relation view. Each step delivers one, through the same ' +
                '`deliverRelation` every adapter must reach a relation view through, which is what ' +
                'makes it a bound on the same act.'
        ),
        A2: met(
            'the mark half ceasing to alternate between two disjoint sets. A repeat would then ' +
                'deliver lines the consumer already shows and the bound would be measured on the ' +
                'cheaper path.'
        ),
        A3: notMet(
            'there is no store, no second population and no pair table. The reference model still ' +
                'checks WHICH LINES were rendered, derived independently through its own owner and ' +
                'pair maps, but there is no stored state to audit and the three population audits the ' +
                'relation scripts run have no subject here.'
        ),
        A4: met(
            'the line-count check running only in the verify pass. Both relation tables divide by ' +
                'this number, so the process that produced it is the process that has to have proved ' +
                'it.'
        ),
        B1: met(
            'THE JOIN ENTERING THIS FLOOR. Two map reads per line are the STORE\'S own work and the ' +
                'thing those rows price; a floor that performed the join would subtract the ' +
                'measurement from itself.'
        ),
        B2: met(
            'this being read as the hand-written anchor. It delivers from arrays of strings and ' +
                'holds no relationship at all; the anchor has its own row in both tables this scales.'
        ),
        B3: met(
            'a library appearing in this table. There is no adapter in this script by construction.'
        ),
        B4: met(
            'either relation row coming out BELOW this number. Every participant pays this delivery ' +
                'alike, so neither can.'
        ),
        C1: met(
            'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
                'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
        ),
        C2: met(
            'this row measured under a different sampling plan from the two relation tables it ' +
                'scales.'
        ),
        C3: met(
            'a spread above `SPREAD_CEILING` here passing quietly. A floor whose own variation is ' +
                'unreported would carry that variation into both tables of multiples.'
        ),
        C4: met(
            'this floor measured in the same process as a relation row it scales.'
        ),
        C5: notMet(
            'the resolution controls are bodies over a store and this script has none, so no control ' +
                'is measured above this table; and with one row in it there is no gap for a control ' +
                'to attest.'
        ),
    }),
    steps: RELATION_STEPS + RELATION_ROWS,
    rebuild: false,
    // Every step writes a name or a mark no neighbouring step writes, and the
    // mark half alternates between two disjoint sets — `relationWrite`'s and
    // `compositeKeyWrite`'s reasons together.
    repeatable: true,
    prepare: ctx => {
        const config = ctx.relationConfig;
        relationFloorOwned.length = 0;
        for (let t = 0; t < config.touched.length; t++) {
            const slots: number[] = [];
            for (let i = 0; i < config.ids.length; i++) {
                if (config.owners[i] === config.touched[t]) slots.push(i);
            }
            relationFloorOwned.push(slots);
        }
        relationFloorNames.length = config.ids.length;
        relationFloorMarks.length = config.ids.length;
    },
    /** Both views back to the values everything rests at. */
    restore: ctx => {
        const config = ctx.relationConfig;
        for (let t = 0; t < relationFloorOwned.length; t++) {
            const slots = relationFloorOwned[t];
            for (let i = 0; i < slots.length; i++) {
                relationFloorNames[slots[i]] = config.names[t];
            }
        }
        for (let at = 0; at < config.ids.length; at++) {
            relationFloorMarks[at] = config.seeds[at];
        }
        relationFloorTurn = 0;
    },
    run: ctx => {
        const config = ctx.relationConfig;
        for (let step = 0; step < RELATION_STEPS; step++) {
            const slots = relationFloorOwned[step % RELATION_TOUCHED];
            const name = RELATION_NAMES[step];
            for (let i = 0; i < slots.length; i++) relationFloorNames[slots[i]] = name;
            deliverRelation(ctx.consumers.a, config, relationFloorNames);
        }
        relationFloorTurn ^= 1;
        const suffix = relationFloorTurn === 1 ? '' : 'x';
        for (let at = 0; at < config.ids.length; at++) {
            relationFloorMarks[at] = `${PAIR_MARKS[at]}${suffix}`;
            deliverRelation(ctx.consumers.b, config, relationFloorMarks);
        }
    },
    check: ctx =>
        expect('joined floor distinct renders', ctx.consumers.a.distinct, RELATION_STEPS) ??
        expect('pair floor distinct renders', ctx.consumers.b.distinct, RELATION_ROWS) ??
        expect('lines per delivery', ctx.consumers.b.rowCount(), RELATION_ROWS),
    /**
     * The model builds the second population and the pair records itself — a
     * storeless script is not pre-loaded — and then replays both halves through
     * `emitRelation`, the same body both relation scripts are checked against.
     *
     * IT EMITS BOTH VIEWS EVERY STEP where this script emits one, which is not a
     * disagreement for `cellFloor.oracle`'s reason: the view handed the text it
     * already shows folds nothing into its digest.
     */
    oracle: (ctx, model) => {
        const config = ctx.relationConfig;
        model.loadOwners(ctx.owners);
        model.seedPairs(config);
        model.emitRelation(config);
        model.settled();
        for (let step = 0; step < RELATION_STEPS; step++) {
            model.setOwnerName(
                config.touched[step % RELATION_TOUCHED],
                RELATION_NAMES[step]
            );
            model.emitRelation(config);
        }
        const suffix = relationFloorTurn === 1 ? '' : 'x';
        for (let at = 0; at < config.ids.length; at++) {
            model.putPair(
                config.owners[at],
                config.ids[at],
                `${PAIR_MARKS[at]}${suffix}`
            );
            model.emitRelation(config);
        }
    },
};

const singleOf = (ctx: TScenarioContext): TSingleBinding => {
    if (ctx.single === undefined) {
        throw new Error(
            'a single-value script was run against a binding that was not built by ' +
                '`adapter.single.build`. The scenario must set `single: true` so the worker picks ' +
                'the sixth builder.'
        );
    }
    return ctx.single;
};

const SINGLE_MARKS: readonly string[] = Array.from(
    { length: SINGLE_STEPS },
    (_, k) => `v${'x'.repeat(k)}`
);

const singleFloor: TScenario = {
    key: 'singleFloor',
    label: 'single-value lower bound',
    description:
        `Lower bound, no library: ${SINGLE_STEPS} renders of one line, each with a different value, ` +
        'with no store. Every single-value scenario renders through the same code, so the gap ' +
        "between a library and this bound is the library's own cost.",
    standing: signedFor(['singleFloor'], {
        A1: met(
            'a step delivering no line, or a line equal to the one before it. Every step carries a ' +
                'value no neighbouring step carries, so every delivery folds a distinct state.'
        ),
        A2: met(
            '`redundant` folded into `deliveries`. This script asserts one distinct render per step, ' +
                'so a redundant delivery counted as distinct would lower the bound below the act.'
        ),
        A3: notMet(
            'there is no store and no value held. The reference model still states which line each ' +
                'step renders, out of its own map of the two values, but there is no stored state ' +
                'for `firstSingleMismatch` to read back here at all.'
        ),
        A4: met(
            'the line-count check running only in the verify pass. Both single-value tables divide ' +
                'by this number, so the process that produced it is the process that has to have ' +
                'proved it.'
        ),
        B1: met(
            'this floor delivering a different line from a single step — another rank, another ' +
                'address, more than one row. It formats `name 0 value` as every adapter does.'
        ),
        B2: met(
            'this being read as the hand-written anchor. It holds no value at all; the anchor keeps ' +
                'two values, two callbacks and a dirty flag, and has its own row in both tables.'
        ),
        B3: met(
            'a library appearing in this table. There is no adapter in this script by construction.'
        ),
        B4: met(
            'a single-value row coming out BELOW this number. Every participant pays this delivery ' +
                'on every step that renders, so none can.'
        ),
        C1: met(
            'the load banner printed only when the gate is exceeded, or the busy judgement made ' +
                'against a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
        ),
        C2: met(
            'this row measured under a different sampling plan from the single-value tables it ' +
                'scales.'
        ),
        C3: met(
            'a spread above `SPREAD_CEILING` here passing quietly. One formatted line is the ' +
                'cheapest step in the report, so this is where the clock\'s own resolution shows first.'
        ),
        C4: met(
            'this floor measured in the same process as a single-value row it scales.'
        ),
        C5: notMet(
            'the resolution controls are bodies over a store and this script has none, so no control ' +
                'is measured above this table; and with one row in it there is no gap for a control ' +
                'to attest.'
        ),
    }),
    steps: SINGLE_STEPS,
    rebuild: false,
    repeatable: true,
    prepare: () => undefined,
    restore: () => undefined,
    run: ctx => {
        const name = ctx.singleConfig.name;
        const consumer = ctx.consumers.a;
        for (let step = 0; step < SINGLE_STEPS; step++) {
            deliverSingle(consumer, name, SINGLE_MARKS[step]);
        }
    },
    check: ctx =>
        expect('single floor distinct renders', ctx.consumers.a.distinct, SINGLE_STEPS) ??
        expect('lines per delivery', ctx.consumers.a.rowCount(), 1) ??
        expect('view B deliveries', ctx.consumers.b.deliveries, 0),
    oracle: (ctx, model) => {
        const config = ctx.singleConfig;
        model.seedSingles(config);
        model.emitSingles(config);
        model.settled();
        for (let step = 0; step < SINGLE_STEPS; step++) {
            model.setSingle(config.name, SINGLE_MARKS[step]);
            model.emitSingles(config);
        }
    },
};

const SINGLE_SCRIPT: TStandardStanding = signedFor(['singleWrite'], {
    A1: met(
        'a step ending without a settle, so that no subscriber could be reached inside the clock. ' +
            'Each step is one write and one settle, and the delivery counters printed beside the ' +
            'row say whether the consumer was reached.'
    ),
    A2: met(
        '`redundant` folded into `deliveries`. On "re-write one value" the redundant count IS the ' +
            'answer: a library that compares delivers nothing and one that does not delivers the ' +
            'same line every step.'
    ),
    A3: met(
        '`firstSingleMismatch` leaving `auditStore`. The two values are the whole stored state of ' +
            'this family, and reading both back through the library is what catches a write that ' +
            'landed in the bystander.'
    ),
    A4: met(
        'the single-value audit running in a different process from the number. A store that dropped ' +
            'every write and one that correctly woke nobody leave identical counters behind.'
    ),
    B1: met(
        'one participant resolving the value\'s address inside the clock while another resolved it ' +
            'in `holdSingle`. The address is resolved once before the clock, for every row alike.'
    ),
    B2: met(
        'the anchor keeping a map or a key for two values. The task has neither, and an anchor ' +
            'paying for an address the scripts never use would flatter every row above it.'
    ),
    B3: met(
        'an adapter comparing the written value against the stored one before calling the library. ' +
            'A value check here has to come from the library, which is what "re-write one value" asks.'
    ),
    B4: met(
        '`floorKeyFor` handing these tables `consumerFloor`, a window of lines where a step here ' +
            'delivers one; "write one value" is scaled by `singleFloor` and "re-write one value", ' +
            'whose correct answer delivers nothing, by no floor.'
    ),
    C1: met(
        'the load banner printed only when the gate is exceeded, or the busy judgement made against ' +
            'a raised gate rather than against `DEFAULT_MAX_FOREIGN_LOAD`.'
    ),
    C2: met(
        'a sampling plan derived per adapter rather than from the slowest participant of the ' +
            'scenario, or one cell of a minimum column carrying a mean.'
    ),
    C3: met(
        'a row whose spread is above `SPREAD_CEILING` being given a rank. A single step is among the ' +
            'cheapest operations here, so the fast rows get the shortest samples in the report.'
    ),
    C4: met(
        'the two arms of a pair measured in one process. One call site taught both shapes prices the ' +
            'second arm through a polymorphic site neither arm has in production.'
    ),
    C5: met(
        'the doubled-dispatch and doubled-write arms failing to clear these tables\' drift. A step ' +
            'is a write, a dispatch and one line, so neither arm hides under a derivation here.'
    ),
});

const SILENT_SINGLE_SCRIPT: TStandardStanding = signedFor(['singleResend'], {
    ...SINGLE_SCRIPT,
    A1: notMet(
        'a store that compares before it notifies correctly renders NOTHING here: every step writes ' +
            'the value already held, and `check` demands zero distinct renders. The wake count each ' +
            'row prints is the result, not a consumer at the end of the timed operation.'
    ),
});

const singleWrite: TScenario = {
    key: 'singleWrite',
    label: 'write one value',
    description:
        `${SINGLE_STEPS} steps. Each sets a new value on one standalone value: no key, no collection, ` +
        'no list. View A shows it and must update every step. A second value beside it never changes ' +
        'and must not update; how often its view was woken anyway is counted.',
    standing: SINGLE_SCRIPT,
    steps: SINGLE_STEPS,
    single: true,
    rebuild: false,
    repeatable: true,
    prepare: ctx => {
        singleOf(ctx).holdSingle(ctx.singleConfig);
    },
    restore: ctx => {
        singleOf(ctx).writeSingle(ctx.singleConfig.seeds[0]);
        ctx.binding.settle();
    },
    run: ctx => {
        const single = singleOf(ctx);
        for (let step = 0; step < SINGLE_STEPS; step++) {
            single.writeSingle(SINGLE_MARKS[step]);
            ctx.binding.settle();
        }
    },
    check: ctx =>
        expect('view A distinct renders', ctx.consumers.a.distinct, SINGLE_STEPS) ??
        expect('view A lines', ctx.consumers.a.rowCount(), 1) ??
        expect('bystander distinct renders', ctx.consumers.b.distinct, 0),
    oracle: (ctx, model) => {
        const config = ctx.singleConfig;
        model.seedSingles(config);
        model.emitSingles(config);
        model.settled();
        for (let step = 0; step < SINGLE_STEPS; step++) {
            model.setSingle(config.name, SINGLE_MARKS[step]);
            model.emitSingles(config);
        }
    },
};

const singleResend: TScenario = {
    key: 'singleResend',
    label: 're-write one value',
    description:
        `${SINGLE_STEPS} steps. Each sets one standalone value to the value it already has. The ` +
        'benchmark code does not filter this out, so it shows whether the library compares before it ' +
        'notifies: if it does, nothing renders; if not, the same line renders every step.',
    standing: SILENT_SINGLE_SCRIPT,
    steps: SINGLE_STEPS,
    single: true,
    rebuild: false,
    rendersNothing: true,
    repeatable: true,
    prepare: ctx => {
        singleOf(ctx).holdSingle(ctx.singleConfig);
    },
    restore: () => undefined,
    run: ctx => {
        const single = singleOf(ctx);
        const held = ctx.singleConfig.seeds[0];
        for (let step = 0; step < SINGLE_STEPS; step++) {
            single.writeSingle(held);
            ctx.binding.settle();
        }
    },
    check: ctx =>
        expect('view A distinct renders', ctx.consumers.a.distinct, 0) ??
        expect('bystander distinct renders', ctx.consumers.b.distinct, 0),
    oracle: (ctx, model) => {
        const config = ctx.singleConfig;
        model.seedSingles(config);
        model.emitSingles(config);
        model.settled();
        for (let step = 0; step < SINGLE_STEPS; step++) {
            model.setSingle(config.name, config.seeds[0]);
            model.emitSingles(config);
        }
    },
};

/**
 * REPORT ORDER, chosen so that every row a reader is meant to read AGAINST
 * another one sits beside it.
 */
export const SCENARIOS: readonly TScenario[] = [
    // THE LIFECYCLE, FIRST AND TOGETHER: an empty store loaded, the same act
    // against a full one, the same with the construction inside the clock, and
    // the other end of the same life.
    batchInsert,
    insertIntoPopulated,
    growUnderSubscription,
    coldStart,
    tearDown,
    // THE FLOOR UNDER THE ROW ABOVE, beside it: the teardown table is scaled by
    // this and by nothing else, and a floor printed pages from the table it
    // scales is a floor a reader meets twice and connects never.
    tearDownFloor,
    patchColumn,
    patchOutsideWindow,
    patchNote,
    batchPatch,
    batchPatchNote,
    patchMostRows,
    mixedFrame,
    moveGroup,
    moveAndReorder,
    sortKeyMove,
    resortWindow,
    consumerPerGroup,
    cellDelivery,
    // The floor the row above is scaled by, beside it — `tearDownFloor`'s reason.
    cellFloor,
    deleteRows,
    deleteOneRow,
    drainGroup,
    resendUnchanged,
    consumerFloor,
    // THE CHURN FAMILY, together, because every one is read against another of
    // them: the floor against the shared-root pair, the two sizes against each
    // other, the two orders against each other, and the column and chain rows
    // against the row-shaped subscription at the same count. The mount lower
    // bound OPENS the family: all nine tables are scaled by it, and a reader
    // meets what a mount cannot cost before reading what one did.
    mountFloor,
    churnOne,
    churnShared,
    churnSharedReversed,
    churnSharedDeep,
    churnSharedDeepReversed,
    churnWide,
    churnColumn,
    churnList,
    churnChain,
    chainFrameWrite,
    churnDiamond,
    diamondFrameWrite,
    churnResident,
    appFill,
    appRound,
    appSettingMove,
    // THE READ FAMILY, together, for the churn family's reason: all three are
    // driven by `adapter.reads`, each from its own declaration, so a library can
    // decline the shape it cannot answer and keep the two it can.
    readByKey,
    scrollWindow,
    deepScroll,
    viewSwitch,
    filterTwoAxes,
    // THE RELATION FAMILY, together, for the read family's reason — both are
    // driven by `adapter.relations.build` — and one of its own: they are the only
    // two rows over TWO ENTITY TYPES, and the second exists only because the
    // first brings the second collection its key's segments come from.
    relationFloor,
    relationWrite,
    compositeKeyWrite,
    singleFloor,
    singleWrite,
    singleResend,
];

/**
 * EVERY STANDING IS SIGNED FOR THIS SCRIPT, EVERY MET NAMES WHAT WOULD MAKE IT
 * WRONG, EVERY NOT MET NAMES WHAT IS MISSING, AND A3, B3 AND C5 AGREE WITH THE
 * WIRING — checked at module load, in every process, before anything is measured.
 *
 * The type forces all thirteen items to be present. What it cannot force is that
 * somebody meant them for THIS script, that an assurance is falsifiable, or that
 * either survived a change made somewhere else — a control that stopped supplying
 * a wiring, a declaration that was split, a script that stopped keeping a
 * grouping. Those are throws, and they are the difference between a record and a
 * paragraph.
 */
for (const scenario of SCENARIOS) {
    assertStandingSigned(scenario, SCENARIOS);
}

export const scenarioByKey = (key: string): TScenario => {
    const found = SCENARIOS.find(scenario => scenario.key === key);
    if (found === undefined) throw new Error(`Unknown scenario: ${key}`);
    return found;
};

/** Keys in report order. */
export const SCENARIO_KEYS: readonly TScenarioKey[] = SCENARIOS.map(s => s.key);

/**
 * What stands in the worker's scenario slot when there is no scenario. The memory
 * mode runs no script — it loads the population and reports what the store holds
 * — and passing a scenario key anyway would say the figure belongs to that row of
 * the report, so the mode takes this instead and refuses anything else.
 */
export const NO_SCENARIO = '-';

/**
 * A FLOOR NEEDS NO ADAPTER: the harness drives the consumer itself. Each is
 * measured once, in the process of a NAMED adapter (`FLOOR_ADAPTER`) rather than
 * whichever is first in the registry, because that adapter's storage shape is what
 * the bound is a bound for.
 *
 * FIVE OF THEM SINCE 2026-08-30, one per family — the list and the table-to-floor
 * mapping are in `harness/floor.ts`, which is where everything that reads them
 * lives. This predicate is defined over that list rather than repeating it, so a
 * sixth floor is one edit.
 */
export const isStoreless = (scenario: TScenario): boolean =>
    FLOOR_SCENARIO_KEYS.includes(scenario.key);

export type { BenchConsumer };
export type { TScenarioContext };
