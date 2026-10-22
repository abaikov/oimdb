import {
    deliver,
    deliverCells,
    deliverChurn,
    deliverPage,
    deliverRelation,
    deliverSingle,
    orderedIdsOfGroup,
    visibleInto,
    visibleOnAxisInto,
} from './render';
import type { BenchConsumer, TConsumers, TViewBinding } from './consumer';
import type { TOwner, TPairRow, TPlan, TRow } from './dataset';
import { chainLevelOf, diamondJoinOf, diamondLeftOf, diamondRightOf } from './derivations';
import { churnShapes, noChurn, noReads, noRowStore, readShapes } from './types';
import type {
    TAdapter,
    TBinding,
    TCellConfig,
    TChurnBinding,
    TReadBinding,
    TRelationBinding,
    TRelationConfig,
    TScenario,
    TSingleBinding,
    TViewConfig,
} from './types';

/**
 * THE RESOLUTION CONTROL: two DIFFERENT bodies of code, of deliberately
 * different cost, measured under the scenario's own sampling plan.
 *
 * THE SECOND DELIVERY CARRIES IDENTICAL TEXT, which keeps this a control rather
 * than a different script: the consumer counts it redundant, so the heavy arm
 * arrives at the same digest and DISTINCT count as every other adapter, passes every
 * scenario's check, and differs only in time.
 *
 * TWO PAIRS, BECAUSE ONE ATTESTS ONE AXIS:
 *
 *   lean vs heavy  — a doubled DERIVATION. Coarse; says the instrument works, but
 *                    far larger than the few percent the tables ask a reader to
 *                    read (the standard's C5: proving the harness can see 100%
 *                    proves nothing about 4%), and on an axis most rows do not vary
 *                    along.
 *   lean vs write  — a doubled WRITE PATH, `control-write` sharing `control-lean`
 *                    as its baseline. Small BECAUSE the write path is a minority of
 *                    these scripts' time, so it lands at the scale of the tables'
 *                    own gaps and on the axis they vary along.
 *
 * NEITHER GAP IS A PREDICTION. The harness knows what was DOUBLED, not what
 * percentage it comes out at; the percentage is measured and printed per table
 * beside that table's drift, and the runner FAILS LOUDLY when either gap is not
 * bigger than that drift.
 */
const controlBinding = (
    views: readonly TViewBinding[],
    view: TViewConfig,
    passes: number,
    /**
     * How many times each store mutation is performed. The second and later
     * passes write the value the first one wrote, so nothing about the state,
     * the delivery count or any digest changes — only the time.
     */
    writes: number
): TBinding => {
    const byId = new Map<string, TRow>();
    // One buffer per view, reused: the control must not carry an allocation the
    // rows beside it do not. Two views under the ordinary wiring and fifty under
    // the per-group one — a control deriving two windows above a table of
    // fifty-window rows would attest a different measurement.
    const windows = views.map(bound => ({
        group: bound.group,
        consumer: bound.consumer,
        visible: [] as TRow[],
    }));
    let dirty = false;

    /**
     * THE PINNED ROWS — the Map's own values, which for this control IS what a key
     * resolves to. Empty until `pin`, and `renderCells` is unreachable until then.
     */
    const pinned: TRow[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };
    /** One text buffer per cell view, reused: a render must allocate nothing. */
    const labelText: string[] = [];
    const noteText: string[] = [];

    const renderWindows = (): void => {
        for (let i = 0; i < windows.length; i++) {
            const state = windows[i];
            deliver(
                state.consumer,
                visibleInto(
                    state.visible,
                    byId.values(),
                    state.group,
                    view.window
                ),
                view.window
            );
        }
    };

    /**
     * BOTH CELL VIEWS, EVERY TIME — which is this control's answer and the
     * store-granular band's.
     *
     * There is no signal here narrower than "something was written", so a write to
     * one column re-reads both columns of every pinned row and delivers both views;
     * one carries the text it already had and is counted redundant, which is the
     * cost the row exists to show.
     *
     * THE TWO CONSUMERS ARE THE FIRST TWO VIEWS'. The cell script is only ever
     * driven through `bind`, where `views` is exactly `[A over groupA, B over
     * groupB]`, and a per-group binding never reaches `pin` at all.
     */
    const renderCells = (): void => {
        for (let i = 0; i < pinned.length; i++) {
            labelText[i] = pinned[i].label;
            noteText[i] = pinned[i].note;
        }
        deliverCells(windows[0].consumer, cells, labelText);
        deliverCells(windows[1].consumer, cells, noteText);
    };

    /** What a dirty settle delivers. Re-pointed once, by `pin`. */
    let render = renderWindows;

    return {
        // Every write method below performs its store work `writes` times, and the
        // repeat is a `for` in the body rather than a wrapper around the call:
        // wrapping would put an indirect call in front of the lean arm too and
        // change the thing being controlled.
        write: rows => {
            for (let pass = 0; pass < writes; pass++) {
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const held = byId.get(row.id);
                    if (held === undefined) byId.set(row.id, { ...row });
                    else {
                        held.group = row.group;
                        held.rank = row.rank;
                        held.label = row.label;
                        held.note = row.note;
                    }
                }
            }
            dirty = true;
        },
        // The second delete of a key already gone is a Map probe that finds
        // nothing — the same operation the write path performs, which is what makes
        // this arm's extra pass real work rather than a branch.
        remove: ids => {
            for (let pass = 0; pass < writes; pass++) {
                for (let i = 0; i < ids.length; i++) byId.delete(ids[i]);
            }
            dirty = true;
        },
        patchLabel: (id, label) => {
            for (let pass = 0; pass < writes; pass++) {
                const row = byId.get(id);
                if (row !== undefined) row.label = label;
            }
            dirty = true;
        },
        patchNote: (id, note) => {
            for (let pass = 0; pass < writes; pass++) {
                const row = byId.get(id);
                if (row !== undefined) row.note = note;
            }
            dirty = true;
        },
        setGroup: (id, group) => {
            for (let pass = 0; pass < writes; pass++) {
                const row = byId.get(id);
                if (row !== undefined) row.group = group;
            }
            dirty = true;
        },
        setRank: (id, rank) => {
            for (let pass = 0; pass < writes; pass++) {
                const row = byId.get(id);
                if (row !== undefined) row.rank = rank;
            }
            dirty = true;
        },
        /**
         * The Map's own values, kept — for this control that IS the resolution.
         *
         * The window buffers are emptied with the wiring they belonged to: after
         * this the control has no window view, so keeping their contents alive
         * would be a heap a later sample's memory cannot explain.
         */
        pin: config => {
            cells = config;
            pinned.length = 0;
            for (let i = 0; i < config.ids.length; i++) {
                const row = byId.get(config.ids[i]);
                if (row !== undefined) pinned.push(row);
            }
            labelText.length = pinned.length;
            noteText.length = pinned.length;
            for (const state of windows) state.visible.length = 0;
            render = renderCells;
            // Untimed: the state every sample starts from.
            renderCells();
        },
        // The position IS the resolution — no `byId.get`, which is the whole
        // difference from `patchLabel` above. `dirty` is set as it is there,
        // because this control has no finer signal.
        patchPinnedLabel: (at, label) => {
            for (let pass = 0; pass < writes; pass++) pinned[at].label = label;
            dirty = true;
        },
        patchPinnedNote: (at, note) => {
            for (let pass = 0; pass < writes; pass++) pinned[at].note = note;
            dirty = true;
        },
        frame: run => {
            run();
        },
        settle: () => {
            if (!dirty) return;
            dirty = false;
            // The whole derivation, `passes` times. The extra pass produces the
            // same text, so it is a redundant delivery and not a second state.
            for (let pass = 0; pass < passes; pass++) render();
        },
        /**
         * THE POPULATION, out of the Map that is this control's whole store. The
         * pair is held to the same audit as every real row on purpose: the rows
         * proving the harness can tell two bodies of code apart must not be the
         * rows exempt from the check that they hold the right data.
         */
        readAll: () => Array.from(byId.values()),
        deliverableRows: () => undefined,
        /**
         * NO GROUPING TO BE WRONG ABOUT — a settle walks the Map, so the answer
         * comes from the same rows `readAll` returns and the grouping audit is
         * implied by the column audit here.
         *
         * ANSWERED RATHER THAN DECLINED: `undefined` means "this wiring keeps no
         * grouping AT ALL" and is the churn binding's answer; a control returning
         * it would be claiming it has no views.
         */
        groupOrder: group => orderedIdsOfGroup(byId.values(), group),
        /**
         * THE SCREEN GOES AWAY — and `windows.length = 0` is what makes that true
         * rather than merely tidy.
         *
         * `tear the screen down` times this call and then writes a page into the
         * torn-down binding demanding NO DELIVERY, so a control that kept its view
         * list would derive, render, and be reported as a teardown that tore
         * nothing down. Clearing the Map alone was enough only while `dispose` was
         * called immediately before a fresh binding built its own `windows`.
         */
        dispose: () => {
            byId.clear();
            for (const state of windows) state.visible.length = 0;
            windows.length = 0;
            pinned.length = 0;
            labelText.length = 0;
            noteText.length = 0;
        },
    };
};

