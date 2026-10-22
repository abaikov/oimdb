import { createQueries, createStore } from 'tinybase';
import type { Ids, Queries, Store } from 'tinybase';
import type {
    BenchConsumer,
    TConsumers,
    TViewBinding,
} from '../harness/consumer';
import { onSecondAxis } from '../harness/dataset';
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

/** One table, keyed by the row id. TinyBase's row id IS the primary key. */
const TABLE = 'rows';
// A TinyBase store holds several tables, which is what lets a second entity type be a
// second table rather than more columns on the first. The rest: `tinybase.md`.
const OWNERS_TABLE = 'owners';
const PAIRS_TABLE = 'pairs';

const ORDER_CELL = 'order';
const RANK_OFFSET = 1e15;

// Ranks are integers inside ±1e15, so offset and padded the string sorts as `compareRows` does.
const orderKeyOf = (rank: number, rowId: string): string =>
    `${String(rank + RANK_OFFSET).padStart(16, '0')} ${rowId}`;

const transactionFrameOf =
    (store: Store) =>
    (run: () => void): void => {
        store.transaction(run);
    };

type TCellWrites = Pick<TBinding, 'remove' | 'patchLabel' | 'patchNote' | 'setGroup' | 'setRank'>;

// One TinyBase transaction per write call; inside a frame's it nests. The rest: `tinybase.md`.
const transactedStoreOf = () => {
    const store = createStore();
    const setCell = (rowId: string, cellId: string, value: string | number): void => {
        store.setCell(TABLE, rowId, cellId, value);
    };
    const cellWrites: TCellWrites = {
        remove: ids =>
            store.transaction(() => {
                for (let i = 0; i < ids.length; i++) store.delRow(TABLE, ids[i]);
            }),
        patchLabel: (id, label) => setCell(id, 'label', label),
        patchNote: (id, note) => setCell(id, 'note', note),
        setGroup: (id, group) => setCell(id, 'group', group),
        // Kept a number: the sort is on this cell, and a string here would order
        // 1000 before 200.
        setRank: (id, rank) => setCell(id, 'rank', rank),
    };
    return { store, setCell, cellWrites, frame: transactionFrameOf(store) };
};

// The STORE's table, cell by cell — never a query result. The rest: `tinybase.md`.
const rowsOf = (store: Store): TRow[] =>
    Object.entries(store.getTable(TABLE)).map(([id, row]) => ({ ...row, id }) as TRow);

// A query — TinyBase's own grouping structure, so a genuine second witness: a
// `where('group', …)` that lost a row on a `setCell`, or kept one a group move took
// out, parts from the model here. The rest: `tinybase.md`.
const groupOrderOf = (queries: Queries, group: string): readonly string[] => {
    queries.setQueryDefinition('audit', TABLE, ({ select, where }) => {
        select('rank');
        where('group', group);
    });
    const groupRows = Object.entries(queries.getResultTable('audit')).map(
        ([id, row]): TRow => ({ id, group, rank: row.rank as number, label: '', note: '' })
    );
    queries.delQueryDefinition('audit');
    return orderedIdsOfRows(groupRows);
};

type TWindowView = {
    queryId: string;
    consumer: BenchConsumer;
    /** The window's row ids, in TinyBase's order. Owned by its listener. */
    ids: Ids;
    shapeListener: string;
    /** Set by the shape listener: the window's ids may have moved. */
    shapeMoved: boolean;
    /** Some listener of this view fired since the last render. */
    pending: boolean;
    /** Content listener id by row id, one per row currently in the window. */
    watching: Map<string, string>;
    // Row holders, allocated once and overwritten. The rest: `tinybase.md`.
    pool: TRow[];
    visible: TRow[];
};

const windowViewOf = (queryId: string, group: string, consumer: BenchConsumer, window: number): TWindowView => ({
    queryId,
    consumer,
    ids: [],
    shapeListener: '',
    shapeMoved: false,
    pending: false,
    watching: new Map(),
    pool: Array.from({ length: window }, () => ({ id: '', group, rank: 0, label: '', note: '' })),
    visible: [],
});

