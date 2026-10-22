import { Collection, createIndex } from '@signaldb/core';
import type { Cursor } from '@signaldb/core';
import type {
    BenchConsumer,
    TConsumers,
    TViewBinding,
} from '../harness/consumer';
import type { TOwner, TPairRow, TPlan, TRow } from '../harness/dataset';
import {
    deliver,
    deliverCells,
    deliverChurn,
    deliverPage,
    deliverRelation,
    deliverSingle,
    orderedIdsOfRows,
} from '../harness/render';
import { computed, effect, signal } from '@preact/signals-core';
import type { ReadonlySignal, Signal } from '@preact/signals-core';
import {
    chainLevelOf,
    diamondJoinOf,
    diamondLeftOf,
    diamondRightOf,
} from '../harness/derivations';
import { churnShapes, noRowStore, readShapes } from '../harness/types';
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

// `collection.batch` does not nest: the inner call clears the flag and flushes early (@signaldb/core/dist/index23.mjs:560-567).
const createBatchFrame = (open: (run: () => void) => void) => {
    let framing = 0;
    return (run: () => void): void => {
        if (framing > 0) {
            run();
            return;
        }
        framing++;
        try {
            open(run);
        } finally {
            framing--;
        }
    };
};

/**
 * Recipe: SignalDB's own framework-free pair — a `Collection` with a field index
 * over the column the views select on, one `find(selector, { sort, limit })`
 * cursor per view, and that cursor's `observeChanges` as the subscription.
 * https://signaldb.js.org/reference/core/collection/
 * https://signaldb.js.org/guides/indexes/
 *
 * In a component SignalDB takes its reactivity from the host framework through
 * an adapter (Angular, Vue, Solid…). With none installed — `depend()` returns
 * immediately when `options.reactivity` is undefined — the documented primitive
 * is `observeChanges`, so that drives the consumer here; installing an adapter
 * would measure Vue or Solid.
 *
 * THE WINDOW IS A REAL WINDOW. `Cursor.getItems` applies sort → skip → limit, so
 * `limit: 32` is the first 32 rows OF THE SORTED SET, and `{ rank: 1, id: 1 }`
 * is the harness's total order exactly (fast-sort's default comparer is `<`/`>`,
 * the tiebreak `compareRows` uses). Nothing is sorted by hand here.
 *
 * A cursor is lazy and nothing happens without an observer, so each view
 * registers `observeChanges`: every write makes each cursor re-derive its window
 * inside `Observer.runChecks`, which DIFFS it against the last one seen.
 *
 * That diff is also the value check the re-send scenario is about — `updateOne`
 * emits `changed` whether or not anything changed, and `runChecks` calls nothing
 * when the new window `isEqual` the old — so re-sending the population wakes
 * nobody, paid for with a full re-derivation of both windows.
 *
 * The API will not hand back the list it just derived: `runChecks` keeps its
 * window private, so `fetch` in `settle` derives it a second time. That second
 * pass is billed here rather than hidden.
 */