/** The two named views, as every script but the per-group one is wired. */
const twoViews = (
    consumers: { a: TViewBinding['consumer']; b: TViewBinding['consumer'] },
    view: TViewConfig
): readonly TViewBinding[] => [
    { group: view.groupA, consumer: consumers.a },
    { group: view.groupB, consumer: consumers.b },
];

/* ── the three other wirings, and the axis each of their tables is along ─── */

/**
 * WHAT THE CONTROL DOUBLES IS NOT THE SAME QUANTITY IN EVERY TABLE, and pretending
 * it is would put a true sentence above one table and a false one above another.
 *
 * A CONTROL IS ONLY WORTH ANYTHING ON THE AXIS ITS TABLE VARIES ALONG. The write
 * tables are attested on a doubled derivation and a doubled write path, because
 * that is what those scripts do. A CHURN table is not: a churn frame performs ONE
 * store mutation against N mounts and a one-line delivery, so doubling the
 * derivation or the write would put a difference the harness cannot resolve above a
 * table whose whole subject is the MOUNT. So the churn arm doubles the mount path,
 * the read arm doubles the answer's derivation, and the relation arm doubles the
 * RENDER — both views computed and delivered twice.
 *
 * THE RELATION ARM DOUBLED THE JOIN UNTIL 2026-09-03, when the hand-written floor
 * stopped performing the join per rendered line: it resolves the owner and the pair
 * record in `holdRelation` and reads a field per line. A join that is one array read
 * is not a quantity a table can be attested on, so the arm doubles the frame it sits
 * in instead. The full account is on `controlRelationBinding`.
 *
 * ─── AND TWO WIRINGS GET ONE ARM AND NOT TWO, WHICH IS A FINDING ──────────
 *
 * `control-write` exists because `control-heavy`'s doubled derivation is about a
 * hundred percent apart — far above the gaps these tables ask a reader to read —
 * and the write path is a MINORITY OF THE SCRIPTS' TIME, which is what puts it at
 * the right scale. Neither the churn nor the read wiring has such a minority:
 *
 *  - A CHURN FRAME performs exactly one store mutation, against `CHURN_SUBSCRIBERS`
 *    mounts and unmounts. Doubling it is a difference below the drift, and an arm
 *    whose gap cannot clear the drift attests nothing while failing the run.
 *  - FOUR OF THE FIVE READ SCRIPTS WRITE NOTHING AT ALL — only `filterTwoAxes`
 *    performs a store mutation — so the arm's gap above the other four is
 *    exactly zero.
 *
 * Rather than invent a quantity to double, both wirings declare the absence in
 * writing and the scenarios declare C5 NOT MET with that as the reason — one arm,
 * on the right axis, at roughly a doubling, and no second arm at the scale of the
 * tables' own gaps. The relation wiring HAS the minority — both its scripts write
 * every step — so it carries both arms, as the write tables do.
 */