// TinyBase maintains the sorted, windowed id list itself, so the adapter never sorts the
// group's 200 rows to find its first 32 — and this is the only thing that can tell the
// content subscriptions they now point at the wrong rows, hence `shapeMoved` and not just
// `pending`. The rest: `tinybase.md`.
const watchShape = (queries: Queries, state: TWindowView, from: number, window: number): void => {
    state.shapeListener = queries.addResultSortedRowIdsListener(
        state.queryId,
        ORDER_CELL,
        false,
        from,
        window,
        (_queries, _tableId, _cellId, _descending, _offset, _limit, sortedRowIds) => {
            state.ids = sortedRowIds;
            state.shapeMoved = true;
            state.pending = true;
        }
    );
};

const unwatchRows = (queries: Queries, state: TWindowView): void => {
    for (const listenerId of state.watching.values()) queries.delListener(listenerId);
    state.watching.clear();
};

const rewatchRows = (queries: Queries, state: TWindowView, upto: number): void => {
    const ids = state.ids;
    for (const [rowId, listenerId] of state.watching) {
        const at = ids.indexOf(rowId);
        if (at !== -1 && at < upto) continue;
        queries.delListener(listenerId);
        state.watching.delete(rowId);
    }
    for (let i = 0; i < upto; i++) {
        if (state.watching.has(ids[i])) continue;
        state.watching.set(
            ids[i],
            queries.addResultRowListener(state.queryId, ids[i], () => {
                state.pending = true;
            })
        );
    }
};

// The same read, plus the content subscriptions moved onto the rows the window
// shows NOW; a row that stays keeps its listener. The rest: `tinybase.md`.
const renderWindow = (queries: Queries, state: TWindowView, window: number): void => {
    const ids = state.ids;
    const upto = ids.length < window ? ids.length : window;
    state.visible.length = 0;
    for (let i = 0; i < upto; i++) {
        const holder = state.pool[i];
        holder.id = ids[i];
        // TinyBase cells are `string | number | boolean`; the store validated these two
        // on the way in, so the runtime shape is known where the type is not.
        holder.rank = queries.getResultCell(state.queryId, ids[i], 'rank') as number;
        holder.label = queries.getResultCell(state.queryId, ids[i], 'label') as string;
        state.visible.push(holder);
    }
    if (!state.shapeMoved) return;
    state.shapeMoved = false;
    rewatchRows(queries, state, upto);
};

