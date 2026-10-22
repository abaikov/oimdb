import { proxy, subscribe } from 'valtio/vanilla';
import { subscribeKey } from 'valtio/vanilla/utils';
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
    visibleInto,
    visibleOf,
    visibleOnAxisInto,
} from '../harness/render';
import {
    churnShapes,
    declinedMount,
    noRowStore,
    readShapes,
} from '../harness/types';
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

// The recipe and every departure from it: `valtio.md`.

type TRows = Record<string, TRow>;
type TGroupedRows = { rows: TRows; byGroup: Record<string, TRows> };
type TRowsWriter = Pick<
    TBinding,
    'write' | 'remove' | 'patchLabel' | 'patchNote' | 'setGroup' | 'setRank'
>;

// The default subscribe defers to a microtask (vanilla.js:210-216), which a worker that never yields cannot flush.
const NOTIFY_IN_SYNC = true;

// valtio 2.3.2 exports no batch (vanilla.js:278-285).
const frame = (run: () => void): void => {
    run();
};

const rowsWriterOf = (rows: TRows): TRowsWriter => ({
    write: incoming => {
        for (let i = 0; i < incoming.length; i++) {
            const row = incoming[i];
            const held: TRow | undefined = rows[row.id];
            if (held === undefined) rows[row.id] = { ...row };
            else Object.assign(held, row);
        }
    },
    remove: ids => {
        for (let i = 0; i < ids.length; i++) delete rows[ids[i]];
    },
    patchLabel: (id, label) => {
        const held: TRow | undefined = rows[id];
        if (held !== undefined) held.label = label;
    },
    patchNote: (id, note) => {
        const held: TRow | undefined = rows[id];
        if (held !== undefined) held.note = note;
    },
    setGroup: (id, group) => {
        const held: TRow | undefined = rows[id];
        if (held !== undefined) held.group = group;
    },
    setRank: (id, rank) => {
        const held: TRow | undefined = rows[id];
        if (held !== undefined) held.rank = rank;
    },
});

const bucketIn = (state: TGroupedRows, group: string): TRows => {
    const held: TRows | undefined = state.byGroup[group];
    if (held !== undefined) return held;
    state.byGroup[group] = {};
    return state.byGroup[group];
};

const groupedWriterOf = (state: TGroupedRows): TRowsWriter => {
    const rowsWriter = rowsWriterOf(state.rows);
    const refile = (held: TRow, from: string): void => {
        if (held.group === from) return;
        delete bucketIn(state, from)[held.id];
        bucketIn(state, held.group)[held.id] = held;
    };
    return {
        ...rowsWriter,
        write: incoming => {
            for (let i = 0; i < incoming.length; i++) {
                const row = incoming[i];
                const held: TRow | undefined = state.rows[row.id];
                if (held === undefined) {
                    state.rows[row.id] = { ...row };
                    bucketIn(state, row.group)[row.id] = state.rows[row.id];
                    continue;
                }
                const from = held.group;
                Object.assign(held, row);
                refile(held, from);
            }
        },
        remove: ids => {
            for (let i = 0; i < ids.length; i++) {
                const held: TRow | undefined = state.rows[ids[i]];
                if (held === undefined) continue;
                delete state.rows[ids[i]];
                delete bucketIn(state, held.group)[ids[i]];
            }
        },
        setGroup: (id, group) => {
            const held: TRow | undefined = state.rows[id];
            if (held === undefined) return;
            const from = held.group;
            held.group = group;
            refile(held, from);
        },
    };
};

const groupOrderOf = (
    state: TGroupedRows,
    group: string
): readonly string[] => {
    const bucket: TRows | undefined = state.byGroup[group];
    if (bucket === undefined) return [];
    return orderedIdsOfRows(Object.values(bucket));
};

type TWindowView = {
    group: string;
    consumer: BenchConsumer;
    bucket: TRows;
    pending: boolean;
    stop: () => void;
};