export type TControlAxes = {
    /** What `control-heavy` doubles here. One short phrase, printed above the table. */
    heavy: string;
    /** What `control-write` doubles here. Empty exactly when `writeAbsent` is set. */
    write: string;
    /** Why `control-write` does not stand above this table. Empty when it does. */
    writeAbsent: string;
};

export const controlAxisFor = (scenario: TScenario): TControlAxes =>
    scenario.churn !== undefined
        ? {
              heavy: 'a doubled mount path',
              write: '',
              writeAbsent:
                  'a churn frame performs ONE store mutation against every mount and unmount in the ' +
                  'cycle, so a doubled write path is a difference smaller than this table\'s drift. ' +
                  'The mount arm above is the axis these rows are along; there is no second arm at ' +
                  "the scale of this table's own gaps.",
          }
        : scenario.read !== undefined
          ? {
                heavy: 'a doubled read',
                write: '',
                writeAbsent:
                    'four of the five read scripts perform NO STORE MUTATION AT ALL — a page pulled ' +
                    'by key, a window offset moved near the head or deep in the group, and a view ' +
                    'switched to another group write nothing — so a doubled write path is a gap of ' +
                    'exactly zero above four of these five tables. The read arm above is the axis ' +
                    'they are along; there is no second arm at the scale of their own gaps.',
            }
          : scenario.relation === true
            ? {
                  heavy: 'a doubled render',
                  write: 'a doubled write path',
                  writeAbsent: '',
              }
            : scenario.single === true
              ? {
                    /**
                     * A DOUBLED DISPATCH AND NOT A DOUBLED DERIVATION, because a
                     * single view has no derivation worth the name: it reads one
                     * value and formats one line, so doubling it would put a
                     * difference of one map read above a table and call it a
                     * resolution. What a single step DOES have is a dispatch — the
                     * subscriber bodies the write wakes — and the heavy arm runs
                     * that twice and delivers once.
                     *
                     * BOTH ARMS STAND HERE, and this is the family where the write
                     * arm is at its strongest: a step is a write, a dispatch and a
                     * one-line delivery, so the write path is not a minority of the
                     * time the way it is in the tables that derive a window.
                     */
                    heavy: 'a doubled dispatch',
                    write: 'a doubled write path',
                    writeAbsent: '',
                }
              : {
                    heavy: 'a doubled derivation',
                    write: 'a doubled write path',
                    writeAbsent: '',
                };

/** One subscriber's body: it counts itself and reads what it was mounted on. */
type TControlSub = () => void;

/**
 * THE CONTROL'S SUBSCRIPTION WIRING — `baseline-array`'s hand-written churn store
 * with ONE knob on the mount path and one on the write path.
 *
 * `mounts` IS THE ARM. The first pass joins the lists a settle walks; every later
 * pass joins a SHADOW of those lists with THE SAME BODY, and nothing walks a shadow.
 * So the extra work is the identical map probe, array push and, on the way out, the
 * identical `indexOf` plus `splice` — and `woke`, the delivered line, the delivery
 * count and every digest are bit-for-bit what the lean arm produces. That is what
 * keeps this a control rather than a different script: it passes each churn
 * scenario's own `check` unchanged and differs only in time.
 *
 * `writes` DOUBLES THE STORE MUTATION AND NOT THE DISPATCH. `touched` is pushed
 * ONCE however many passes a write makes: pushing it twice would walk every
 * subscriber list twice, every body would run twice, and the delivery would say
 * `2N` where the reference model says `N`. The arm would then be failing the
 * scenario rather than attesting it.
 */
