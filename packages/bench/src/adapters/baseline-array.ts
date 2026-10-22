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
} from '../harness/render';
import { chainLevelOf, diamondJoinOf, diamondLeftOf, diamondRightOf } from '../harness/derivations';
import type { BenchConsumer, TConsumers, TViewBinding } from '../harness/consumer';
import type {
    TAdapter,
    TBinding,
    TCellConfig,
    TChurnBinding,
    TReadBinding,
    TRelationBinding,
    TRelationConfig,
    TSingleBinding,
    TViewConfig,
} from '../harness/types';
import { churnShapes, noRowStore, readShapes } from '../harness/types';
import type { TOwner, TPairRow, TPlan, TRow } from '../harness/dataset';

/**
 * NO LIBRARY. A Map, a rescan, and a callback — what someone writes before they
 * reach for a store.
 *
 * ONE OF TWO ANCHORS: this one, which does not think about it, and
 * `baseline-indexed`, which keeps a row bucket per group and re-derives only
 * the windows a write can change. See `baseline-array-indexed.md`.
 *
 * WHAT `consumerFloor` STILL MEANS HERE: this adapter does the least possible
 * bookkeeping, so whatever is left after subtracting `consumerFloor` from ITS OWN
 * row is the cost of the rescan. IT NEVER MEANT that the difference between this
 * row and any other is a rescan — against `baseline-indexed` the difference is
 * the index and the re-renders it skips, and against a library it is whatever that library does. This row
 * also remains the `FLOOR_ADAPTER`: the floor scenario runs no store at all and
 * its bound is a bound for a STORAGE SHAPE, plain objects, which both anchors
 * store.
 *
 * It is deliberately NOT clever. It re-derives EVERY view on every settle that
 * saw a write, so it re-renders view B for a write that only touched group A
 * (recorded as a redundant delivery) and re-renders everything for a re-send that
 * changed nothing. Making it smarter would make it the other anchor.
 *
 * NO GROUP INDEX HERE. Seven adapters keep a group → keys map, admitted by
 * `TExcludedLibrary`'s "a key lookup is not storage", because an application
 * built on their library would keep one. This row is not an application built on
 * a library, so under the per-group wiring it rescans the population once per
 * view per settle — fifty times.
 */
type TChurnSub = () => void;