// Recipe: `createQueries` — TinyBase's own derived-table primitive, one query per view,
// with the window read through `addResultSortedRowIdsListener`. The rest:
// `tinybase.md`.
const bindViews = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    const { store, setCell, cellWrites, frame } = transactedStoreOf();
    const queries = createQueries(store);

    // ONE QUERY PER VIEW — two, or fifty. TinyBase maintains every query's result table
    // on write; what stays narrow is the DELIVERY, because a listener only fires for a
    // result that changed. The rest: `tinybase.md`.
    const views = bindings.map(bound => {
        queries.setQueryDefinition(bound.group, TABLE, ({ select, where }) => {
            // Exactly the columns the consumer reads; `note` is LEFT OUT so a
            // write to it cannot reach a listener.
            select('rank');
            select('label');
            select((getTableCell, rowId) => orderKeyOf(getTableCell('rank') as number, rowId)).as(ORDER_CELL);
            where('group', bound.group);
        });
        const state = windowViewOf(bound.group, bound.group, bound.consumer, view.window);
        watchShape(queries, state, 0, view.window);
        return state;
    });

    // THE CELL WIRING, empty until `pin`. The rest: `tinybase.md`.
    const cellListenerIds: string[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };
    const labelText: string[] = [];
    const noteText: string[] = [];
    let labelPending = false;
    let notePending = false;

    /** Read back through `getCell` — the store's own accessor. */
    const renderCells = (column: 'label' | 'note', consumer: BenchConsumer, text: string[]): void => {
        for (let i = 0; i < cells.ids.length; i++) text[i] = store.getCell(TABLE, cells.ids[i], column) as string;
        deliverCells(consumer, cells, text);
    };

    return {
        ...cellWrites,
        // `setRow` for every row, whatever the store holds; the row id is the key
        // and not a cell. The rest: `tinybase.md`.
        write: rows =>
            store.transaction(() => {
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    store.setRow(TABLE, row.id, { group: row.group, rank: row.rank, label: row.label, note: row.note });
                }
            }),
        // The window wiring goes: both sorted-row-id listeners, every per-row result
        // listener, and the query DEFINITIONS. The rest: `tinybase.md`.
        pin: config => {
            for (const state of views) {
                unwatchRows(queries, state);
                queries.delListener(state.shapeListener);
                // A query TinyBase still holds is a result table it maintains on every
                // write, and this row must not be charged for two derived tables nothing
                // renders. The rest: `tinybase.md`.
                queries.delQueryDefinition(state.queryId);
            }
            views.length = 0;
            cells = config;
            for (let i = 0; i < config.ids.length; i++) {
                cellListenerIds.push(
                    store.addCellListener(TABLE, config.ids[i], 'label', () => {
                        labelPending = true;
                    }),
                    store.addCellListener(TABLE, config.ids[i], 'note', () => {
                        notePending = true;
                    })
                );
            }
            // Untimed: the state every sample starts from.
            renderCells('label', bindings[0].consumer, labelText);
            renderCells('note', bindings[1].consumer, noteText);
        },
        patchPinnedLabel: (at, label) => setCell(cells.ids[at], 'label', label),
        patchPinnedNote: (at, note) => setCell(cells.ids[at], 'note', note),
        frame,
        settle: () => {
            // The cell views, if `pin` installed any: each is rendered only when its
            // OWN cell listener fired. The rest: `tinybase.md`.
            if (labelPending) {
                labelPending = false;
                renderCells('label', bindings[0].consumer, labelText);
            }
            if (notePending) {
                notePending = false;
                renderCells('note', bindings[1].consumer, noteText);
            }
            for (let i = 0; i < views.length; i++) {
                const state = views[i];
                if (!state.pending) continue;
                state.pending = false;
                renderWindow(queries, state, view.window);
                deliver(state.consumer, state.visible, view.window);
            }
        },
        readAll: () => rowsOf(store),
        deliverableRows: () => undefined,
        groupOrder: group => groupOrderOf(queries, group),
        dispose: () => {
            // The load scenario rebuilds from empty between samples, so a
            // teardown that left 64 result-row listeners standing would hand the
            // next timed region subscribers still being told about writes.
            for (const state of views) {
                unwatchRows(queries, state);
                queries.delListener(state.shapeListener);
            }
            for (const listenerId of cellListenerIds) store.delListener(listenerId);
            queries.destroy();
            store.delTables();
        },
    };
};

const resultTextOf = (queries: Queries, queryId: string, rowId: string, cellId: string): string =>
    (queries.getResultCell(queryId, rowId, cellId) as string) ?? '';