const controlChurnBinding = (
    churnConsumer: BenchConsumer,
    mounts: number,
    writes: number
): TChurnBinding => {
    const byId = new Map<string, TRow>();
    /** Row id -> the subscribers a settle walks. The whole live mechanism. */
    const rowSubs = new Map<string, TControlSub[]>();
    /** `id|column` -> the same, for a subscription addressed at one column. */
    const columnSubs = new Map<string, TControlSub[]>();
    /** The shadows the extra mount passes join. NOTHING EVER WALKS THESE. */
    const shadowRowSubs = new Map<string, TControlSub[]>();
    const shadowColumnSubs = new Map<string, TControlSub[]>();
    /** Rows written since the last settle, in write order. */
    const touched: string[] = [];

    let churnIds: readonly string[] = [];
    let churnId = '';
    let churnRank = 0;
    /** What each subscriber last read. */
    const churnRead: (string | undefined)[] = [];
    const bodies: (TControlSub | undefined)[] = [];
    const joined: (TControlSub[][] | undefined)[] = [];
    const shadowed: (TControlSub[][] | undefined)[] = [];
    let churnWoke = 0;

    const listOf = (
        lists: Map<string, TControlSub[]>,
        key: string
    ): TControlSub[] => {
        let held = lists.get(key);
        if (held === undefined) {
            held = [];
            lists.set(key, held);
        }
        return held;
    };

    /** Join one pass's lists and remember them, so an unmount can leave them. */
    const join = (
        at: number,
        body: TControlSub,
        lists: TControlSub[][],
        live: boolean
    ): void => {
        for (let i = 0; i < lists.length; i++) lists[i].push(body);
        if (live) {
            bodies[at] = body;
            joined[at] = lists;
            return;
        }
        shadowed[at] = lists;
    };

    /** One subscriber's body: count itself, and read its first source. */
    const readInto = (at: number, first: TRow | undefined): void => {
        churnRead[at] = first === undefined ? '' : first.label;
    };

    const readerOf = (at: number, first: TRow | undefined): TControlSub => () => {
        churnWoke++;
        readInto(at, first);
    };

    const leave = (lists: TControlSub[][] | undefined, body: TControlSub): void => {
        if (lists === undefined) return;
        for (let i = 0; i < lists.length; i++) {
            const held = lists[i];
            const found = held.indexOf(body);
            if (found >= 0) held.splice(found, 1);
        }
    };

    return {
        write: rows => {
            for (let pass = 0; pass < writes; pass++) {
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const held = byId.get(row.id);
                    if (held === undefined) byId.set(row.id, { ...row });
                    else {
                        held.group = row.group;
                        held.rank = row.rank;
                        held.label = row.label;
                        held.note = row.note;
                    }
                }
            }
            // ONCE, whatever the arm — see the header on the dispatch.
            for (let i = 0; i < rows.length; i++) touched.push(rows[i].id);
        },
        remove: ids => {
            for (let pass = 0; pass < writes; pass++) {
                for (let i = 0; i < ids.length; i++) byId.delete(ids[i]);
            }
            for (let i = 0; i < ids.length; i++) touched.push(ids[i]);
        },
        patchLabel: (id, label) => {
            for (let pass = 0; pass < writes; pass++) {
                const row = byId.get(id);
                if (row !== undefined) row.label = label;
            }
            touched.push(id);
        },
        patchNote: (id, note) => {
            for (let pass = 0; pass < writes; pass++) {
                const row = byId.get(id);
                if (row !== undefined) row.note = note;
            }
            touched.push(id);
        },
        setGroup: (id, group) => {
            for (let pass = 0; pass < writes; pass++) {
                const row = byId.get(id);
                if (row !== undefined) row.group = group;
            }
            touched.push(id);
        },
        setRank: (id, rank) => {
            for (let pass = 0; pass < writes; pass++) {
                const row = byId.get(id);
                if (row !== undefined) row.rank = rank;
            }
            touched.push(id);
        },
        // A churn binding derives no view and no churn script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        /**
         * THE DISPATCH. Every row written since the last settle has its subscriber
         * list walked and its `label` column's list too; ONE delivery if anything
         * woke, NONE if nothing did. The shadows are not walked, which is the whole
         * of what makes the heavy arm a control.
         */
        frame: run => {
            run();
        },
        settle: () => {
            for (let i = 0; i < touched.length; i++) {
                const id = touched[i];
                const watchers = rowSubs.get(id);
                if (watchers !== undefined) {
                    for (let w = 0; w < watchers.length; w++) watchers[w]();
                }
                const column = columnSubs.get(`${id}|label`);
                if (column !== undefined) {
                    for (let w = 0; w < column.length; w++) column[w]();
                }
            }
            touched.length = 0;
            if (churnWoke === 0) return;
            deliverChurn(churnConsumer, churnId, churnRank, churnWoke, churnRead);
            churnWoke = 0;
        },
        readAll: () => Array.from(byId.values()),
        deliverableRows: () => undefined,
        /** NOTHING TO READ — a churn binding derives no view. See `TBinding`. */
        groupOrder: () => undefined,
        holdChurnRows: (ids, ranks) => {
            churnIds = ids;
            churnId = ids[0];
            churnRank = ranks[0];
            for (let at = 0; at < ids.length; at++) churnRead[at] = undefined;
        },
        mountOnRows: (at, from, count) => {
            const first = byId.get(churnIds[from]);
            const body = readerOf(at, first);
            for (let pass = 0; pass < mounts; pass++) {
                const live = pass === 0;
                const lists: TControlSub[][] = new Array(count);
                for (let i = 0; i < count; i++) {
                    lists[i] = listOf(
                        live ? rowSubs : shadowRowSubs,
                        churnIds[from + i]
                    );
                }
                join(at, body, lists, live);
            }
            readInto(at, first);
        },
        mountOnColumn: at => {
            const id = churnIds[0];
            const first = byId.get(id);
            const body = readerOf(at, first);
            for (let pass = 0; pass < mounts; pass++) {
                const live = pass === 0;
                join(
                    at,
                    body,
                    [listOf(live ? columnSubs : shadowColumnSubs, `${id}|label`)],
                    live
                );
            }
            readInto(at, first);
        },
        mountOnChain: (at, from, count, depth) => {
            const watched: (TRow | undefined)[] = new Array(count);
            for (let i = 0; i < count; i++) {
                watched[i] = byId.get(churnIds[from + i]);
            }
            const derive = (): string => {
                let text = '';
                for (let i = watched.length - 1; i >= 0; i--) {
                    const row = watched[i];
                    if (row !== undefined) text = row.label;
                }
                for (let level = 1; level <= depth; level++) text = chainLevelOf(text, level);
                return text;
            };
            const body: TControlSub = () => {
                const text = derive();
                churnWoke++;
                churnRead[at] = text;
            };
            for (let pass = 0; pass < mounts; pass++) {
                const live = pass === 0;
                const lists: TControlSub[][] = new Array(count);
                for (let i = 0; i < count; i++) {
                    lists[i] = listOf(
                        live ? rowSubs : shadowRowSubs,
                        churnIds[from + i]
                    );
                }
                join(at, body, lists, live);
            }
            churnRead[at] = derive();
        },
        mountOnDiamond: (at, from) => {
            const id = churnIds[from];
            const root = byId.get(id);
            const derive = (): string => {
                const label = root === undefined ? '' : root.label;
                return diamondJoinOf(diamondLeftOf(label), diamondRightOf(label));
            };
            const body: TControlSub = () => {
                const text = derive();
                churnWoke++;
                churnRead[at] = text;
            };
            for (let pass = 0; pass < mounts; pass++) {
                const live = pass === 0;
                join(at, body, [listOf(live ? rowSubs : shadowRowSubs, id)], live);
            }
            churnRead[at] = derive();
        },
        unmount: at => {
            const body = bodies[at];
            if (body === undefined) return;
            leave(joined[at], body);
            leave(shadowed[at], body);
            joined[at] = undefined;
            shadowed[at] = undefined;
            bodies[at] = undefined;
            churnRead[at] = undefined;
        },
        dispose: () => {
            byId.clear();
            rowSubs.clear();
            columnSubs.clear();
            shadowRowSubs.clear();
            shadowColumnSubs.clear();
            touched.length = 0;
            joined.length = 0;
            shadowed.length = 0;
            bodies.length = 0;
            churnRead.length = 0;
        },
    };
};