const bindViews = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    // The column the views select on, indexed as the guide recommends. What that
    // costs here: `rebuildIndices` runs after EVERY write outside a batch and
    // rebuilds every index over the whole collection, so an index is paid per
    // write and not per query.
    const collection = new Collection<TRow>({
        indices: [createIndex('group')],
    });

    /**
     * THE IDS THIS ADAPTER HAS WRITTEN. A presence set, and nothing else.
     *
     * WHAT IT HOLDS IS KEYS, NEVER VALUES: `write` asks it whether there is
     * already a row under this id, never what the stored row looks like.
     * SignalDB's `idIndex` is private, so there is no O(1) presence question to
     * put to it.
     *
     * It can only fail LOUDLY: a Set that wrongly said "absent" sends the row to
     * `collection.insert`, which throws "Item with same id already exists"
     * (index23.cjs.js:582) rather than quietly losing a write.
     *
     * WHAT IT IS WORTH: `updateOne`'s `getItemAndIndex` runs a whole-array
     * `findIndex` BEFORE its `item == null` return, so an ABSENT row scans the
     * collection twice over — quadratic against a filling store, where
     * `collection.insert` costs one identity scan. The mechanism and the line
     * numbers are in WHY-EACH-ROW.md, "batch insert — signaldb".
     */
    const written = new Set<string>();
    const batched = createBatchFrame(run => collection.batch(run));

    type TView = {
        cursor: Cursor<TRow>;
        consumer: BenchConsumer;
        /** Set by the cursor's observer: this window changed. */
        pending: boolean;
        stop: () => void;
    };

    const makeView = (group: string, consumer: BenchConsumer): TView => {
        const state: TView = {
            cursor: collection.find(
                { group },
                { sort: { rank: 1, id: 1 }, limit: view.window }
            ),
            consumer,
            pending: false,
            stop: () => undefined,
        };
        const mark = (): void => {
            state.pending = true;
        };
        // ALL FOUR EVENTS. Which rows are in a group, their order and their
        // content are separate in
        // SignalDB and the consumer depends on all three — a label patch arrives
        // only as `changed`, a group move only as `added`/`removed` — so a
        // subset gives a store that silently never delivers for the rest.
        state.stop = state.cursor.observeChanges(
            { added: mark, removed: mark, changed: mark, movedBefore: mark },
            // The store is empty at bind; the initial run is not a change.
            true
        );
        return state;
    };

    // ONE CURSOR PER VIEW — two, or fifty. A collection write re-queries every
    // live cursor and each observer DIFFS its own window, so the wake-ups stay
    // narrow and the work does not: fifty cursors re-derive fifty windows per
    // write.
    const views: TView[] = bindings.map(bound =>
        makeView(bound.group, bound.consumer)
    );

    /**
     * THE CELL WIRING, empty until `pin`.
     *
     * `pin` RESOLVES NOTHING HERE: `idIndex` is private, there is no document
     * handle a caller may hold, and every write is `updateOne({ id }, …)`, so
     * `patchPinnedLabel` costs what `patchLabel` costs.
     *
     * THE READ SIDE IS ONE CURSOR OVER THE PINNED SET. `changed` says nothing
     * about which field changed, so both cell views are marked by the one event:
     * the row-granular band. Eight cursors would be eight window re-derivations
     * and eight `fetch`es per write, each copying the collection's memory array
     * (`index23.cjs.js:447`), and the row would measure how many cursors the
     * adapter's author opened.
     */
    const pinnedIds: string[] = [];
    /** So a render places a fetched document without a scan. */
    const positionById = new Map<string, number>();
    let cellCursor: Cursor<TRow> | undefined;
    let stopCells: () => void = () => undefined;
    let cells: TCellConfig = { ids: [], ranks: [] };
    const labelText: string[] = [];
    const noteText: string[] = [];
    let cellsPending = false;
    // The FIRST TWO consumers of this wiring — A and B under `bind`. CAPTURED,
    // not read out of `views` inside a render: `pin` empties that list. The
    // targeted-delivery script is never bound per group.
    const labelConsumer = views[0].consumer;
    const noteConsumer = views[1].consumer;

    /**
     * Both cell views out of ONE fetch, because one event marked both. The
     * documents come back in the collection's order, not the pin's, so each is
     * placed by the position its id was pinned at. A row the collection no
     * longer holds leaves an EMPTY CELL rather than shortening the render.
     */
    const renderCells = (): void => {
        if (cellCursor === undefined) return;
        for (let i = 0; i < labelText.length; i++) {
            labelText[i] = '';
            noteText[i] = '';
        }
        const docs = cellCursor.fetch();
        for (let i = 0; i < docs.length; i++) {
            const at = positionById.get(docs[i].id);
            if (at === undefined) continue;
            labelText[at] = docs[i].label;
            noteText[at] = docs[i].note;
        }
        deliverCells(labelConsumer, cells, labelText);
        deliverCells(noteConsumer, cells, noteText);
    };

    return {
        /**
         * The branch is on PRESENCE of the id, see `written`.
         *
         * Wrapped in `collection.batch`, which defers the index rebuild to the
         * end. Without it the load would rebuild every index ten thousand times,
         * which measures the absence of a batch API rather than the library.
         */
        write: incoming => {
            batched(() => {
                for (let i = 0; i < incoming.length; i++) {
                    const row = incoming[i];
                    if (written.has(row.id)) {
                        collection.updateOne({ id: row.id }, { $set: { ...row } });
                        continue;
                    }
                    // Copied: the harness's arrays are not ours to keep.
                    collection.insert({ ...row });
                    written.add(row.id);
                }
            });
        },
        /**
         * `removeOne` per id inside `collection.batch`, for the reason `write`
         * uses it.
         *
         * THE OTHER END OF `written`: an id leaving the store leaves the Set in
         * the same call, so the untimed restore that writes the deleted rows
         * back finds them absent and goes to `insert`. `delete` is unconditional
         * because an id the store never held is not an error (`TBinding.remove`).
         */
        remove: ids => {
            batched(() => {
                for (let i = 0; i < ids.length; i++) {
                    collection.removeOne({ id: ids[i] });
                    written.delete(ids[i]);
                }
            });
        },
        patchLabel: (id, label) => {
            collection.updateOne({ id }, { $set: { label } });
        },
        patchNote: (id, note) => {
            collection.updateOne({ id }, { $set: { note } });
        },
        setGroup: (id, group) => {
            collection.updateOne({ id }, { $set: { group } });
        },
        setRank: (id, rank) => {
            collection.updateOne({ id }, { $set: { rank } });
        },
        frame: batched,
        /**
         * The window cursors go, and one cursor over the pinned ids takes their
         * place; the ids themselves are the address the two point writes below
         * use.
         */
        pin: config => {
            for (const state of views) {
                state.stop();
                state.cursor.cleanup();
            }
            views.length = 0;
            cells = config;
            pinnedIds.length = 0;
            positionById.clear();
            for (let i = 0; i < config.ids.length; i++) {
                pinnedIds.push(config.ids[i]);
                positionById.set(config.ids[i], i);
            }
            labelText.length = pinnedIds.length;
            noteText.length = pinnedIds.length;
            cellCursor = collection.find({ id: { $in: pinnedIds } });
            stopCells = cellCursor.observeChanges(
                {
                    added: () => {
                        cellsPending = true;
                    },
                    removed: () => {
                        cellsPending = true;
                    },
                    changed: () => {
                        cellsPending = true;
                    },
                },
                // The store is already loaded; the initial run is not a change.
                true
            );
            // Untimed: the state every sample starts from.
            renderCells();
        },
        // SignalDB has no cheaper address to offer.
        patchPinnedLabel: (at, label) => {
            collection.updateOne({ id: pinnedIds[at] }, { $set: { label } });
        },
        patchPinnedNote: (at, note) => {
            collection.updateOne({ id: pinnedIds[at] }, { $set: { note } });
        },
        // A batch boundary and nothing else: SignalDB is synchronous end to end,
        // its only deferral is `batch`, which `frame` and `write` close. This renders
        // the views the store already said had changed.
        settle: () => {
            if (cellsPending) {
                cellsPending = false;
                renderCells();
            }
            for (let i = 0; i < views.length; i++) {
                const state = views[i];
                if (!state.pending) continue;
                state.pending = false;
                deliver(state.consumer, state.cursor.fetch(), view.window);
            }
        },
        // The whole collection through the same cursor API the views use, with
        // no selector and no window — not either view's cursor, which answers
        // for one group's visible slice.
        readAll: () =>
            collection.find({}).fetch().map(row => ({
                id: row.id,
                group: row.group,
                rank: row.rank,
                label: row.label,
                note: row.note,
            })),
        deliverableRows: () => undefined,
        /**
         * A cursor over one group — the same derivation the views are, with the
         * window taken off. The library maintains this grouping itself, so it is
         * a genuine second witness: an index SignalDB rebuilt wrongly, or a
         * document its `match()` puts in the wrong slice, parts from the model
         * here.
         *
         * MINUS `limit`: an index has no window, and a document filed into the
         * wrong group below the window is as wrong as one at the top of it.
         *
         * A FRESH CURSOR AND NOT EITHER VIEW'S — both carry the window, there
         * are two against fifty groups, and `pin` cleans them up outright. This
         * one is cleaned up before the method returns, because a cursor left
         * alive is re-queried by every later write.
         */
        groupOrder: group => {
            const cursor = collection.find(
                { group },
                { sort: { rank: 1, id: 1 } }
            );
            const groupRows = cursor.fetch().map(row => ({
                id: row.id,
                group: row.group,
                rank: row.rank,
                label: row.label,
                note: row.note,
            }));
            cursor.cleanup();
            return orderedIdsOfRows(groupRows);
        },
        dispose: () => {
            for (const state of views) {
                state.stop();
                state.cursor.cleanup();
            }
            views.length = 0;
            // The cell cursor, if `pin` opened one: a cursor left observed is
            // re-queried by every later write.
            stopCells();
            stopCells = () => undefined;
            if (cellCursor !== undefined) cellCursor.cleanup();
            cellCursor = undefined;
            pinnedIds.length = 0;
            positionById.clear();
            written.clear();
            // Unregisters the collection from SignalDB's static registry, so a
            // rebuilt binding does not leave the old population behind.
            // `dispose` is async; the catch keeps a teardown failure from
            // becoming an unhandled rejection that kills the worker.
            collection.dispose().catch(() => undefined);
        },
    };
};