const bindViews = (
    views: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    const byId = new Map<string, TRow>();
    // One reused buffer per view. The rescan is the point of this adapter;
    // allocating an array of the whole group and truncating it was not.
    const states = views.map(bound => ({
        group: bound.group,
        consumer: bound.consumer,
        visible: [] as TRow[],
    }));
    let dirty = false;

    /**
     * THE PINNED ROWS — the Map's own values, because for this row the Map IS the
     * store. What `write` stored is already a copy the harness made for the
     * adapter (`TScenarioContext.loadRows`).
     *
     * The two cell views deliver into the FIRST TWO consumers of the wiring, which
     * under `bind` are A and B. The targeted-delivery script is a two-view script
     * and is never bound per group.
     */
    const pinned: TRow[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };
    /** One text buffer per cell view, reused: a render allocates nothing. */
    const labelText: string[] = [];
    const noteText: string[] = [];

    const renderViews = (): void => {
        for (let i = 0; i < states.length; i++) {
            const state = states[i];
            deliver(
                state.consumer,
                visibleInto(state.visible, byId.values(), state.group, view.window),
                view.window
            );
        }
    };

    /**
     * BOTH CELL VIEWS, EVERY TIME: one dirty flag is all there is, and a Map that
     * was written to cannot say WHICH COLUMN was written.
     */
    const renderCells = (): void => {
        for (let i = 0; i < pinned.length; i++) {
            labelText[i] = pinned[i].label;
            noteText[i] = pinned[i].note;
        }
        deliverCells(states[0].consumer, cells, labelText);
        deliverCells(states[1].consumer, cells, noteText);
    };

    /** What a dirty settle delivers. Re-pointed once, by `pin`. */
    let render = renderViews;

    return {
        write: rows => {
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const held = byId.get(row.id);
                if (held === undefined) byId.set(row.id, row);
                else {
                    held.group = row.group;
                    held.rank = row.rank;
                    held.label = row.label;
                    held.note = row.note;
                }
            }
            dirty = true;
        },
        // A Map delete, which is the honest floor for removal: no index to
        // repair, no ordered list to splice, nothing to unlink.
        remove: ids => {
            for (let i = 0; i < ids.length; i++) byId.delete(ids[i]);
            dirty = true;
        },
        patchLabel: (id, label) => {
            const row = byId.get(id);
            if (row !== undefined) row.label = label;
            dirty = true;
        },
        // The same `dirty = true` on the column nothing reads: a rescan has no way
        // to know the column it was told about is one it never looks at.
        patchNote: (id, note) => {
            const row = byId.get(id);
            if (row !== undefined) row.note = note;
            dirty = true;
        },
        setGroup: (id, group) => {
            const row = byId.get(id);
            if (row !== undefined) row.group = group;
            dirty = true;
        },
        setRank: (id, rank) => {
            const row = byId.get(id);
            if (row !== undefined) row.rank = rank;
            dirty = true;
        },
        /**
         * The stored objects, kept — the whole of what a key resolves to here, and
         * why this row's pinned writes are cheaper than its keyed ones:
         * `patchLabel` opens with `byId.get` and this does not.
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
            for (const state of states) state.visible.length = 0;
            render = renderCells;
            // Untimed: the state every sample starts from.
            renderCells();
        },
        // The position is the address — no `byId.get`. `dirty` is set exactly as
        // in `patchLabel`, because there is no finer signal here to set.
        patchPinnedLabel: (at, label) => {
            pinned[at].label = label;
            dirty = true;
        },
        patchPinnedNote: (at, note) => {
            pinned[at].note = note;
            dirty = true;
        },
        frame: run => run(),
        settle: () => {
            if (!dirty) return;
            dirty = false;
            // Every view, every time: inventing a way for the Map to say which
            // group or column moved is the line between this row and a store.
            render();
        },
        /**
         * THE POPULATION: `byId` is not bookkeeping beside a store, it IS the
         * store, which is why the audit still bites here. Only the array is
         * fresh; the values are the objects `write` stored.
         */
        readAll: () => Array.from(byId.values()),
        /**
         * NO GROUPING TO BE WRONG ABOUT. WALKING THE POPULATION IS THIS BINDING'S
         * DERIVATION, so answering from it is answering from the thing the views
         * read, and the grouping check adds nothing the column audit did not
         * already prove.
         *
         * Answered rather than declined all the same: `undefined` means "this
         * wiring keeps no grouping AT ALL" and belongs to the churn binding, which
         * has no view.
         */
        groupOrder: group => orderedIdsOfGroup(byId.values(), group),
        /**
         * `renderViews`' TWO LINES MINUS THE DELIVERY — the same buffer, the same
         * derivation, the same `view.window`, and no `deliver`.
         *
         * WHY THIS ROW ANSWERS AT ALL. It is `FLOOR_ADAPTER`: the plain-object
         * floor every other adapter's rows are scaled by is measured here, so the
         * shape audit (`firstDeliveredShapeMismatch`) has to be able to run against
         * the shape the floor claims to be for. An answer nobody checks would be
         * the one place the apparatus could be wrong and stay quiet.
         *
         * THE BUFFER IS THE DELIVERY PATH'S OWN and is overwritten in place, which
         * is what the contract asks for: the objects are the Map's values, the same
         * references `deliver` is passed. Untimed, so re-deriving costs nothing
         * that is measured.
         */
        deliverableRows: at =>
            at >= states.length
                ? undefined
                : visibleInto(
                      states[at].visible,
                      byId.values(),
                      states[at].group,
                      view.window
                  ),
        /**
         * `states.length = 0` IS THE TEARDOWN, not tidiness. `tear the screen
         * down` times this call and then writes a page into the torn-down binding
         * demanding NO DELIVERY — a binding that kept its view list would rescan,
         * render, and be reported as a store whose teardown tore nothing down.
         * There is no subscription here to detach, so the views are the whole of
         * what there was to let go.
         */
        dispose: () => {
            byId.clear();
            for (const state of states) state.visible.length = 0;
            states.length = 0;
        },
    };
};