// The same table and the same cells, and no queries but the ones a chain subscriber
// builds for itself, because a query TinyBase still holds is a result table it
// maintains on every write. The rest: `tinybase.md`.
const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    const { store, cellWrites, frame } = transactedStoreOf();
    const queries = createQueries(store);

    let churnIds: readonly string[] = [];
    const churnRead: (string | undefined)[] = [];
    /** Per subscriber: what gives its listeners and queries back. */
    const mounted: ((() => void) | undefined)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    /** Read back through the store's own accessor. */
    const labelAt = (at: number): string =>
        (store.getCell(TABLE, churnIds[at], 'label') as string) ?? '';

    const unmount = (at: number): void => {
        mounted[at]?.();
        mounted[at] = undefined;
        churnRead[at] = undefined;
    };

    return {
        ...cellWrites,
        write: rows =>
            store.transaction(() => {
                for (let i = 0; i < rows.length; i++) store.setRow(TABLE, rows[i].id, rows[i]);
            }),
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        // Every write's transaction has finished by now, and finishing is what runs
        // TinyBase's listeners, the result listeners of chained queries included.
        settle: () => {
            if (churnWoke === 0) return;
            deliverChurn(churnConsumer, churnId, churnRank, churnWoke, churnRead);
            churnWoke = 0;
        },
        readAll: () => rowsOf(store),
        deliverableRows: () => undefined,
        groupOrder: () => undefined,
        /** NOTHING TO RESOLVE: the id is the handle — see the window wiring's `pin`. */
        holdChurnRows: (ids, ranks) => {
            churnIds = ids;
            churnId = ids[0];
            churnRank = ranks[0];
            for (let i = 0; i < ids.length; i++) churnRead[i] = undefined;
        },
        mountOnRows: (at, from, count) => {
            const listeners: string[] = new Array(count);
            for (let i = 0; i < count; i++) {
                listeners[i] = store.addRowListener(TABLE, churnIds[from + i], () => {
                    churnWoke++;
                    churnRead[at] = labelAt(from);
                });
            }
            mounted[at] = () => {
                for (let i = 0; i < listeners.length; i++) store.delListener(listeners[i]);
            };
            churnRead[at] = labelAt(from);
        },
        mountOnColumn: at => {
            const listener = store.addCellListener(TABLE, churnIds[0], 'label', () => {
                churnWoke++;
                churnRead[at] = labelAt(0);
            });
            mounted[at] = () => store.delListener(listener);
            churnRead[at] = labelAt(0);
        },
        // THE CHAIN IS QUERIES FROM QUERIES: a root query over the subscriber's rows,
        // then `depth - 1` queries each rooted on the result of the one below, and a
        // result cell listener on the head. The rest: `tinybase.md`.
        mountOnChain: (at, from, count, depth) => {
            const roots = new Set(churnIds.slice(from, from + count));
            const queryIds: string[] = new Array(depth);
            queryIds[0] = `chain:${at}:0`;
            queries.setQueryDefinition(queryIds[0], TABLE, ({ select, where }) => {
                select('group');
                select('rank');
                select('note');
                select(getTableCell => chainLevelOf(getTableCell('label') as string, 1)).as('label');
                where(getTableCell => roots.has(getTableCell('id') as string));
            });
            for (let level = 2; level <= depth; level++) {
                queryIds[level - 1] = `chain:${at}:${level - 1}`;
                queries.setQueryDefinition(queryIds[level - 1], true, queryIds[level - 2], ({ select }) => {
                    select(getTableCell => chainLevelOf(getTableCell('label') as string, level)).as('label');
                });
            }
            const headId = queryIds[depth - 1];
            const firstId = churnIds[from];
            const listener = queries.addResultCellListener(headId, firstId, 'label', () => {
                churnWoke++;
                churnRead[at] = resultTextOf(queries, headId, firstId, 'label');
            });
            churnRead[at] = resultTextOf(queries, headId, firstId, 'label');
            mounted[at] = () => {
                queries.delListener(listener);
                for (let level = depth - 1; level >= 0; level--) queries.delQueryDefinition(queryIds[level]);
            };
        },
        mountOnDiamond: (at, from) => {
            const rowId = churnIds[from];
            const leftId = `diamond:${at}:left`;
            const rightId = `diamond:${at}:right`;
            const joinId = `diamond:${at}:join`;
            queries.setQueryDefinition(leftId, TABLE, ({ select, where }) => {
                select(getTableCell => diamondLeftOf(getTableCell('label') as string)).as('left');
                where('id', rowId);
            });
            queries.setQueryDefinition(rightId, TABLE, ({ select, where }) => {
                select(getTableCell => diamondRightOf(getTableCell('label') as string)).as('right');
                where('id', rowId);
            });
            queries.setQueryDefinition(joinId, true, leftId, ({ select, join }) => {
                join(true, rightId, (_getCell, leftRowId) => leftRowId);
                select(getTableCell =>
                    diamondJoinOf(getTableCell('left') as string, getTableCell(true, rightId, 'right') as string)
                ).as('join');
            });
            const listener = queries.addResultCellListener(joinId, rowId, 'join', () => {
                churnWoke++;
                churnRead[at] = resultTextOf(queries, joinId, rowId, 'join');
            });
            churnRead[at] = resultTextOf(queries, joinId, rowId, 'join');
            mounted[at] = () => {
                queries.delListener(listener);
                for (const queryId of [joinId, rightId, leftId]) queries.delQueryDefinition(queryId);
            };
        },
        unmount,
        dispose: () => {
            for (let at = 0; at < mounted.length; at++) unmount(at);
            queries.destroy();
            store.delTables();
        },
    };
};