/**
 * A cursor plus `observeChanges` per subscriber, which is the pair this family is
 * about: it hands back a stop handle.
 * https://signaldb.js.org/reference/core/collection/
 *
 * NO `group` INDEX HERE, and that is not a saving taken quietly: the window
 * wiring indexes the column its views select on, and a churn binding selects on
 * nothing but `id`. An index SignalDB still holds is rebuilt over the whole
 * collection after every un-batched write, so keeping one for a query nobody makes
 * would put a population rebuild inside every churn frame.
 *
 * WHAT EACH SHAPE IS WIRED AS:
 *
 *  - ONE SOURCE — `find({ id })` and `observeChanges({ changed })`. Any column of
 *    that row is a change to the document, so the dependency is the ROW.
 *  - MANY SOURCES — `find({ id: { $in: ids } })`. ONE cursor and ONE observer over
 *    `count` documents, which is SignalDB's own way to say it.
 *  - A COLUMN — `find({ id }, { fields: { label: 1 } })`. The observer diffs what
 *    `getItems` returns and `getItems` applies the projection
 *    (`dist/index10.cjs.js`, `getItems`), so a `note` write produces an EQUAL
 *    projected document and `changed` is not called. A genuine column identity,
 *    built out of the library's own diff rather than out of an event that names a
 *    field.
 *  - A CHAIN — `find({ id: { $in } })` whose `observeChanges` writes each row's
 *    label into a `@preact/signals-core` signal, and `computed` levels stacked over
 *    those signals; SignalDB exports no computed, so the signals library supplies it.
 *  - A DIAMOND — the same bridge from one row's cursor into one signal, and two
 *    `computed` arms plus a `computed` join over it.
 *
 * THE MOUNT READ IS THE OBSERVER'S FIRST RUN: `skipInitial` is false and `added`
 * only reads, so registering is a mount and not also a wake-up, and the label
 * comes out of the one `getItems` registration already runs. A wake reads the
 * row `changed` carries.
 */