/**
 * THE HAND-WRITTEN FLOOR FOR A READ — a Map read per key, and a rescan per view.
 *
 * A THIRD BODY for `bindChurnStore`'s reason: branching for this wiring inside
 * the binding the other rows are measured on would change the cost of those rows
 * to serve these. What differs is that view A has an OFFSET which `scrollTo`
 * moves, and view B selects on the group AND the second axis.
 *
 * ─── AND IT IS STILL DELIBERATELY NOT CLEVER ─────────────────────────────
 *
 *  - A READ BY KEY is `byId.get` per key and three property loads. No index is
 *    consulted and nothing is invalidated.
 *  - A SCROLL is one number changing, and then the same rescan the store already
 *    performs — top-(offset + window), page taken from the end. A DEEPER OFFSET
 *    COSTS THIS ROW ALMOST NOTHING EXTRA: it was already walking the whole
 *    population and now keeps a few more rows while walking it.
 *  - THE SECOND AXIS is one more clause in the same loop (`visibleOnAxisInto`),
 *    per candidate row. Nothing is precomputed and nothing is filed: giving a
 *    rescan somewhere to remember the answer would make it a store.
 */
const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const byId = new Map<string, TRow>();
    /** Reused buffers, so a delivery allocates nothing. */
    const paged: TRow[] = [];
    const onAxis: TRow[] = [];
    const found: TRow[] = [];
    /** Where view A's window starts, and over which group. Moved by `scrollTo` and `switchGroup`. */
    let offset = 0;
    let pagedGroup = view.groupA;
    let dirty = false;

    const render = (): void => {
        deliverPage(
            consumers.a,
            // Top-(offset + window), so the page at `offset` is the tail of it.
            // The whole population is still walked, which is the point.
            visibleInto(paged, byId.values(), pagedGroup, offset + view.window),
            offset,
            view.window
        );
        deliverPage(
            consumers.b,
            visibleOnAxisInto(onAxis, byId.values(), view.groupA, view.window),
            0,
            view.window
        );
    };

    return {
        write: rows => {
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const held = byId.get(row.id);
                if (held === undefined) byId.set(row.id, row);
                else {
                    held.group = row.group;
                    held.rank = row.rank;
                    held.label = row.label;
                    held.note = row.note;
                }
            }
            dirty = true;
        },
        remove: ids => {
            for (let i = 0; i < ids.length; i++) byId.delete(ids[i]);
            dirty = true;
        },
        patchLabel: (id, label) => {
            const row = byId.get(id);
            if (row !== undefined) row.label = label;
            dirty = true;
        },
        patchNote: (id, note) => {
            const row = byId.get(id);
            if (row !== undefined) row.note = note;
            dirty = true;
        },
        setGroup: (id, group) => {
            const row = byId.get(id);
            if (row !== undefined) row.group = group;
            dirty = true;
        },
        setRank: (id, rank) => {
            const row = byId.get(id);
            if (row !== undefined) row.rank = rank;
            dirty = true;
        },
        // No read script pins anything: the cell wiring is the targeted-delivery
        // script's and that is a two-view script bound by `bind`.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame: run => run(),
        /**
         * ONE MAP PROBE PER KEY. Nothing is resolved in advance and nothing is
         * remembered between pages; the lookup is what the row measures.
         *
         * A key the store no longer holds contributes no line, which makes the
         * page SHORT — a different state to the consumer, because the digest folds
         * the row count. So a lost row fails here rather than passing as a page
         * with a gap in it.
         */
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const row = byId.get(keys[from + i]);
                if (row !== undefined) found.push(row);
            }
            deliverPage(consumers.a, found, 0, count);
        },
        // One number, and the same dirty flag every write sets: this store has no
        // finer signal. NOTHING IS RE-ORDERED — `render` re-derives from the
        // population it always re-derives from.
        scrollTo: to => {
            offset = to;
            dirty = true;
        },
        switchGroup: group => {
            pagedGroup = group;
            offset = 0;
            dirty = true;
        },
        settle: () => {
            if (!dirty) return;
            dirty = false;
            render();
        },
        readAll: () => Array.from(byId.values()),
        deliverableRows: () => undefined,
        /**
         * THE SAME NON-ANSWER AS THE WINDOW BINDING: the population IS the
         * derivation, so there is no second structure to catch out.
         */
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
 * THE HAND-WRITTEN FLOOR FOR A SUBSCRIPTION — a Map of id to an array of
 * callbacks, a push to mount, an `indexOf` plus a `splice` to unmount, and a
 * settle that calls the callbacks of the rows that were written.
 *
 * A SECOND BODY because the window binding has no dispatch at all — it sets one
 * boolean and rescans, which is what makes it the anchor and why it cannot answer
 * this question. A store with no per-row signal has nothing to mount a subscriber
 * ON, so this is a DIFFERENT PROGRAM rather than the same one with a flag: a
 * per-write branch would have changed the cost of eight measured rows to serve
 * nine new ones.
 *
 * ─── AND IT IS STILL DELIBERATELY NOT CLEVER ─────────────────────────────
 *
 * An array per row, walked in order, with no ordering, no dedup, no generation
 * counter and no scheduler.
 *
 *  - MOUNT is `sources.length` array pushes plus one closure. Nothing is
 *    expanded, deduplicated, or allocated per root.
 *  - UNMOUNT is `indexOf` plus `splice` per source — the same shape the engine
 *    pays, so the gap is the engine's rather than the algorithm's.
 *  - A COLUMN is a second Map, of the `label` column's subscribers by row id,
 *    which is what "the column identity is minted inside the subscription" has
 *    to be measured against.
 *  - A CHAIN COSTS NOTHING EXTRA AT MOUNT, and that is the finding rather than a
 *    dodge: the roots were written down, so there is no walk down a graph to find
 *    them. The derivation itself still runs, once per level, in the body.
 */