/**
 * THE CONTROL'S READ WIRING — `baseline-array`'s hand-written read store with one
 * knob on the answer's derivation and one on the write path.
 *
 * `passes` IS THE ARM, AND IT DERIVES TWICE AND DELIVERS ONCE. Delivering twice —
 * which is what the heavy arm does under the ordinary wiring — would be a second
 * delivery, and `read a page by key` asserts an EXACT delivery count. So the
 * doubled quantity here is the binding's own work and excludes the consumer, which
 * is the sharper thing to double anyway.
 */
const controlReadBinding = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan,
    passes: number,
    writes: number
): TReadBinding => {
    const byId = new Map<string, TRow>();
    /** Reused buffers, so a delivery allocates nothing. */
    const paged: TRow[] = [];
    const onAxis: TRow[] = [];
    const found: TRow[] = [];
    /** Where view A's window starts. Displaced by `scrollTo` and by nothing else. */
    let offset = 0;
    let group = view.groupA;
    let dirty = false;

    const render = (): void => {
        for (let pass = 0; pass < passes; pass++) {
            visibleInto(paged, byId.values(), group, offset + view.window);
            visibleOnAxisInto(onAxis, byId.values(), view.groupA, view.window);
        }
        deliverPage(consumers.a, paged, offset, view.window);
        deliverPage(consumers.b, onAxis, 0, view.window);
    };

    return {
        write: rows => {
            for (let pass = 0; pass < writes; pass++) {
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const held = byId.get(row.id);
                    if (held === undefined) byId.set(row.id, { ...row });
                    else {
                        held.group = row.group;
                        held.rank = row.rank;
                        held.label = row.label;
                        held.note = row.note;
                    }
                }
            }
            dirty = true;
        },
        remove: ids => {
            for (let pass = 0; pass < writes; pass++) {
                for (let i = 0; i < ids.length; i++) byId.delete(ids[i]);
            }
            dirty = true;
        },
        patchLabel: (id, label) => {
            for (let pass = 0; pass < writes; pass++) {
                const row = byId.get(id);
                if (row !== undefined) row.label = label;
            }
            dirty = true;
        },
        patchNote: (id, note) => {
            for (let pass = 0; pass < writes; pass++) {
                const row = byId.get(id);
                if (row !== undefined) row.note = note;
            }
            dirty = true;
        },
        setGroup: (id, group) => {
            for (let pass = 0; pass < writes; pass++) {
                const row = byId.get(id);
                if (row !== undefined) row.group = group;
            }
            dirty = true;
        },
        setRank: (id, rank) => {
            for (let pass = 0; pass < writes; pass++) {
                const row = byId.get(id);
                if (row !== undefined) row.rank = rank;
            }
            dirty = true;
        },
        // No read script pins anything: the cell wiring belongs to a two-view
        // script built by `bind`.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        /**
         * ONE MAP PROBE PER KEY, `passes` times over, and ONE delivery. Nothing is
         * resolved in advance and nothing is remembered between pages.
         */
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            for (let pass = 0; pass < passes; pass++) {
                found.length = 0;
                for (let i = 0; i < count; i++) {
                    const row = byId.get(keys[from + i]);
                    if (row !== undefined) found.push(row);
                }
            }
            deliverPage(consumers.a, found, 0, count);
        },
        // One number and the same dirty flag every write sets. NOTHING IS
        // RE-ORDERED: `render` re-derives from the population it always re-derives
        // from.
        scrollTo: to => {
            offset = to;
            dirty = true;
        },
        switchGroup: to => {
            group = to;
            offset = 0;
            dirty = true;
        },
        frame: run => {
            run();
        },
        settle: () => {
            if (!dirty) return;
            dirty = false;
            render();
        },
        readAll: () => Array.from(byId.values()),
        deliverableRows: () => undefined,
        groupOrder: group => orderedIdsOfGroup(byId.values(), group),
        dispose: () => {
            byId.clear();
            paged.length = 0;
            onAxis.length = 0;
            found.length = 0;
        },
    };
};

/**
 * THE CONTROL'S RELATIONSHIP WIRING — `baseline-array`'s hand-written two-type
 * store with one knob on the render and one on the write path.
 *
 * `passes` DOUBLES THE WHOLE RELATION FRAME: both views computed AND delivered,
 * `passes` times over. The second pass carries identical text, so `BenchConsumer.end`
 * folds it as REDUNDANT and `distinct`, `rowCount` and the digest are the lean arm's
 * to the bit — which is exactly what both relation scripts check. Neither asserts a
 * delivery count.
 *
 * THE DOUBLING IS THE FRAME, NOT THE JOIN. The join is one array read per line,
 * doubling it alone leaves a difference nothing under `measurements/` says clears
 * these tables' drift, and an arm whose gap cannot clear the drift attests nothing
 * while failing the run. A doubled FRAME is 2x of everything the lean arm does
 * between two settles — `controlBinding`'s construction under the ordinary wiring,
 * and the coarse arm's job. `control-write` is still the fine arm here, on the axis
 * these tables' own gaps are at.
 *
 * NEITHER ARM CACHES THE COMPOSED PAIR KEY. `TRelationBinding.writePair` forbids it
 * of every participant alike, and an arm that cached it would be doubling an array
 * read under the name of a composite key. The floor composes it per call too, so
 * that half of the old body was never the defect.
 */