const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    const collection = new Collection<TRow>();
    /** The ids this adapter has written — `bindViews`' Set, for its reason. */
    const written = new Set<string>();
    const batched = createBatchFrame(run => collection.batch(run));

    let churnIds: readonly string[] = [];
    /** What each subscriber last read. */
    const churnRead: (string | undefined)[] = [];
    type TMounted = { cursor: Cursor<TRow>; stop: () => void };
    const mounted: (TMounted | undefined)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    const mountDerived = (
        at: number,
        from: number,
        count: number,
        derive: (labels: readonly Signal<string>[]) => ReadonlySignal<string>
    ): void => {
        const ids = churnIds.slice(from, from + count);
        const labels = ids.map(() => signal(''));
        const assign = (row: TRow): void => {
            labels[ids.indexOf(row.id)].value = row.label;
        };
        const cursor = collection.find(
            count === 1 ? { id: ids[0] } : { id: { $in: ids } }
        );
        const stopCursor = cursor.observeChanges(
            { added: assign, changed: assign },
            false
        );
        const head = derive(labels);
        let primed = false;
        const stopEffect = effect(() => {
            const text = head.value;
            churnRead[at] = text;
            if (!primed) {
                primed = true;
                return;
            }
            churnWoke++;
        });
        mounted[at] = {
            cursor,
            stop: () => {
                stopEffect();
                stopCursor();
            },
        };
    };

    return {
        write: incoming => {
            batched(() => {
                for (let i = 0; i < incoming.length; i++) {
                    const row = incoming[i];
                    if (written.has(row.id)) {
                        collection.updateOne(
                            { id: row.id },
                            { $set: { ...row } }
                        );
                        continue;
                    }
                    collection.insert({ ...row });
                    written.add(row.id);
                }
            });
        },
        remove: ids => {
            batched(() => {
                for (let i = 0; i < ids.length; i++) {
                    collection.removeOne({ id: ids[i] });
                    written.delete(ids[i]);
                }
            });
        },
        patchLabel: (id, label) => {
            collection.updateOne({ id }, { $set: { label } });
        },
        patchNote: (id, note) => {
            collection.updateOne({ id }, { $set: { note } });
        },
        setGroup: (id, group) => {
            collection.updateOne({ id }, { $set: { group } });
        },
        setRank: (id, rank) => {
            collection.updateOne({ id }, { $set: { rank } });
        },
        frame: batched,
        // A churn binding derives no view and no churn script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        // Every observer has already run: SignalDB re-queries its live cursors
        // inside the write.
        settle: () => {
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
        readAll: () =>
            collection.find({}).fetch().map(row => ({
                id: row.id,
                group: row.group,
                rank: row.rank,
                label: row.label,
                note: row.note,
            })),
        deliverableRows: () => undefined,
        /** NOTHING TO READ: no view is derived and no grouping is kept. */
        groupOrder: () => undefined,
        /** NOTHING TO RESOLVE: the id is the handle — see the window wiring's `pin`. */
        holdChurnRows: (ids, ranks) => {
            churnIds = ids;
            churnId = ids[0];
            churnRank = ranks[0];
            for (let i = 0; i < ids.length; i++) churnRead[i] = undefined;
        },
        mountOnRows: (at, from, count) => {
            const first = churnIds[from];
            const cursor = collection.find(
                count === 1
                    ? { id: first }
                    : { id: { $in: churnIds.slice(from, from + count) } }
            );
            const readFirst = (row: TRow): void => {
                if (row.id === first) churnRead[at] = row.label;
            };
            churnRead[at] = '';
            mounted[at] = {
                cursor,
                stop: cursor.observeChanges(
                    {
                        added: readFirst,
                        changed: row => {
                            churnWoke++;
                            readFirst(row);
                        },
                    },
                    false
                ),
            };
        },
        mountOnColumn: at => {
            const cursor = collection.find(
                { id: churnIds[0] },
                { fields: { label: 1 } }
            );
            const read = (row: TRow): void => {
                churnRead[at] = row.label;
            };
            churnRead[at] = '';
            mounted[at] = {
                cursor,
                stop: cursor.observeChanges(
                    {
                        added: read,
                        changed: row => {
                            churnWoke++;
                            read(row);
                        },
                    },
                    false
                ),
            };
        },
        mountOnChain: (at, from, count, depth) => {
            mountDerived(at, from, count, labels => {
                let below = computed(() => {
                    let text = labels[0].value;
                    for (let i = 1; i < labels.length; i++) {
                        text = `${text},${labels[i].value}`;
                    }
                    return chainLevelOf(text, 1);
                });
                for (let level = 2; level <= depth; level++) {
                    const under = below;
                    below = computed(() => chainLevelOf(under.value, level));
                }
                return below;
            });
        },
        mountOnDiamond: (at, from) => {
            mountDerived(at, from, 1, labels => {
                const root = labels[0];
                const left = computed(() => diamondLeftOf(root.value));
                const right = computed(() => diamondRightOf(root.value));
                return computed(() =>
                    diamondJoinOf(left.value, right.value)
                );
            });
        },
        /**
         * The observer STOPS and the cursor is CLEANED UP: a cursor left alive is
         * re-queried by every later write, so unsubscribing alone would price an
         * unmount at a callback removal and leave the work standing.
         */
        unmount: at => {
            const held = mounted[at];
            if (held === undefined) return;
            held.stop();
            held.cursor.cleanup();
            mounted[at] = undefined;
            churnRead[at] = undefined;
        },
        dispose: () => {
            for (let i = 0; i < mounted.length; i++) {
                const held = mounted[i];
                if (held === undefined) continue;
                held.stop();
                held.cursor.cleanup();
            }
            mounted.length = 0;
            churnRead.length = 0;
            written.clear();
            collection.dispose().catch(() => undefined);
        },
    };
};