const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    const byId = new Map<string, TRow>();
    /** Row id -> the subscribers watching that row. The whole mechanism. */
    const rowSubs = new Map<string, TChurnSub[]>();
    /** Row id -> the subscribers watching that row's `label` column. */
    const labelSubs = new Map<string, TChurnSub[]>();
    /** Rows written since the last settle, in write order. */
    const touched: string[] = [];

    /** The churn rows, resolved once by `holdChurnRows`. */
    let churnIds: readonly string[] = [];
    let churnId = '';
    let churnRank = 0;
    /** What each subscriber last read. */
    const churnRead: (string | undefined)[] = [];
    /** Per subscriber: its body, and the lists it has to leave. */
    const bodies: (TChurnSub | undefined)[] = [];
    const joined: (TChurnSub[][] | undefined)[] = [];
    let churnWoke = 0;
    let settleCount = 0;

    const listOf = (
        lists: Map<string, TChurnSub[]>,
        key: string
    ): TChurnSub[] => {
        let held = lists.get(key);
        if (held === undefined) {
            held = [];
            lists.set(key, held);
        }
        return held;
    };

    const join = (at: number, body: TChurnSub, lists: TChurnSub[][]): void => {
        for (let i = 0; i < lists.length; i++) lists[i].push(body);
        bodies[at] = body;
        joined[at] = lists;
    };

    const readInto = (at: number, first: TRow | undefined): void => {
        churnRead[at] = first === undefined ? '' : first.label;
    };

    const readerOf = (at: number, first: TRow | undefined): TChurnSub => () => {
        churnWoke++;
        readInto(at, first);
    };

    return {
        write: rows => {
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const held = byId.get(row.id);
                if (held === undefined) byId.set(row.id, row);
                else {
                    held.group = row.group;
                    held.rank = row.rank;
                    held.label = row.label;
                    held.note = row.note;
                }
                touched.push(row.id);
            }
        },
        remove: ids => {
            for (let i = 0; i < ids.length; i++) {
                byId.delete(ids[i]);
                touched.push(ids[i]);
            }
        },
        patchLabel: (id, label) => {
            const row = byId.get(id);
            if (row !== undefined) row.label = label;
            touched.push(id);
        },
        patchNote: (id, note) => {
            const row = byId.get(id);
            if (row !== undefined) row.note = note;
            touched.push(id);
        },
        setGroup: (id, group) => {
            const row = byId.get(id);
            if (row !== undefined) row.group = group;
            touched.push(id);
        },
        setRank: (id, rank) => {
            const row = byId.get(id);
            if (row !== undefined) row.rank = rank;
            touched.push(id);
        },
        // A churn binding derives no view and no churn script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame: run => run(),
        /**
         * THE DISPATCH, and the whole of what this store has. Every row written
         * since the last settle has its subscriber list walked, and its `label`
         * column's list too — a hand-written store cannot tell which column moved
         * without being told, so it tells both.
         *
         * ONE delivery if anything woke, NONE if nothing did. That second case is
         * what an unmount has to have achieved, and this store cannot fake it:
         * `churnWoke` is incremented by the bodies and by nothing else.
         */
        settle: () => {
            settleCount++;
            for (let i = 0; i < touched.length; i++) {
                const id = touched[i];
                const watchers = rowSubs.get(id);
                if (watchers !== undefined) {
                    for (let w = 0; w < watchers.length; w++) watchers[w]();
                }
                const column = labelSubs.get(id);
                if (column !== undefined) {
                    for (let w = 0; w < column.length; w++) column[w]();
                }
            }
            touched.length = 0;
            if (churnWoke === 0) return;
            deliverChurn(
                churnConsumer,
                churnId,
                churnRank,
                churnWoke,
                churnRead
            );
            churnWoke = 0;
        },
        readAll: () => Array.from(byId.values()),
        deliverableRows: () => undefined,
        /**
         * NOTHING TO READ. A churn binding derives NO VIEW — no window, no group,
         * and a callback list per row id is the whole mechanism — so there is no
         * grouping to be a second witness to. Inventing one would answer a question
         * the wiring was never asked.
         */
        groupOrder: () => undefined,
        /**
         * The rows resolved once, before the clock. The same untimed resolution
         * `pin` performs: a component mounts on a row it already has.
         */
        holdChurnRows: (ids, ranks) => {
            churnIds = ids;
            churnId = ids[0];
            churnRank = ranks[0];
            for (let at = 0; at < ids.length; at++) churnRead[at] = undefined;
        },
        mountOnRows: (at, from, count) => {
            const lists: TChurnSub[][] = new Array(count);
            for (let i = 0; i < count; i++) {
                lists[i] = listOf(rowSubs, churnIds[from + i]);
            }
            const first = byId.get(churnIds[from]);
            join(at, readerOf(at, first), lists);
            readInto(at, first);
        },
        mountOnColumn: at => {
            const id = churnIds[0];
            const first = byId.get(id);
            join(at, readerOf(at, first), [listOf(labelSubs, id)]);
            readInto(at, first);
        },
        /**
         * The derivation runs `depth` levels in the body, so THE FRAME PAYS FOR
         * THE CHAIN AND ONLY THE MOUNT DOES NOT. That asymmetry is the comparison
         * this row exists to make.
         */
        mountOnChain: (at, from, count, depth) => {
            const lists: TChurnSub[][] = new Array(count);
            const watched: (TRow | undefined)[] = new Array(count);
            for (let i = 0; i < count; i++) {
                const id = churnIds[from + i];
                lists[i] = listOf(rowSubs, id);
                watched[i] = byId.get(id);
            }
            const derive = (): string => {
                let text = watched[0]?.label ?? '';
                for (let i = 1; i < watched.length; i++) {
                    text = `${text},${watched[i]?.label ?? ''}`;
                }
                for (let level = 1; level <= depth; level++) text = chainLevelOf(text, level);
                return text;
            };
            const body: TChurnSub = () => {
                const text = derive();
                churnWoke++;
                churnRead[at] = text;
            };
            join(at, body, lists);
            churnRead[at] = derive();
        },
        // Both sides and the join recomputed in the one body, at most once per settle.
        mountOnDiamond: (at, from) => {
            const id = churnIds[from];
            const root = byId.get(id);
            let ranAtSettle = -1;
            const derive = (): string => {
                const label = root === undefined ? '' : root.label;
                return diamondJoinOf(diamondLeftOf(label), diamondRightOf(label));
            };
            const body: TChurnSub = () => {
                if (ranAtSettle === settleCount) return;
                ranAtSettle = settleCount;
                const text = derive();
                churnWoke++;
                churnRead[at] = text;
            };
            join(at, body, [listOf(rowSubs, id)]);
            churnRead[at] = derive();
        },
        unmount: at => {
            const lists = joined[at];
            const body = bodies[at];
            if (lists === undefined || body === undefined) return;
            for (let i = 0; i < lists.length; i++) {
                const held = lists[i];
                const found = held.indexOf(body);
                if (found >= 0) held.splice(found, 1);
            }
            joined[at] = undefined;
            bodies[at] = undefined;
            churnRead[at] = undefined;
        },
        dispose: () => {
            byId.clear();
            rowSubs.clear();
            labelSubs.clear();
            touched.length = 0;
            joined.length = 0;
            bodies.length = 0;
            churnRead.length = 0;
        },
    };
};