// THE SECOND PREDICATE IS TINYBASE'S OWN `where(callback)`, reading the row's `id`
// cell: the axis is derived from the key and the key is stored as a cell, so the filter
// runs inside the query rather than over its result. The rest: `tinybase.md`.
const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const { store, cellWrites, frame } = transactedStoreOf();
    const queries = createQueries(store);

    queries.setQueryDefinition(
        'paged',
        TABLE,
        ({ select, where, param }) => {
            select('rank');
            select('label');
            select((getTableCell, rowId) => orderKeyOf(getTableCell('rank') as number, rowId)).as(ORDER_CELL);
            where('group', param('group') as string);
        },
        { group: view.groupA }
    );
    queries.setQueryDefinition('onAxis', TABLE, ({ select, where }) => {
        select('rank');
        select('label');
        select((getTableCell, rowId) => orderKeyOf(getTableCell('rank') as number, rowId)).as(ORDER_CELL);
        where('group', view.groupA);
        // The second axis, inside the query: the row's own `id` cell decides it.
        where(getCell => onSecondAxis(getCell('id') as string));
    });

    const paged = windowViewOf('paged', view.groupA, consumers.a, view.window);
    const onAxis = windowViewOf('onAxis', view.groupA, consumers.b, view.window);
    watchShape(queries, paged, 0, view.window);
    watchShape(queries, onAxis, 0, view.window);
    /** Reused only by the pull. */
    const found: TRow[] = [];

    // THE LISTENER IS SWAPPED FOR ONE AT THE NEW OFFSET and the page asked for. Nothing
    // is written, nothing is re-ordered: `getResultSortedRowIds` reads the ordering the
    // query already maintains.
    const pageAt = (offset: number): void => {
        queries.delListener(paged.shapeListener);
        watchShape(queries, paged, offset, view.window);
        paged.ids = queries.getResultSortedRowIds('paged', ORDER_CELL, false, offset, view.window);
        paged.shapeMoved = true;
        paged.pending = true;
    };

    return {
        ...cellWrites,
        write: rows =>
            store.transaction(() => {
                for (let i = 0; i < rows.length; i++) store.setRow(TABLE, rows[i].id, rows[i]);
            }),
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        // TWO `getCell` READS PER KEY — the two columns the page renders, against the
        // STORE and not a query result; a missing row answers `undefined`. Nothing is
        // resolved in advance.
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const rowId = keys[from + i];
                const rank = store.getCell(TABLE, rowId, 'rank');
                if (rank === undefined) continue;
                found.push({
                    id: rowId,
                    group: '',
                    rank: rank as number,
                    label: store.getCell(TABLE, rowId, 'label') as string,
                    note: '',
                });
            }
            deliverPage(consumers.a, found, 0, count);
        },
        scrollTo: to => pageAt(to),
        // `setParamValue` re-runs the definition over the new group.
        switchGroup: group => {
            queries.setParamValue('paged', 'group', group);
            pageAt(0);
        },
        frame,
        settle: () => {
            for (const state of [paged, onAxis]) {
                if (!state.pending) continue;
                state.pending = false;
                renderWindow(queries, state, view.window);
                deliverPage(state.consumer, state.visible, 0, view.window);
            }
        },
        readAll: () => rowsOf(store),
        deliverableRows: () => undefined,
        /** A query of its own, for the reason the window wiring gives. */
        groupOrder: group => groupOrderOf(queries, group),
        dispose: () => {
            for (const state of [paged, onAxis]) {
                unwatchRows(queries, state);
                queries.delListener(state.shapeListener);
            }
            found.length = 0;
            queries.destroy();
            store.delTables();
        },
    };
};