/**
 * THE SECOND PREDICATE IS A SELECTOR, NOT A FILTER OVER THE RESULT. The axis is a
 * fact about the KEY — the third character from the end is even — and a
 * document store says that with `$regex` on `id`. So SignalDB evaluates both
 * predicates inside the query and this adapter evaluates neither.
 *
 * THE OFFSET IS `skip`, WHICH A CURSOR TAKES AT CONSTRUCTION, so a scroll builds a
 * NEW cursor at the new offset and observes it, as a view switch does at the new
 * group. That is SignalDB's model — a
 * cursor IS a query — and it is what this row prices against a store that moves
 * a window it already maintains.
 */
const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const collection = new Collection<TRow>({
        indices: [createIndex('group')],
    });
    /** The ids this adapter has written — `bindViews`' Set, for its reason. */
    const written = new Set<string>();
    const batched = createBatchFrame(run => collection.batch(run));

    let offset = 0;
    let pagedGroup = view.groupA;
    const pagedCursorOf = (): Cursor<TRow> =>
        collection.find(
            { group: pagedGroup },
            { sort: { rank: 1, id: 1 }, skip: offset, limit: view.window }
        );
    let pagedCursor = pagedCursorOf();
    let stopPaged: () => void = () => undefined;
    let pagedPending = false;

    const observePaged = (): void => {
        const mark = (): void => {
            pagedPending = true;
        };
        stopPaged = pagedCursor.observeChanges(
            { added: mark, removed: mark, changed: mark, movedBefore: mark },
            true
        );
    };
    observePaged();

    const repointPaged = (): void => {
        stopPaged();
        pagedCursor.cleanup();
        pagedCursor = pagedCursorOf();
        observePaged();
        pagedPending = true;
    };

    /**
     * The axis, as a selector: `onSecondAxis` is "the third character from the
     * end of the key is even", and this is that predicate in the query language.
     */
    const onAxisCursor = collection.find(
        { group: view.groupA, id: { $regex: '[02468][0-9][0-9]$' } },
        { sort: { rank: 1, id: 1 }, limit: view.window }
    );
    let axisPending = false;
    const markAxis = (): void => {
        axisPending = true;
    };
    const stopAxis = onAxisCursor.observeChanges(
        {
            added: markAxis,
            removed: markAxis,
            changed: markAxis,
            movedBefore: markAxis,
        },
        true
    );

    return {
        write: incoming => {
            batched(() => {
                for (let i = 0; i < incoming.length; i++) {
                    const row = incoming[i];
                    if (written.has(row.id)) {
                        collection.updateOne(
                            { id: row.id },
                            { $set: { ...row } }
                        );
                        continue;
                    }
                    collection.insert({ ...row });
                    written.add(row.id);
                }
            });
        },
        remove: ids => {
            batched(() => {
                for (let i = 0; i < ids.length; i++) {
                    collection.removeOne({ id: ids[i] });
                    written.delete(ids[i]);
                }
            });
        },
        patchLabel: (id, label) => {
            collection.updateOne({ id }, { $set: { label } });
        },
        patchNote: (id, note) => {
            collection.updateOne({ id }, { $set: { note } });
        },
        setGroup: (id, group) => {
            collection.updateOne({ id }, { $set: { group } });
        },
        setRank: (id, rank) => {
            collection.updateOne({ id }, { $set: { rank } });
        },
        frame: batched,
        // No read script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        // The id provider resolves `$in` key by key, so the page comes back in key order (index22.mjs:12-42).
        readKeys: (from, count) => {
            const page = collection
                .find({ id: { $in: plan.readKeys.slice(from, from + count) } })
                .fetch();
            deliverPage(consumers.a, page, 0, count);
        },
        /**
         * A NEW CURSOR AT THE NEW `skip`, observed, and the old one stopped and
         * cleaned up — a cursor left alive is re-queried by every later write.
         * Nothing is written and no ordering is re-derived by hand.
         */
        scrollTo: to => {
            offset = to;
            repointPaged();
        },
        switchGroup: group => {
            pagedGroup = group;
            offset = 0;
            repointPaged();
        },
        settle: () => {
            if (pagedPending) {
                pagedPending = false;
                deliverPage(consumers.a, pagedCursor.fetch(), 0, view.window);
            }
            if (axisPending) {
                axisPending = false;
                deliverPage(consumers.b, onAxisCursor.fetch(), 0, view.window);
            }
        },
        readAll: () =>
            collection.find({}).fetch().map(row => ({
                id: row.id,
                group: row.group,
                rank: row.rank,
                label: row.label,
                note: row.note,
            })),
        deliverableRows: () => undefined,
        groupOrder: group => {
            const cursor = collection.find(
                { group },
                { sort: { rank: 1, id: 1 } }
            );
            const groupRows = cursor.fetch().map(row => ({
                id: row.id,
                group: row.group,
                rank: row.rank,
                label: row.label,
                note: row.note,
            }));
            cursor.cleanup();
            return orderedIdsOfRows(groupRows);
        },
        dispose: () => {
            stopPaged();
            pagedCursor.cleanup();
            stopAxis();
            onAxisCursor.cleanup();
            written.clear();
            collection.dispose().catch(() => undefined);
        },
    };
};