/**
 * THE HAND-WRITTEN FLOOR FOR TWO ENTITY TYPES AND A RELATIONSHIP — a fourth
 * program, for `bindChurnStore`'s reason: bolting a second population and a pair
 * table onto the window binding would have put two more `Map`s, a join and a
 * second dirty flag inside the settle of thirteen rows, to serve two.
 *
 * ─── WHAT SOMEBODY WRITES BEFORE THEY REACH FOR A STORE ──────────────────
 *
 *  - `byId` — the rows, exactly as everywhere else in this file.
 *  - `byOwner` — the second type, keyed by its own id. A separate map, because
 *    that is what "normalised" means, and the alternative — copying the owner's
 *    name into every row — is what these two rows exist to price against.
 *  - `pairs` — the records keyed by two ids under a JOINED STRING. Not a straw
 *    man: one hash of one short string against a descent through two maps.
 *  - THE JOIN IS RESOLVED ONCE, IN `holdRelation`, and a delivery is one array
 *    read per line. `rowOwners` and `rowPairs` are the OBJECTS the two write
 *    paths mutate — the same freedom every other participant takes before the
 *    first event arrives.
 *
 *    NOTHING IS CACHED BY KEEPING THEM: an owner and a pair record are objects,
 *    `patchOwnerName` and `writePair` write THROUGH them, and a reference to an
 *    object somebody else mutates has nothing to give up and no moment at which
 *    it could go stale. `writeOwners` runs once, before `holdRelation`
 *    (`TRelationBinding.writeOwners`), and no timed step re-parents a row, so the
 *    resolution cannot be outrun either. The clock starts at the arrival of an
 *    event; the bind phase is outside it FOR EVERYONE, and a floor that declined
 *    that freedom while eleven other adapters took it would not be a lower bound
 *    but an inflated one — and it is the denominator every multiple in the
 *    relation tables is printed against.
 *
 *  - THE PAIR ADDRESS IS STILL NOT KEPT. `writePair` composes the key and probes
 *    `pairs` on every call, which is the arm that row measures.
 *
 * IT HAS NO IDEA THAT VIEW A DEPENDS ON OWNERS. It re-renders BOTH views on every
 * settle in which anything was written, so each script wakes the other's view
 * redundantly every step. Those redundant deliveries are the number this row
 * contributes.
 */