const controlRelationBinding = (
    consumers: TConsumers,
    passes: number,
    writes: number
): TRelationBinding => {
    const byId = new Map<string, TRow>();
    const byOwner = new Map<string, TOwner>();
    /** `owner id` + ' ' + `row id` -> the record at that pair. */
    const pairs = new Map<string, TPairRow>();
    let dirty = false;

    let config: TRelationConfig = {
        ids: [],
        ranks: [],
        owners: [],
        touched: [],
        names: [],
        seeds: [],
    };
    /** The owner each rendered line's name comes from, in `ids` order. */
    const rowOwners: (TOwner | undefined)[] = [];
    /** The pair record each rendered line's mark comes from, in `ids` order. */
    const rowPairs: TPairRow[] = [];
    const nameText: string[] = [];
    const markText: string[] = [];

    const pairKey = (owner: string, row: string): string => `${owner} ${row}`;

    /** The joined view: ONE ARRAY READ PER LINE, which is what the floor does. */
    const renderNames = (): void => {
        for (let i = 0; i < rowOwners.length; i++) {
            const owner = rowOwners[i];
            nameText[i] = owner === undefined ? '' : owner.name;
        }
        deliverRelation(consumers.a, config, nameText);
    };

    /** The pair view: the mark off the record held for that line. Ditto. */
    const renderMarks = (): void => {
        for (let i = 0; i < rowPairs.length; i++) markText[i] = rowPairs[i].mark;
        deliverRelation(consumers.b, config, markText);
    };

    /** BOTH VIEWS, COMPUTED AND DELIVERED, `passes` times — see the header. */
    const render = (): void => {
        for (let pass = 0; pass < passes; pass++) {
            renderNames();
            renderMarks();
        }
    };

    return {
        write: rows => {
            for (let pass = 0; pass < writes; pass++) {
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const held = byId.get(row.id);
                    if (held === undefined) byId.set(row.id, { ...row });
                    else {
                        held.group = row.group;
                        held.rank = row.rank;
                        held.label = row.label;
                        held.note = row.note;
                    }
                }
            }
            dirty = true;
        },
        remove: ids => {
            for (let pass = 0; pass < writes; pass++) {
                for (let i = 0; i < ids.length; i++) byId.delete(ids[i]);
            }
            dirty = true;
        },
        patchLabel: (id, label) => {
            for (let pass = 0; pass < writes; pass++) {
                const row = byId.get(id);
                if (row !== undefined) row.label = label;
            }
            dirty = true;
        },
        patchNote: (id, note) => {
            for (let pass = 0; pass < writes; pass++) {
                const row = byId.get(id);
                if (row !== undefined) row.note = note;
            }
            dirty = true;
        },
        setGroup: (id, group) => {
            for (let pass = 0; pass < writes; pass++) {
                const row = byId.get(id);
                if (row !== undefined) row.group = group;
            }
            dirty = true;
        },
        setRank: (id, rank) => {
            for (let pass = 0; pass < writes; pass++) {
                const row = byId.get(id);
                if (row !== undefined) row.rank = rank;
            }
            dirty = true;
        },
        // No relation script pins: the cell wiring belongs to `bind`.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        writeOwners: owners => {
            for (let pass = 0; pass < writes; pass++) {
                for (let i = 0; i < owners.length; i++) {
                    const owner = owners[i];
                    byOwner.set(owner.id, { id: owner.id, name: owner.name });
                }
            }
            dirty = true;
        },
        /**
         * THE OBJECTS EVERY RENDERED LINE READS, RESOLVED ONCE, and the pair records
         * created at their seeds — `bindRelationStore`'s `holdRelation`, untimed for
         * its reason.
         *
         * IT DELIVERS BOTH VIEWS ONCE WHATEVER THE ARM, as
         * `TRelationBinding.holdRelation` requires: the `passes` loop lives in
         * `settle`, exactly as `pin` above ends with one `renderCells`.
         */
        holdRelation: given => {
            config = given;
            nameText.length = given.ids.length;
            markText.length = given.ids.length;
            for (let i = 0; i < given.ids.length; i++) {
                const owner = given.owners[i];
                const row = given.ids[i];
                rowOwners.push(byOwner.get(owner));
                const created: TPairRow = {
                    owner,
                    row,
                    mark: given.seeds[i],
                };
                pairs.set(pairKey(owner, row), created);
                rowPairs.push(created);
            }
            dirty = false;
            renderNames();
            renderMarks();
        },
        /**
         * ONE MAP PROBE AND ONE FIELD WRITE PER PASS — AND THE ONE PLACE THIS
         * BINDING NO LONGER AGREES WITH THE FLOOR. `bindRelationStore` keeps
         * `touchedOwners` from `holdRelation` and writes at a POSITION, which is also
         * what `TRelationBinding.patchOwnerName` asks of every arm; the probe here is
         * left over from the same 2026-09-03 change, and its old justification is
         * entombed on `holdRelation` above.
         *
         * IT STANDS BECAUSE IT IS `control-write`'S DOUBLED QUANTITY on the join
         * table: `a write to a related entity` times exactly this call, and dropping
         * the probe leaves an array read and a field write against a frame of two
         * eight-line deliveries. Nothing under `measurements/` says that gap still
         * clears that table's drift, and an arm whose gap cannot clear the drift
         * fails the run while attesting nothing — the worse of the two failures.
         *
         * WHAT SETTLES IT: one run of `relationWrite` with this call positional, read
         * against the drift printed beside it. Until then the divergence is declared
         * here rather than silently kept.
         */
        patchOwnerName: (at, name) => {
            for (let pass = 0; pass < writes; pass++) {
                const owner = byOwner.get(config.touched[at]);
                if (owner !== undefined) owner.name = name;
            }
            dirty = true;
        },
        /** THE ADDRESS COMPOSED PER PASS, never cached — see the header. */
        writePair: (at, mark) => {
            for (let pass = 0; pass < writes; pass++) {
                const pair = pairs.get(pairKey(config.owners[at], config.ids[at]));
                if (pair !== undefined) pair.mark = mark;
            }
            dirty = true;
        },
        frame: run => {
            run();
        },
        settle: () => {
            if (!dirty) return;
            dirty = false;
            render();
        },
        readAll: () => Array.from(byId.values()),
        deliverableRows: () => undefined,
        /** NOTHING TO READ — no window, no group, no sort. See the churn store. */
        groupOrder: () => undefined,
        readOwners: () => Array.from(byOwner.values()),
        readPairs: () => Array.from(pairs.values()),
        dispose: () => {
            byId.clear();
            byOwner.clear();
            pairs.clear();
            rowOwners.length = 0;
            rowPairs.length = 0;
            nameText.length = 0;
            markText.length = 0;
        },
    };
};