const bindViews = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    const state = proxy<TGroupedRows>({ rows: {}, byGroup: {} });
    const writer = groupedWriterOf(state);

    const windows: TWindowView[] = bindings.map(bound => {
        const windowView: TWindowView = {
            group: bound.group,
            consumer: bound.consumer,
            bucket: bucketIn(state, bound.group),
            pending: false,
            stop: () => undefined,
        };
        windowView.stop = subscribe(
            windowView.bucket,
            () => {
                windowView.pending = true;
            },
            NOTIFY_IN_SYNC
        );
        return windowView;
    });

    const pinnedRows: (TRow | undefined)[] = [];
    const cellStop: (() => void)[] = [];
    const labelText: string[] = [];
    const noteText: string[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };
    let labelPending = false;
    let notePending = false;
    const labelConsumer = bindings[0].consumer;
    const noteConsumer = bindings[1].consumer;

    const renderCells = (
        consumer: BenchConsumer,
        text: string[],
        column: 'label' | 'note'
    ): void => {
        for (let i = 0; i < pinnedRows.length; i++) {
            const row = pinnedRows[i];
            text[i] = row === undefined ? '' : row[column];
        }
        deliverCells(consumer, cells, text);
    };

    return {
        ...writer,
        readAll: () => Object.values(state.rows),
        deliverableRows: () => undefined,
        groupOrder: group => groupOrderOf(state, group),
        pin: config => {
            for (const windowView of windows) windowView.stop();
            windows.length = 0;
            cells = config;
            pinnedRows.length = 0;
            for (let i = 0; i < config.ids.length; i++) {
                const row: TRow | undefined = state.rows[config.ids[i]];
                pinnedRows.push(row);
                if (row === undefined) continue;
                cellStop.push(
                    subscribeKey(
                        row,
                        'label',
                        () => {
                            labelPending = true;
                        },
                        NOTIFY_IN_SYNC
                    )
                );
                cellStop.push(
                    subscribeKey(
                        row,
                        'note',
                        () => {
                            notePending = true;
                        },
                        NOTIFY_IN_SYNC
                    )
                );
            }
            labelText.length = pinnedRows.length;
            noteText.length = pinnedRows.length;
            renderCells(labelConsumer, labelText, 'label');
            renderCells(noteConsumer, noteText, 'note');
        },
        patchPinnedLabel: (at, label) => {
            const row = pinnedRows[at];
            if (row !== undefined) row.label = label;
        },
        patchPinnedNote: (at, note) => {
            const row = pinnedRows[at];
            if (row !== undefined) row.note = note;
        },
        frame,
        settle: () => {
            for (let i = 0; i < windows.length; i++) {
                const windowView = windows[i];
                if (!windowView.pending) continue;
                windowView.pending = false;
                deliver(
                    windowView.consumer,
                    visibleOf(
                        Object.values(windowView.bucket),
                        windowView.group,
                        view.window
                    ),
                    view.window
                );
            }
            if (labelPending) {
                labelPending = false;
                renderCells(labelConsumer, labelText, 'label');
            }
            if (notePending) {
                notePending = false;
                renderCells(noteConsumer, noteText, 'note');
            }
        },
        dispose: () => {
            for (const windowView of windows) windowView.stop();
            windows.length = 0;
            for (const stop of cellStop) stop();
            cellStop.length = 0;
            pinnedRows.length = 0;
        },
    };
};