/**
 * ONE PAIR RECORD AS A SIGNALDB DOCUMENT. A `Collection` keys on `id`, so the
 * composed address IS the document id — and `owner` and `row` are stored as
 * FIELDS as well, so the audit can read the address back out of the record rather
 * than out of the key this file composed.
 */
type TPairDoc = { id: string; owner: string; row: string; mark: string };

/**
 * TWO ENTITY TYPES — THREE `Collection`s, which is the shape SignalDB is built
 * around. No field index in it at all: the two relation views derive no window,
 * no group and no sort, so there is nothing to select on and `createIndex` would
 * be an index built for nothing.
 * https://signaldb.js.org/reference/core/collection/
 *
 * THE SUBSCRIPTION IS ONE CURSOR PER VIEW over exactly the records that view
 * derives from — `owners.find({ id: { $in: touched } })` for the join view,
 * `pairs.find({ id: { $in: pairIds } })` for the pair view — with
 * `observeChanges(…, true)` on each, so registering is a mount and not also a
 * wake-up. Neither cursor names the other's collection, so an owner write cannot
 * reach the pair view and a mark write cannot reach the join view.
 *
 * EACH DELIVERY IS ONE `fetch` OF THE CURSOR THAT VIEW OBSERVES, each document
 * placed on its lines by an id-to-lines map built in `holdRelation` — address, not
 * value. NO VALUE IS CACHED BETWEEN DELIVERIES: `idIndex` is private and there is
 * no document handle a caller may hold, so the id is the handle and
 * `patchOwnerName` pays what a keyed write pays.
 */