const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    const byId = new Map<string, TRow>();
    const byOwner = new Map<string, TOwner>();
    /** `owner id` + ' ' + `row id` -> the record at that pair. */
    const pairs = new Map<string, TPairRow>();
    /** Anything at all was written since the last settle. One flag, no routing. */
    let dirty = false;

    /** The addresses `holdRelation` was given. Both views render these rows. */
    let config: TRelationConfig = {
        ids: [],
        ranks: [],
        owners: [],
        touched: [],
        names: [],
        seeds: [],
    };
    /** The owners the join script writes, by POSITION in `config.touched`. */
    const touchedOwners: (TOwner | undefined)[] = [];
    /** The owner each rendered line's name comes from, in `ids` order. */
    const rowOwners: (TOwner | undefined)[] = [];
    /** The pair record each rendered line's mark comes from, in `ids` order. */
    const rowPairs: TPairRow[] = [];
    /** The two deliveries' text, reused so a render allocates nothing. */
    const nameText: string[] = [];
    const markText: string[] = [];

    /**
     * THE PAIR ADDRESS, COMPOSED PER CALL. The separator is a character no id in
     * this dataset contains, so no two distinct pairs compose to one key. Built
     * fresh every time on purpose: caching eight of them would turn the row into a
     * measurement of an array read, which `TRelationBinding.writePair` forbids of
     * both arms alike.
     */
    const pairKey = (owner: string, row: string): string => `${owner} ${row}`;

    const renderNames = (): void => {
        for (let i = 0; i < rowOwners.length; i++) {
            const owner = rowOwners[i];
            nameText[i] = owner === undefined ? '' : owner.name;
        }
        deliverRelation(consumers.a, config, nameText);
    };

    const renderMarks = (): void => {
        for (let i = 0; i < rowPairs.length; i++) {
            markText[i] = rowPairs[i].mark;
        }
        deliverRelation(consumers.b, config, markText);
    };

    return {
        write: rows => {
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const held = byId.get(row.id);
                if (held === undefined) byId.set(row.id, row);
                else {
                    held.group = row.group;
                    held.rank = row.rank;
                    held.label = row.label;
                    held.note = row.note;
                }
            }
            dirty = true;
        },
        remove: ids => {
            for (let i = 0; i < ids.length; i++) byId.delete(ids[i]);
            dirty = true;
        },
        patchLabel: (id, label) => {
            const row = byId.get(id);
            if (row !== undefined) row.label = label;
            dirty = true;
        },
        patchNote: (id, note) => {
            const row = byId.get(id);
            if (row !== undefined) row.note = note;
            dirty = true;
        },
        setGroup: (id, group) => {
            const row = byId.get(id);
            if (row !== undefined) row.group = group;
            dirty = true;
        },
        setRank: (id, rank) => {
            const row = byId.get(id);
            if (row !== undefined) row.rank = rank;
            dirty = true;
        },
        // No relation script pins: the targeted-delivery script is a two-view
        // script and is bound by `bind`.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame: run => run(),
        /** Copied: `owners` is the harness's own array, and `patchOwnerName` writes through what is stored. */
        writeOwners: owners => {
            for (let i = 0; i < owners.length; i++) {
                const owner = owners[i];
                byOwner.set(owner.id, { id: owner.id, name: owner.name });
            }
            dirty = true;
        },
        /**
         * THE OBJECTS BOTH SCRIPTS WORK THROUGH, RESOLVED ONCE — the `byOwner.get`
         * a keyed write would open with — and the pair records created at their
         * seeds, so every timed step is a resolution and an update rather than a
         * mint. A Map hands back the value it stores, and that value is what the
         * two write paths mutate; see this binding's header on why keeping it is
         * not a cache.
         */
        holdRelation: given => {
            config = given;
            nameText.length = given.ids.length;
            markText.length = given.ids.length;
            for (let at = 0; at < given.touched.length; at++) {
                touchedOwners.push(byOwner.get(given.touched[at]));
            }
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
         * ONE FIELD WRITE, at a POSITION — no map probe, which is what
         * `TRelationBinding.patchOwnerName` asks of every arm. Nothing knows a
         * view depends on it.
         */
        patchOwnerName: (at, name) => {
            const owner = touchedOwners[at];
            if (owner !== undefined) owner.name = name;
            dirty = true;
        },
        /**
         * COMPOSE THE ADDRESS, FIND THE RECORD, WRITE THE MARK — one string join,
         * one map probe, one field write. The arm put against a descent through
         * identities.
         */
        writePair: (at, mark) => {
            const pair = pairs.get(pairKey(config.owners[at], config.ids[at]));
            if (pair !== undefined) pair.mark = mark;
            dirty = true;
        },
        /**
         * BOTH VIEWS, EVERY TIME ANYTHING WAS WRITTEN. It has no way to tell an
         * owner write from a pair write and does not try.
         */
        settle: () => {
            if (!dirty) return;
            dirty = false;
            renderNames();
            renderMarks();
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
            touchedOwners.length = 0;
            rowOwners.length = 0;
            rowPairs.length = 0;
            nameText.length = 0;
            markText.length = 0;
        },
    };
};