const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    const rows = proxy<TRows>({});
    const writer = rowsWriterOf(rows);

    const churnRows: TRow[] = [];
    const churnRead: (string | undefined)[] = [];
    const stop: ((() => void) | undefined)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    return {
        ...writer,
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
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
        readAll: () => Object.values(rows),
        deliverableRows: () => undefined,
        groupOrder: () => undefined,
        holdChurnRows: (ids, ranks) => {
            churnId = ids[0];
            churnRank = ranks[0];
            for (let i = 0; i < ids.length; i++) {
                churnRows[i] = rows[ids[i]];
                churnRead[i] = undefined;
            }
        },
        mountOnRows: (at, from, count) => {
            const head = churnRows[from];
            const woke = (): void => {
                churnWoke++;
                churnRead[at] = head.label;
            };
            if (count === 1) {
                stop[at] = subscribe(head, woke, NOTIFY_IN_SYNC);
                churnRead[at] = head.label;
                return;
            }
            const sourceStop: (() => void)[] = new Array<() => void>(count);
            for (let i = 0; i < count; i++) {
                sourceStop[i] = subscribe(
                    churnRows[from + i],
                    woke,
                    NOTIFY_IN_SYNC
                );
            }
            stop[at] = () => {
                for (let i = 0; i < sourceStop.length; i++) sourceStop[i]();
            };
            churnRead[at] = head.label;
        },
        mountOnColumn: at => {
            const head = churnRows[0];
            stop[at] = subscribeKey(
                head,
                'label',
                label => {
                    churnWoke++;
                    churnRead[at] = label;
                },
                NOTIFY_IN_SYNC
            );
            churnRead[at] = head.label;
        },
        mountOnChain: declinedMount('valtio', 'chain'),
        mountOnDiamond: declinedMount('valtio', 'diamond'),
        unmount: at => {
            const release = stop[at];
            if (release === undefined) return;
            release();
            stop[at] = undefined;
            churnRead[at] = undefined;
        },
        dispose: () => {
            for (let i = 0; i < stop.length; i++) stop[i]?.();
            stop.length = 0;
            churnRows.length = 0;
            churnRead.length = 0;
        },
    };
};

type TCursor = { group: string; offset: number };
type TReadState = TGroupedRows & { cursor: TCursor };

const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const state = proxy<TReadState>({
        rows: {},
        byGroup: {},
        cursor: { group: view.groupA, offset: 0 },
    });
    const writer = groupedWriterOf(state);
    const axisBucket = bucketIn(state, view.groupA);
    const found: TRow[] = [];
    let pagedPending = false;
    let axisPending = false;

    const markPaged = (): void => {
        pagedPending = true;
    };
    const subscribePagedBucket = (group: string): (() => void) =>
        subscribe(bucketIn(state, group), markPaged, NOTIFY_IN_SYNC);
    let pagedBucketStop = subscribePagedBucket(view.groupA);
    const stop = [
        subscribe(state.cursor, markPaged, NOTIFY_IN_SYNC),
        subscribe(
            axisBucket,
            () => {
                axisPending = true;
            },
            NOTIFY_IN_SYNC
        ),
    ];

    return {
        ...writer,
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            const rows = state.rows;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const row: TRow | undefined = rows[keys[from + i]];
                if (row !== undefined) found.push(row);
            }
            deliverPage(consumers.a, found, 0, count);
        },
        scrollTo: to => {
            state.cursor.offset = to;
        },
        switchGroup: group => {
            pagedBucketStop();
            pagedBucketStop = subscribePagedBucket(group);
            state.cursor.group = group;
            state.cursor.offset = 0;
        },
        settle: () => {
            if (pagedPending) {
                pagedPending = false;
                const cursor = state.cursor;
                const bucket: TRows | undefined = state.byGroup[cursor.group];
                deliverPage(
                    consumers.a,
                    bucket === undefined
                        ? []
                        : visibleInto(
                              [],
                              Object.values(bucket),
                              cursor.group,
                              cursor.offset + view.window
                          ),
                    cursor.offset,
                    view.window
                );
            }
            if (axisPending) {
                axisPending = false;
                deliverPage(
                    consumers.b,
                    visibleOnAxisInto(
                        [],
                        Object.values(axisBucket),
                        view.groupA,
                        view.window
                    ),
                    0,
                    view.window
                );
            }
        },
        readAll: () => Object.values(state.rows),
        deliverableRows: () => undefined,
        groupOrder: group => groupOrderOf(state, group),
        dispose: () => {
            pagedBucketStop();
            for (const release of stop) release();
            stop.length = 0;
            found.length = 0;
        },
    };
};