const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    const collection = new Collection<TRow>();
    const owners = new Collection<TOwner>();
    const pairs = new Collection<TPairDoc>();
    /** The ids this adapter has written — `bindViews`' Set, for its reason. */
    const written = new Set<string>();
    const batched = createBatchFrame(run => collection.batch(run));
    // A frame batches owners and pairs only: closing a batch rebuilds that collection's whole id index (index23.mjs:396-403).
    const batchedOwnersAndPairs = createBatchFrame(run =>
        owners.batch(() => pairs.batch(run))
    );

    let config: TRelationConfig = {
        ids: [],
        ranks: [],
        owners: [],
        touched: [],
        names: [],
        seeds: [],
    };
    /** The owner ids the join script writes, in `config.touched` order. */
    const touchedIds: string[] = [];
    /** The pair documents' ids, in `ids` order — composed once, for the pair cursor. */
    const pairIds: string[] = [];
    type TWatched = { cursor: Cursor<TOwner> | Cursor<TPairDoc>; stop: () => void };
    const watched: TWatched[] = [];
    const ownerLines = new Map<string, number[]>();
    const pairLine = new Map<string, number>();
    let nameCursor: Cursor<TOwner> | undefined;
    let markCursor: Cursor<TPairDoc> | undefined;
    const nameText: string[] = [];
    const markText: string[] = [];
    let namesPending = false;
    let marksPending = false;

    const pairKey = (owner: string, row: string): string => `${owner} ${row}`;

    const renderNames = (): void => {
        if (nameCursor === undefined) return;
        for (let i = 0; i < nameText.length; i++) nameText[i] = '';
        const docs = nameCursor.fetch();
        for (let i = 0; i < docs.length; i++) {
            const lines = ownerLines.get(docs[i].id);
            if (lines === undefined) continue;
            for (let n = 0; n < lines.length; n++) nameText[lines[n]] = docs[i].name;
        }
        deliverRelation(consumers.a, config, nameText);
    };

    const renderMarks = (): void => {
        if (markCursor === undefined) return;
        for (let i = 0; i < markText.length; i++) markText[i] = '';
        const docs = markCursor.fetch();
        for (let i = 0; i < docs.length; i++) {
            const at = pairLine.get(docs[i].id);
            if (at === undefined) continue;
            markText[at] = docs[i].mark;
        }
        deliverRelation(consumers.b, config, markText);
    };

    return {
        write: incoming => {
            batched(() => {
                for (let i = 0; i < incoming.length; i++) {
                    const row = incoming[i];
                    if (written.has(row.id)) {
                        collection.updateOne(
                            { id: row.id },
                            { $set: { ...row } }
                        );
                        continue;
                    }
                    collection.insert({ ...row });
                    written.add(row.id);
                }
            });
        },
        remove: ids => {
            batched(() => {
                for (let i = 0; i < ids.length; i++) {
                    collection.removeOne({ id: ids[i] });
                    written.delete(ids[i]);
                }
            });
        },
        patchLabel: (id, label) => {
            collection.updateOne({ id }, { $set: { label } });
        },
        patchNote: (id, note) => {
            collection.updateOne({ id }, { $set: { note } });
        },
        setGroup: (id, group) => {
            collection.updateOne({ id }, { $set: { group } });
        },
        setRank: (id, rank) => {
            collection.updateOne({ id }, { $set: { rank } });
        },
        frame: batchedOwnersAndPairs,
        // No relation script pins: the targeted-delivery script is a two-view
        // script and is bound by `bind`.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        writeOwners: incoming => {
            batchedOwnersAndPairs(() => {
                for (let i = 0; i < incoming.length; i++) {
                    const owner = incoming[i];
                    owners.insert({ id: owner.id, name: owner.name });
                }
            });
        },
        /**
         * THE PAIR DOCUMENTS AT THEIR SEEDS AND THE TWO OBSERVED CURSORS. The
         * documents are inserted BEFORE either cursor exists, so the mint reaches
         * nobody and every timed step is `updateOne` on a document already filed.
         *
         * `skipInitial` is true, so the untimed opening delivery this method owes
         * is made explicitly afterwards.
         */
        holdRelation: given => {
            config = given;
            nameText.length = given.ids.length;
            markText.length = given.ids.length;
            for (let at = 0; at < given.touched.length; at++) {
                touchedIds.push(given.touched[at]);
            }
            batchedOwnersAndPairs(() => {
                for (let i = 0; i < given.ids.length; i++) {
                    const owner = given.owners[i];
                    const row = given.ids[i];
                    const key = pairKey(owner, row);
                    pairIds.push(key);
                    pairLine.set(key, i);
                    const lines = ownerLines.get(owner);
                    if (lines === undefined) ownerLines.set(owner, [i]);
                    else lines.push(i);
                    pairs.insert({
                        id: key,
                        owner,
                        row,
                        mark: given.seeds[i],
                    });
                }
            });
            nameCursor = owners.find({ id: { $in: touchedIds } });
            watched.push({
                cursor: nameCursor,
                stop: nameCursor.observeChanges(
                    {
                        changed: () => {
                            namesPending = true;
                        },
                    },
                    true
                ),
            });
            markCursor = pairs.find({ id: { $in: pairIds } });
            watched.push({
                cursor: markCursor,
                stop: markCursor.observeChanges(
                    {
                        changed: () => {
                            marksPending = true;
                        },
                    },
                    true
                ),
            });
            renderNames();
            renderMarks();
        },
        /**
         * ONE `updateOne` IN THE OWNERS COLLECTION — the id is the handle here.
         * Only the join view's cursor covers that collection, so the pair view is
         * not re-queried at all.
         */
        patchOwnerName: (at, name) => {
            owners.updateOne({ id: config.touched[at] }, { $set: { name } });
        },
        /**
         * COMPOSE THE ADDRESS AND UPDATE THE DOCUMENT AT IT. The string is built
         * fresh every call: caching eight of them would make the row a measurement
         * of an array read.
         */
        writePair: (at, mark) => {
            pairs.updateOne(
                { id: pairKey(config.owners[at], config.ids[at]) },
                { $set: { mark } }
            );
        },
        // Each view renders only when its OWN cursor reported a change; both
        // have already run, SignalDB re-queries its live cursors in the write.
        settle: () => {
            if (namesPending) {
                namesPending = false;
                renderNames();
            }
            if (marksPending) {
                marksPending = false;
                renderMarks();
            }
        },
        readAll: () =>
            collection.find({}).fetch().map(row => ({
                id: row.id,
                group: row.group,
                rank: row.rank,
                label: row.label,
                note: row.note,
            })),
        deliverableRows: () => undefined,
        /** NOTHING TO READ: no window, no group, no sort, no grouping kept. */
        groupOrder: () => undefined,
        readOwners: (): readonly TOwner[] =>
            owners.find({}).fetch().map(owner => ({
                id: owner.id,
                name: owner.name,
            })),
        /**
         * EVERY PAIR RECORD, WITH THE ADDRESS READ OUT OF ITS OWN FIELDS and not
         * out of the document id — that id is this file's own composition, so
         * answering from it would make the audit agree with whatever the
         * composition did.
         */
        readPairs: (): readonly TPairRow[] =>
            pairs.find({}).fetch().map(pair => ({
                owner: pair.owner,
                row: pair.row,
                mark: pair.mark,
            })),
        dispose: () => {
            for (let i = 0; i < watched.length; i++) {
                watched[i].stop();
                watched[i].cursor.cleanup();
            }
            watched.length = 0;
            nameCursor = undefined;
            markCursor = undefined;
            ownerLines.clear();
            pairLine.clear();
            touchedIds.length = 0;
            pairIds.length = 0;
            nameText.length = 0;
            markText.length = 0;
            written.clear();
            collection.dispose().catch(() => undefined);
            owners.dispose().catch(() => undefined);
            pairs.dispose().catch(() => undefined);
        },
    };
};