/**
 * THE CONTROL'S SINGLE-VALUE WIRING — the harness's own two values, one dispatch
 * list on the first of them, and the same two knobs the other four builders carry.
 *
 * `passes` IS THE HEAVY ARM AND IT IS A DOUBLED DISPATCH. Every pass puts ANOTHER
 * SUBSCRIBER BODY on the value, and a settle runs all of them and delivers ONCE —
 * so the heavy arm's second body reads the value and stores the same text, the
 * consumer sees one delivery either way, and the arm arrives at the identical
 * digest and DISTINCT count. It is not a doubled derivation because a single view
 * has none worth doubling: one map read and one formatted line. See
 * {@link controlAxisFor}.
 *
 * `writes` DOUBLES THE STORE MUTATION AND NOT THE DISPATCH — `touched` is set once
 * however many passes a write makes, so the frame is walked once. The same
 * separation `controlChurnBinding` keeps, for the same reason: two knobs on two
 * axes, or the pair attests neither.
 *
 * THE SECOND VALUE IS ROUTED AND NOT BROADCAST. Nothing here wakes consumer B,
 * because the control is what a store that notifies PER VALUE costs; a control that
 * woke the bystander would be attesting the coarse shape and the tables would be
 * read against the wrong instrument.
 */
const controlSingleBinding = (
    adapter: string,
    consumers: TConsumers,
    passes: number,
    writes: number
): TSingleBinding => {
    /** Both values, by name — the whole of what this wiring stores. */
    const held = new Map<string, string>();
    /** The subscriber bodies standing on the first value. */
    const bodies: TControlSub[] = [];
    /** What the last dispatch read. The delivery renders this and not the map. */
    let read = '';
    let name = '';
    let bystander = '';
    let touched = false;

    return {
        ...noRowStore(adapter),
        holdSingle: config => {
            name = config.name;
            bystander = config.bystander;
            held.set(name, config.seeds[0]);
            held.set(bystander, config.seeds[1]);
            for (let pass = 0; pass < passes; pass++) {
                bodies.push(() => {
                    read = held.get(name) ?? '';
                });
            }
            read = config.seeds[0];
            // Both views into the state a script starts from, untimed and
            // required — `TSingleBinding.holdSingle`.
            deliverSingle(consumers.a, name, read);
            deliverSingle(consumers.b, bystander, config.seeds[1]);
        },
        writeSingle: value => {
            for (let pass = 0; pass < writes; pass++) held.set(name, value);
            touched = true;
        },
        readSingle: () => held.get(name) ?? '',
        readBystander: () => held.get(bystander) ?? '',
        /**
         * THE DISPATCH. Every standing body runs, then ONE delivery — and NONE at
         * all if nothing was written, which is what makes `re-write one value` a
         * script this control can stand above.
         */
        frame: run => {
            run();
        },
        settle: () => {
            if (!touched) return;
            touched = false;
            for (let i = 0; i < bodies.length; i++) bodies[i]();
            deliverSingle(consumers.a, name, read);
        },
        dispose: () => {
            held.clear();
            bodies.length = 0;
        },
    };
};

export const CONTROL_LEAN = 'control-lean';
export const CONTROL_HEAVY = 'control-heavy';
/**
 * THE FINE ARM, and the one whose difference is on the axis most rows vary along.
 * See the header over `controlBinding` for why one pair could not attest both.
 */
export const CONTROL_WRITE = 'control-write';

/** The same sentence for all three: harness code, and not a library claim. */
const CONTROL_ADMISSION =
    'no library, and not a library claim: the harness owns the Map and drives the consumer itself. ' +
    'These rows are not in the comparison — they are the instrument attesting what it can resolve.';

export const controlLeanAdapter: TAdapter = {
    name: CONTROL_LEAN,
    version: '0',
    docs: 'the harness itself — one derivation per settle, one write per write',
    // No library, so no documentation to be driven against. The pair's whole
    // difference is declared above and is the point of it.
    departure: '',
    admission: CONTROL_ADMISSION,
    isControl: true,
    bind: (consumers, view) => controlBinding(twoViews(consumers, view), view, 1, 1),
    bindPerGroup: (consumers, view) => controlBinding(consumers.views, view, 1, 1),
    // THE BASELINE UNDER ALL FIVE WIRINGS: one derivation, one write, one mount,
    // one dispatch. It has to exist under each of them or the tables driven
    // through the other four builders would have an arm and nothing to read it
    // against.
    churn: churnShapes(consumers => controlChurnBinding(consumers.a, 1, 1)),
    reads: readShapes((consumers, view, plan) =>
        controlReadBinding(consumers, view, plan, 1, 1)
    ),
    relations: { build: consumers => controlRelationBinding(consumers, 1, 1), absent: '' },
    single: {
        build: consumers => controlSingleBinding(CONTROL_LEAN, consumers, 1, 1),
        absent: '',
    },
};