type TRelationState = {
    rows: TRows;
    owners: Record<string, TOwner>;
    pairs: Record<string, TPairRow>;
};

const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    const state = proxy<TRelationState>({ rows: {}, owners: {}, pairs: {} });
    const writer = rowsWriterOf(state.rows);

    let config: TRelationConfig = {
        ids: [],
        ranks: [],
        owners: [],
        touched: [],
        names: [],
        seeds: [],
    };
    const touchedOwners: (TOwner | undefined)[] = [];
    const lineOwners: (TOwner | undefined)[] = [];
    const linePairs: TPairRow[] = [];
    const names: string[] = [];
    const marks: string[] = [];
    let namesPending = false;
    let marksPending = false;
    const stop: (() => void)[] = [];

    const renderNames = (): void => {
        for (let i = 0; i < lineOwners.length; i++) {
            const owner = lineOwners[i];
            names[i] = owner === undefined ? '' : owner.name;
        }
        deliverRelation(consumers.a, config, names);
    };
    const renderMarks = (): void => {
        for (let i = 0; i < linePairs.length; i++) marks[i] = linePairs[i].mark;
        deliverRelation(consumers.b, config, marks);
    };

    return {
        ...writer,
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        writeOwners: incoming => {
            for (let i = 0; i < incoming.length; i++) {
                const owner = incoming[i];
                const held: TOwner | undefined = state.owners[owner.id];
                if (held === undefined) {
                    state.owners[owner.id] = { id: owner.id, name: owner.name };
                } else {
                    held.name = owner.name;
                }
            }
        },
        holdRelation: given => {
            config = given;
            for (let at = 0; at < given.touched.length; at++) {
                touchedOwners.push(state.owners[given.touched[at]]);
            }
            for (let i = 0; i < given.ids.length; i++) {
                const owner = given.owners[i];
                const row = given.ids[i];
                const key = `${owner} ${row}`;
                state.pairs[key] = { owner, row, mark: given.seeds[i] };
                linePairs.push(state.pairs[key]);
                lineOwners.push(state.owners[owner]);
            }
            names.length = lineOwners.length;
            marks.length = linePairs.length;
            stop.push(
                subscribe(
                    state.owners,
                    () => {
                        namesPending = true;
                    },
                    NOTIFY_IN_SYNC
                )
            );
            stop.push(
                subscribe(
                    state.pairs,
                    () => {
                        marksPending = true;
                    },
                    NOTIFY_IN_SYNC
                )
            );
            renderNames();
            renderMarks();
        },
        patchOwnerName: (at, name) => {
            const owner = touchedOwners[at];
            if (owner !== undefined) owner.name = name;
        },
        writePair: (at, mark) => {
            const pair: TPairRow | undefined =
                state.pairs[`${config.owners[at]} ${config.ids[at]}`];
            if (pair !== undefined) pair.mark = mark;
        },
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
        readAll: () => Object.values(state.rows),
        deliverableRows: () => undefined,
        groupOrder: () => undefined,
        readOwners: () => Object.values(state.owners),
        readPairs: () => Object.values(state.pairs),
        dispose: () => {
            for (let i = 0; i < stop.length; i++) stop[i]();
            stop.length = 0;
            touchedOwners.length = 0;
            lineOwners.length = 0;
            linePairs.length = 0;
        },
    };
};

const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
    const state = proxy({ value: '', bystander: '' });
    const stop: (() => void)[] = [];
    let name = '';
    let bystanderName = '';
    let read = '';
    let readBystander = '';
    let woke = false;
    let wokeBystander = false;

    return {
        ...noRowStore('valtio'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            state.value = config.seeds[0];
            state.bystander = config.seeds[1];
            read = state.value;
            readBystander = state.bystander;
            stop.push(
                subscribeKey(
                    state,
                    'value',
                    next => {
                        read = next;
                        woke = true;
                    },
                    NOTIFY_IN_SYNC
                )
            );
            stop.push(
                subscribeKey(
                    state,
                    'bystander',
                    next => {
                        readBystander = next;
                        wokeBystander = true;
                    },
                    NOTIFY_IN_SYNC
                )
            );
            deliverSingle(consumers.a, name, read);
            deliverSingle(consumers.b, bystanderName, readBystander);
        },
        writeSingle: next => {
            state.value = next;
        },
        readSingle: () => state.value,
        readBystander: () => state.bystander,
        frame,
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
        },
    };
};