// TWO ENTITY TYPES — THREE TABLES in one TinyBase store, the shape the library is built
// around. The rest: `tinybase.md`.
const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    const { store, cellWrites, frame } = transactedStoreOf();

    let config: TRelationConfig = { ids: [], ranks: [], owners: [], touched: [], names: [], seeds: [] };
    /** The pair table's row ids, in `ids` order — composed once, for the render. */
    const pairIds: string[] = [];
    const listenerIds: string[] = [];
    const nameText: string[] = [];
    const markText: string[] = [];
    let namesPending = false;
    let marksPending = false;

    const pairKey = (owner: string, row: string): string => `${owner} ${row}`;

    const renderNames = (): void => {
        for (let i = 0; i < config.ids.length; i++) {
            nameText[i] = (store.getCell(OWNERS_TABLE, config.owners[i], 'name') as string) ?? '';
        }
        deliverRelation(consumers.a, config, nameText);
    };

    const renderMarks = (): void => {
        for (let i = 0; i < pairIds.length; i++) {
            markText[i] = (store.getCell(PAIRS_TABLE, pairIds[i], 'mark') as string) ?? '';
        }
        deliverRelation(consumers.b, config, markText);
    };

    return {
        ...cellWrites,
        write: rows =>
            store.transaction(() => {
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    store.setRow(TABLE, row.id, { group: row.group, rank: row.rank, label: row.label, note: row.note });
                }
            }),
        frame,
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        writeOwners: owners =>
            store.transaction(() => {
                for (let i = 0; i < owners.length; i++) store.setRow(OWNERS_TABLE, owners[i].id, { name: owners[i].name });
            }),
        // THE PAIR RECORDS AT THEIR SEEDS AND THE TWELVE CELL LISTENERS. The rest:
        // `tinybase.md`.
        holdRelation: given => {
            config = given;
            store.transaction(() => {
                for (let i = 0; i < given.ids.length; i++) {
                    const key = pairKey(given.owners[i], given.ids[i]);
                    pairIds.push(key);
                    // The two halves of the address are CELLS of the record, so the
                    // audit can read back where the store put it.
                    store.setRow(PAIRS_TABLE, key, { owner: given.owners[i], row: given.ids[i], mark: given.seeds[i] });
                }
            });
            for (let at = 0; at < given.touched.length; at++) {
                listenerIds.push(
                    store.addCellListener(OWNERS_TABLE, given.touched[at], 'name', () => {
                        namesPending = true;
                    })
                );
            }
            for (let i = 0; i < pairIds.length; i++) {
                listenerIds.push(
                    store.addCellListener(PAIRS_TABLE, pairIds[i], 'mark', () => {
                        marksPending = true;
                    })
                );
            }
            renderNames();
            renderMarks();
        },
        // ONE CELL WRITE in the owners table: only that owner's `name` listener can
        // fire, and the pair table is not touched at all.
        patchOwnerName: (at, name) => {
            store.setCell(OWNERS_TABLE, config.touched[at], 'name', name);
        },
        // COMPOSE THE ADDRESS AND WRITE THE CELL AT IT. The string is built fresh every
        // call: caching eight of them would make the row a measurement of an array
        // read.
        writePair: (at, mark) => {
            store.setCell(PAIRS_TABLE, pairKey(config.owners[at], config.ids[at]), 'mark', mark);
        },
        // Every write's transaction has finished by now, and finishing is what runs
        // TinyBase's listeners, so the flags below are set by the time they are read.
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
        readAll: () => rowsOf(store),
        deliverableRows: () => undefined,
        groupOrder: () => undefined,
        readOwners: () =>
            Object.entries(store.getTable(OWNERS_TABLE)).map(([id, owner]): TOwner => ({ id, name: owner.name as string })),
        // EVERY PAIR RECORD, WITH THE ADDRESS READ OUT OF ITS OWN CELLS and not out of
        // the row id — the row id is this file's own composition, so answering from it
        // would make the audit agree with whatever the composition did.
        readPairs: () => Object.values(store.getTable(PAIRS_TABLE)) as TPairRow[],
        dispose: () => {
            for (let i = 0; i < listenerIds.length; i++) store.delListener(listenerIds[i]);
            store.delTables();
        },
    };
};