export const controlHeavyAdapter: TAdapter = {
    name: CONTROL_HEAVY,
    version: '0',
    docs:
        'the harness itself — the same derivation twice per settle, and under the other four wirings ' +
        'the axis that table is along: a doubled mount path, a doubled read, a doubled relation ' +
        'render, a doubled single-value dispatch',
    // As above: the harness's own code, with nothing to depart from.
    departure: '',
    admission: CONTROL_ADMISSION,
    isControl: true,
    bind: (consumers, view) => controlBinding(twoViews(consumers, view), view, 2, 1),
    // The deliberate 2x has to exist under BOTH wirings, or the per-group table
    // would be printed above a resolution nothing established at fifty views.
    bindPerGroup: (consumers, view) => controlBinding(consumers.views, view, 2, 1),
    /**
     * THE DOUBLING CHANGES PLACE TO THE AXIS THE TABLE IS ALONG — see `controlAxisFor`.
     * A churn table is attested on a doubled MOUNT PATH, because a churn frame's
     * derivation is one line and doubling it would attest nothing at the scale of
     * a mount; a read table on a doubled READ; a relation table on a doubled RENDER,
     * both views computed and delivered twice (it was a doubled JOIN until
     * 2026-09-03 — see `controlRelationBinding`); and a SINGLE-VALUE table on a
     * doubled DISPATCH, for the churn table's reason one size down — a single
     * view's derivation is one map read and one formatted line.
     */
    churn: churnShapes(consumers => controlChurnBinding(consumers.a, 2, 1)),
    reads: readShapes((consumers, view, plan) =>
        controlReadBinding(consumers, view, plan, 2, 1)
    ),
    relations: { build: consumers => controlRelationBinding(consumers, 2, 1), absent: '' },
    single: {
        build: consumers => controlSingleBinding(CONTROL_HEAVY, consumers, 2, 1),
        absent: '',
    },
};

/**
 * THE FINE ARM: one derivation per settle, and every store mutation performed
 * TWICE.
 *
 * READ AGAINST `control-lean` AND NOTHING ELSE, and NOT a third opinion about the
 * same question: `control-heavy` attests a doubled derivation and this a doubled
 * write, and the report prints both gaps beside the same drift rather than folding
 * them into one verdict. See the header over `controlBinding`.
 */
export const controlWriteAdapter: TAdapter = {
    name: CONTROL_WRITE,
    version: '0',
    docs: 'the harness itself — one derivation per settle, every store mutation twice',
    departure: '',
    admission: CONTROL_ADMISSION,
    isControl: true,
    bind: (consumers, view) => controlBinding(twoViews(consumers, view), view, 1, 2),
    // Under BOTH wirings, for the reason `control-heavy`'s doubled derivation is.
    bindPerGroup: (consumers, view) => controlBinding(consumers.views, view, 1, 2),
    /**
     * IT DECLINES TWO OF THE FOUR NEW WIRINGS, AND THE DECLINE IS THE FINDING —
     * the full reasoning is on `controlAxisFor`. In one line each: a churn frame
     * performs ONE store mutation against every mount in the cycle, so a doubled
     * write path is smaller than that table's drift; and four of the five read
     * scripts write nothing at all, so the gap there is exactly zero. An arm whose
     * gap cannot clear the drift attests nothing while failing the run, and
     * inventing a quantity to double instead would attest a resolution nobody
     * measured.
     */
    churn: noChurn(
        'a churn frame performs ONE store mutation — the write the frame is built around — against '
        + 'every mount and unmount of the cycle, so this arm\'s deliberate difference would be smaller '
        + 'than the drift of the table it stood above. `control-heavy` supplies the churn wiring and '
        + 'attests it on a DOUBLED MOUNT PATH instead, which is the axis those rows are along; what '
        + "these tables have no second arm for is the scale of their own gaps, and they say so."
    ),
    reads: noReads(
        'four of the five read scripts perform NO STORE MUTATION AT ALL — a page pulled by key, a '
        + 'window offset moved near the head or deep in the group, and a view switched to another group '
        + 'write nothing — so this arm\'s deliberate difference is a gap of exactly zero above four of '
        + 'the five tables. `control-heavy` supplies the read wiring and attests it on a DOUBLED READ, '
        + 'which is the axis those rows are along.'
    ),
    // The relation scripts DO write every step — a name or a mark — so the arm is
    // real there and both relation tables carry the pair the write tables carry.
    relations: { build: consumers => controlRelationBinding(consumers, 1, 2), absent: '' },
    /**
     * THE FAMILY WHERE THIS ARM IS AT ITS STRONGEST, and it is worth saying why
     * rather than only supplying the builder. `control-write`'s gap is small in
     * every other table because the write path is a MINORITY of those scripts'
     * time — a window is derived and a page of lines is formatted around it. A
     * single step is a write, a dispatch and ONE formatted line, so there is no
     * majority for the write path to hide under, and this is the one table where
     * the fine arm is expected to be the LARGER of the two rather than the
     * smaller. WHETHER IT IS, IS A MEASUREMENT AND NOT A PREDICTION; nothing here
     * has run.
     */
    single: {
        build: consumers => controlSingleBinding(CONTROL_WRITE, consumers, 1, 2),
        absent: '',
    },
};