export const valtioAdapter: TAdapter = {
    name: 'valtio',
    version: '2.3.2',
    docs: 'https://github.com/pmndrs/valtio#readme — "Use it vanilla", "Update synchronously", "Computed properties"',
    departure:
        'driven through `valtio/vanilla` with no React. Every consumer is `subscribe(proxy, cb, true)` ' +
        'or `subscribeKey(proxy, key, cb, true)`: the default subscribe defers its callback to a ' +
        'microtask (vanilla.js:210-216) and no worker here yields, so the sync flag (vanilla.js:206-208) ' +
        'is the only arm that reaches a consumer at all. The callback only marks its view; `settle` ' +
        'renders the marked views, standing in for the microtask boundary at which the default ' +
        'subscribe would have coalesced the same notifications. valtio has no batch, so `frame` calls ' +
        'its function directly and every property set inside it runs the sync listeners of the proxy ' +
        'and of every listened-to ancestor. A subscription is to a WHOLE SUBTREE: a window view ' +
        'listens to its group bucket, so a note write or a write to a row below the window wakes it ' +
        'and delivers text it already shows, and the read wiring\'s view A listens to the cursor and ' +
        'to its group\'s bucket, re-subscribed on every switch. Every row object written is wrapped in its own ' +
        'Proxy on the way in (vanilla.js:63), and in the window and read wirings each row proxy sits ' +
        'in two parents, the population and its group bucket. A write of an existing row is ' +
        '`Object.assign` onto its proxy, so valtio\'s per-property `Object.is` (vanilla.js:56) makes a ' +
        're-send of unchanged values notify nothing. The wide churn subscriber is one subscribe per ' +
        'source with one shared body, because subscribe takes one proxy. The chain and diamond ' +
        'shapes are declined: valtio 2.3.2 ships no derived value, and `derive-valtio` is not installed.',
    admission:
        'the row columns live in valtio proxies — one per row, filed under `rows` and, in the window ' +
        'and read wirings, under its group\'s bucket in `byGroup` of the same `proxy` state — and the ' +
        'change signal is valtio\'s own listener notification, run inside the write by ' +
        '`subscribe(…, true)` and `subscribeKey(…, true)`, which marks the view that `settle` renders.',

    reads: readShapes((consumers, view, plan) =>
        bindReadStore(consumers, view, plan)
    ),
    churn: churnShapes(consumers => bindChurnStore(consumers.a), {
        chain:
            'VALTIO 2.3.2 HAS NO DERIVED VALUE A SECOND DERIVATION CAN READ. Its only primitives are ' +
            '`proxy`, `subscribe` and `subscribeKey`; the derived-proxy helper lives in the separate ' +
            '`derive-valtio` package, which this suite does not install. A chain would be plain proxies ' +
            'that this adapter rewrites level by level inside its own subscribe callbacks, which the B3 ' +
            'clause of churnChain forbids: the adapter building the chain, not the library. The row, ' +
            'wide and column shapes are supplied and unaffected.',
        diamond:
            'VALTIO 2.3.2 HAS NO DERIVATION PRIMITIVE. Nothing in `valtio/vanilla` computes a value from ' +
            'two others, so the two branches and the join could only be proxies this adapter rewrites ' +
            'by hand, and since the join is rewritten once per branch, delivering it once needs the ' +
            'adapter to hold the wake back and dedup it in settle, which the B3 clause of churnDiamond ' +
            'forbids: the adapter building the diamond and its glitch-freedom, not the library. The row, ' +
            'wide and column shapes are supplied and unaffected.',
    }),
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
    bindPerGroup: (consumers, view) => bindViews(consumers.views, view),
};