/* ── one value, one subscriber, and a second value beside it ───────────── */

/**
 * SIGNALDB HAS NO SCALAR, and the row says so rather than declining: its whole
 * export surface is collections, cursors, indexes and reactivity adapters, so the
 * smallest thing that can hold a value here is a DOCUMENT, and the smallest
 * subscriber is a cursor over the one document that holds it. That is a departure
 * from the task's shape and not from SignalDB's documentation — the library is
 * being asked for the nearest thing it has — and it is what the number should be
 * read as: a keyed document standing in for a value.
 */
const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
    type TValueDoc = { id: string; value: string };
    const collection = new Collection<TValueDoc>();
    const stop: (() => void)[] = [];
    let name = '';
    let bystanderName = '';
    let read = '';
    let readBystander = '';
    let woke = false;
    let wokeBystander = false;

    const valueOf = (id: string): string => collection.findOne({ id })?.value ?? '';

    return {
        ...noRowStore('signaldb'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            collection.insert({ id: name, value: config.seeds[0] });
            collection.insert({ id: bystanderName, value: config.seeds[1] });
            read = config.seeds[0];
            readBystander = config.seeds[1];
            const cursor = collection.find({ id: name });
            stop.push(
                cursor.observeChanges(
                    {
                        changed: doc => {
                            read = doc.value;
                            woke = true;
                        },
                    },
                    true
                )
            );
            const bystanderCursor = collection.find({ id: bystanderName });
            stop.push(
                bystanderCursor.observeChanges(
                    {
                        changed: doc => {
                            readBystander = doc.value;
                            wokeBystander = true;
                        },
                    },
                    true
                )
            );
            deliverSingle(consumers.a, name, read);
            deliverSingle(consumers.b, bystanderName, readBystander);
        },
        writeSingle: next => {
            collection.updateOne({ id: name }, { $set: { value: next } });
        },
        readSingle: () => valueOf(name),
        readBystander: () => valueOf(bystanderName),
        frame: createBatchFrame(run => collection.batch(run)),
        // Every observer has already run: SignalDB re-queries its live cursors
        // inside the write.
        settle: () => {
            if (woke) {
                woke = false;
                deliverSingle(consumers.a, name, read);
            }
            if (wokeBystander) {
                wokeBystander = false;
                deliverSingle(consumers.b, bystanderName, readBystander);
            }
        },
        dispose: () => {
            for (let i = 0; i < stop.length; i++) stop[i]();
            stop.length = 0;
            collection.dispose().catch(() => undefined);
        },
    };
};

export const signaldbAdapter: TAdapter = {
    name: 'signaldb',
    version: '1.8.1',
    docs: 'https://signaldb.js.org/reference/core/collection/',
    departure:
        'run with NO reactivity adapter installed — SignalDB takes its reactivity from Angular, Vue ' +
        'or Solid in every documented example, and installing one would measure that framework — so ' +
        'observeChanges drives the consumer instead; and the documented updateOne({ upsert: true }) ' +
        'is split into insert/updateOne on an adapter-side id Set, because its absent-row path ' +
        'copies and scans the whole collection twice. A frame is one collection.batch, opened once ' +
        'per frame because batch does not nest. On the wide mount shape one $in cursor observes ' +
        'every churn row it is asked for and its body keeps the first one\'s label out of the rows ' +
        'added and changed carry. The ' +
        'chain and diamond shapes bridge a cursor\'s observeChanges into @preact/signals-core signals ' +
        'and derive through its computed, since SignalDB exports no computed and no reactivity ' +
        'adapter is installed. A scroll or a view switch builds a new cursor, since ' +
        'a cursor takes its selector and skip at construction.',
    admission:
        'the row values live in a SignalDB Collection\'s documents and the change signal is the ' +
        'library\'s own cursor observeChanges, fired from the collection\'s write inside ' +
        'Observer.runChecks; the adapter-side `written` Set holds ids only, to choose insert over ' +
        'updateOne, and no row value is in it.',

    reads: readShapes((consumers, view, plan) =>
        bindReadStore(consumers, view, plan)
    ),
    churn: churnShapes(consumers => bindChurnStore(consumers.a)),
    relations: {
        build: consumers => bindRelationStore(consumers),
        absent: '',
    },
    single: {
        build: consumers => bindSingleStore(consumers),
        absent: '',
    },

    bind: (consumers, view) =>
        bindViews(
            [
                { group: view.groupA, consumer: consumers.a },
                { group: view.groupB, consumer: consumers.b },
            ],
            view
        ),
    // The same body, handed fifty views instead of two: the builders differ by
    // the view list and by nothing else, so this row compares libraries rather
    // than wirings.
    bindPerGroup: (consumers, view) => bindViews(consumers.views, view),
};