/* ── one value, one subscriber, and a second value beside it ───────────── */

// VALUES AND NOT A TABLE, and this is the one adapter in the report whose library ships
// the task as a first-class thing: TinyBase's Values are keyed scalars beside its
// Tables, `setValue`/`getValue` write and read one, and `addValueListener(valueId, …)`
// subscribes to one. The rest: `tinybase.md`.
const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
    const store = createStore();
    const listeners: string[] = [];
    let name = '';
    let bystanderName = '';
    let read = '';
    let readBystander = '';
    let woke = false;
    let wokeBystander = false;

    const valueOf = (id: string): string => (store.getValue(id) as string) ?? '';

    return {
        ...noRowStore('tinybase'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            store.setValue(name, config.seeds[0]);
            store.setValue(bystanderName, config.seeds[1]);
            read = config.seeds[0];
            readBystander = config.seeds[1];
            listeners.push(
                store.addValueListener(name, () => {
                    read = valueOf(name);
                    woke = true;
                }),
                store.addValueListener(bystanderName, () => {
                    readBystander = valueOf(bystanderName);
                    wokeBystander = true;
                })
            );
            deliverSingle(consumers.a, name, read);
            deliverSingle(consumers.b, bystanderName, readBystander);
        },
        writeSingle: next => {
            store.setValue(name, next);
        },
        frame: transactionFrameOf(store),
        readSingle: () => valueOf(name),
        readBystander: () => valueOf(bystanderName),
        // A bare `setValue` is its own transaction, so every listener has
        // already run; what is left is the frame boundary.
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
            for (let i = 0; i < listeners.length; i++) store.delListener(listeners[i]);
            listeners.length = 0;
        },
    };
};

export const tinybaseAdapter: TAdapter = {
    name: 'tinybase',
    version: '10.0.1',
    docs: 'https://tinybase.org/guides/using-queries/',
    departure:
        'a sorted result sorts on ONE cell, so each view query selects a calculated cell joining a ' +
        'fixed-width rank to the row id and TinyBase sorts and windows on that; the read and churn ' +
        'wirings also store the row id as a cell, because a where callback is handed no row id and ' +
        'the second axis and the chain\'s root rows are both predicates on it. Each chain subscriber ' +
        'builds its own root query, which TinyBase evaluates over the whole table at mount, and each ' +
        'diamond subscriber builds two such root queries and a third rooted on the left result that ' +
        'joins the right one by row id. A view switch re-runs the paged query\'s definition through ' +
        'setParamValue. On the ' +
        'wide shape it registers a row listener per churn row it is asked for and each body reads ' +
        'the first of them alone.',
    admission:
        'the row values live in a TinyBase Store\'s cells and the change signal is the library\'s ' +
        'own — addResultSortedRowIdsListener and addResultRowListener on a query, ' +
        'addResultCellListener on the head of a chain of queries and on the join of a diamond, ' +
        'addCellListener on a cell — all ' +
        'called by TinyBase when the transaction finishes; the adapter keeps no values of its own.',

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