/**
 * ONE VALUE, ONE SUBSCRIBER, AND A SECOND VALUE BESIDE IT — hand-written, and the
 * ANCHOR of the single-value family.
 *
 * WHAT SOMEBODY WRITES BEFORE THEY REACH FOR A LIBRARY: two variables, one callback
 * on each, and a dirty flag the frame boundary reads. There is no map and no key,
 * because the task has neither — an anchor that kept one would be paying for an
 * address the scripts never use and would flatter every row above it.
 *
 * IT ROUTES, AND THAT IS THE ANCHOR'S POSITION RATHER THAN A FREEBIE: the write
 * marks the value it wrote, and the settle wakes that value's subscriber alone. A
 * library with one global change signal is not being compared against something
 * unattainable — this is four lines — and its extra wake-ups reach the report as
 * redundant deliveries beside its time.
 *
 * IT IS NOT THE FLOOR. `singleFloor` holds no value at all and only delivers; this
 * keeps the two values, the two callbacks and the flag, which is what a hand-written
 * answer to the task actually costs.
 */
const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
    let value = '';
    let bystander = '';
    let name = '';
    let bystanderName = '';
    /** What the subscriber last read. The delivery renders this, not the variable. */
    let read = '';
    /** The value was written since the last settle. One flag, one value. */
    let dirty = false;

    return {
        ...noRowStore('baseline-array'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            value = config.seeds[0];
            bystander = config.seeds[1];
            read = value;
            deliverSingle(consumers.a, name, read);
            deliverSingle(consumers.b, bystanderName, bystander);
        },
        writeSingle: next => {
            value = next;
            dirty = true;
        },
        readSingle: () => value,
        readBystander: () => bystander,
        frame: run => run(),
        /**
         * THE FRAME BOUNDARY. The subscriber runs and delivers if the value was
         * written, and NOTHING happens if it was not — which is the whole of what
         * `re-write one value` measures here, and it is an unconditional dispatch
         * rather than a value comparison: this anchor notifies on every write, as a
         * library with no sorter does.
         */
        settle: () => {
            if (!dirty) return;
            dirty = false;
            read = value;
            deliverSingle(consumers.a, name, read);
        },
        dispose: () => {
            value = '';
            bystander = '';
            read = '';
        },
    };
};

export const baselineArrayAdapter: TAdapter = {
    name: 'baseline-array',
    version: '0',
    docs: 'no library — a Map plus a full rescan per settle',
    /**
     * A floor whose extra work is unprinted moves every ratio read against it,
     * so the three acts that are this file's invention rather than the shape a
     * script asked for go in the field the report prints beside the number.
     */
    departure:
        'no library and no documented recipe: this participant is the naive hand-written floor, the ' +
        'anchor only where `baseline-indexed` declines, and three ' +
        'things it does are its own. On the wide mount shape the subscriber joins the callback list ' +
        'of every churn row it is asked for and its body reads the first of them alone. On the chain ' +
        'shape it BUILDS NO DERIVATION: there is nothing here to stack, so the mount is the same ' +
        'per-row lists the wide shape makes and the body reads every root once and then applies every ' +
        'level of the depth on each wake; on the diamond shape the body computes both sides and the ' +
        'join itself, guarded by a settle counter so it runs at most once per settle. And every settle ' +
        'probes the `label` column list of each row written, one Map read, which the row-shaped churn ' +
        'scripts never populate.',
    admission:
        'no library, and it is not a library claim: the harness owns the Map the values live in and ' +
        'the dirty flag that drives the consumer. This is the naive hand-written arm, and the ANCHOR ' +
        'only for the scenarios `baseline-indexed` declines.',

    bind: (consumers, view) =>
        bindViews(
            [
                { group: view.groupA, consumer: consumers.a },
                { group: view.groupB, consumer: consumers.b },
            ],
            view
        ),
    // THE SAME BODY, HANDED FIFTY VIEWS INSTEAD OF TWO — what changes is how many
    // rescans one settle performs, and that is what this row has to say about a
    // screen subscribed to every group.
    bindPerGroup: (consumers, view) => bindViews(consumers.views, view),
    churn: churnShapes(consumers => bindChurnStore(consumers.a)),
    reads: readShapes((consumers, view, plan) =>
        bindReadStore(consumers, view, plan)
    ),
    relations: {
        build: consumers => bindRelationStore(consumers),
        absent: '',
    },
    single: {
        build: consumers => bindSingleStore(consumers),
        absent: '',
    },
};
