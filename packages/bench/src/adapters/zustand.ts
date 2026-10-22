import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import { shallow } from 'zustand/vanilla/shallow';
import type {
    BenchConsumer,
    TConsumers,
    TViewBinding,
} from '../harness/consumer';
import { compareRows, onSecondAxis } from '../harness/dataset';
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
import { createSelector } from 'reselect';
import {
    chainLevelOf,
    chainWindowOf,
    diamondJoinOf,
    diamondLeftOf,
    diamondRightOf,
} from '../harness/derivations';
import {
    churnShapes,
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

// The recipe and every departure from it: `zustand.md`.

type TEntities = Record<string, TRow>;
type TGroupIds = Partial<Record<string, string[]>>;
type TEntitiesState = { entities: TEntities };
type TRowsState = TEntitiesState & { idsByGroup: TGroupIds };
type TRowPatch = Partial<TRow> & { id: string };
type TRowEdit =
    | { kind: 'write'; rows: readonly TRow[] }
    | { kind: 'remove'; ids: readonly string[] }
    | { kind: 'patch'; patch: TRowPatch };
type TRowEditor = Pick<
    TBinding,
    'write' | 'remove' | 'patchLabel' | 'patchNote' | 'setGroup' | 'setRank' | 'frame'
>;
type TRegroup = (id: string, from: string | undefined, to: string | undefined) => void;

const held = (entities: TEntities, id: string): TRow | undefined => entities[id];

type TBucketsDraft = {
    bucket(group: string): string[];
    result(): TGroupIds;
};

const bucketsDraftOf = (idsByGroup: TGroupIds): TBucketsDraft => {
    let next: TGroupIds | undefined;
    const copied = new Set<string>();
    return {
        bucket: group => {
            next ??= { ...idsByGroup };
            if (copied.has(group)) return next[group] as string[];
            const bucket = next[group]?.slice() ?? [];
            next[group] = bucket;
            copied.add(group);
            return bucket;
        },
        result: () => next ?? idsByGroup,
    };
};

const leave = (bucket: string[], id: string): void => {
    const at = bucket.indexOf(id);
    if (at >= 0) bucket.splice(at, 1);
};

type TEntitiesEditor<TPayload> = (
    stored: TEntities,
    payload: TPayload,
    regroup: TRegroup
) => TEntities | undefined;

type TRowStoreEdits = {
    edited(edits: readonly TRowEdit[]): void;
    written(rows: readonly TRow[]): void;
    removed(ids: readonly string[]): void;
    patched(patch: TRowPatch): void;
};

const rowsWrittenInto = (
    stored: TEntities,
    current: TEntities | undefined,
    rows: readonly TRow[],
    regroup: TRegroup
): TEntities => {
    const entities = current ?? { ...stored };
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const before = held(entities, row.id);
        entities[row.id] = { ...row };
        regroup(row.id, before?.group, row.group);
    }
    return entities;
};

const idsRemovedFrom = (
    stored: TEntities,
    current: TEntities | undefined,
    ids: readonly string[],
    regroup: TRegroup
): TEntities | undefined => {
    let entities = current;
    for (let i = 0; i < ids.length; i++) {
        const before = held(entities ?? stored, ids[i]);
        if (before === undefined) continue;
        entities ??= { ...stored };
        delete entities[ids[i]];
        regroup(before.id, before.group, undefined);
    }
    return entities;
};

const rowPatchedInto = (
    stored: TEntities,
    current: TEntities | undefined,
    patch: TRowPatch,
    regroup: TRegroup
): TEntities | undefined => {
    const before = held(current ?? stored, patch.id);
    if (before === undefined) return current;
    const entities = current ?? { ...stored };
    const after = { ...before, ...patch };
    entities[after.id] = after;
    regroup(after.id, before.group, after.group);
    return entities;
};

const entitiesEdited: TEntitiesEditor<readonly TRowEdit[]> = (stored, edits, regroup) => {
    let entities: TEntities | undefined;
    for (let e = 0; e < edits.length; e++) {
        const edit = edits[e];
        if (edit.kind === 'write') entities = rowsWrittenInto(stored, entities, edit.rows, regroup);
        else if (edit.kind === 'remove') entities = idsRemovedFrom(stored, entities, edit.ids, regroup);
        else entities = rowPatchedInto(stored, entities, edit.patch, regroup);
    }
    return entities;
};

const entitiesWritten: TEntitiesEditor<readonly TRow[]> = (stored, rows, regroup) =>
    rowsWrittenInto(stored, undefined, rows, regroup);

const entitiesRemoved: TEntitiesEditor<readonly string[]> = (stored, ids, regroup) =>
    idsRemovedFrom(stored, undefined, ids, regroup);

const entitiesPatched: TEntitiesEditor<TRowPatch> = (stored, patch, regroup) =>
    rowPatchedInto(stored, undefined, patch, regroup);

const NO_REGROUP: TRegroup = () => undefined;

// Returning `state` itself is zustand's own no-op (`Object.is`, esm/vanilla.mjs:6), taken only for an id not stored.
const rowsAppliedOf =
    <TPayload>(editor: TEntitiesEditor<TPayload>) =>
    (state: TRowsState, payload: TPayload): TRowsState => {
        const buckets = bucketsDraftOf(state.idsByGroup);
        const entities = editor(state.entities, payload, (id, from, to) => {
            if (from === to) return;
            if (from !== undefined) leave(buckets.bucket(from), id);
            if (to !== undefined) buckets.bucket(to).push(id);
        });
        return entities === undefined ? state : { entities, idsByGroup: buckets.result() };
    };

const onlyEntitiesAppliedOf =
    <TPayload>(editor: TEntitiesEditor<TPayload>) =>
    (state: TEntitiesState, payload: TPayload): TEntitiesState => {
        const entities = editor(state.entities, payload, NO_REGROUP);
        return entities === undefined ? state : { entities };
    };

const rowsEdited = rowsAppliedOf(entitiesEdited);
const rowsWritten = rowsAppliedOf(entitiesWritten);
const rowsRemoved = rowsAppliedOf(entitiesRemoved);
const rowsPatched = rowsAppliedOf(entitiesPatched);

const onlyEntitiesEdited = onlyEntitiesAppliedOf(entitiesEdited);
const onlyEntitiesWritten = onlyEntitiesAppliedOf(entitiesWritten);
const onlyEntitiesRemoved = onlyEntitiesAppliedOf(entitiesRemoved);
const onlyEntitiesPatched = onlyEntitiesAppliedOf(entitiesPatched);

type TRowsSetter = { setState(update: (state: TRowsState) => TRowsState): void };
type TEntitiesSetter = { setState(update: (state: TEntitiesState) => TEntitiesState): void };

const rowStoreEditsOf = (store: TRowsSetter): TRowStoreEdits => ({
    edited: edits => store.setState(state => rowsEdited(state, edits)),
    written: rows => store.setState(state => rowsWritten(state, rows)),
    removed: ids => store.setState(state => rowsRemoved(state, ids)),
    patched: patch => store.setState(state => rowsPatched(state, patch)),
});

const entitiesStoreEditsOf = (store: TEntitiesSetter): TRowStoreEdits => ({
    edited: edits => store.setState(state => onlyEntitiesEdited(state, edits)),
    written: rows => store.setState(state => onlyEntitiesWritten(state, rows)),
    removed: ids => store.setState(state => onlyEntitiesRemoved(state, ids)),
    patched: patch => store.setState(state => onlyEntitiesPatched(state, patch)),
});

const rowEditorOf = (rowStoreEdits: TRowStoreEdits): TRowEditor => {
    let framed: TRowEdit[] | undefined;
    const patch = (rowPatch: TRowPatch): void => {
        if (framed === undefined) rowStoreEdits.patched(rowPatch);
        else framed.push({ kind: 'patch', patch: rowPatch });
    };
    return {
        write: rows => {
            if (framed === undefined) rowStoreEdits.written(rows);
            else framed.push({ kind: 'write', rows });
        },
        remove: ids => {
            if (framed === undefined) rowStoreEdits.removed(ids);
            else framed.push({ kind: 'remove', ids });
        },
        patchLabel: (id, label) => patch({ id, label }),
        patchNote: (id, note) => patch({ id, note }),
        setGroup: (id, group) => patch({ id, group }),
        setRank: (id, rank) => patch({ id, rank }),
        frame: run => {
            if (framed !== undefined) {
                run();
                return;
            }
            const edits: TRowEdit[] = [];
            framed = edits;
            run();
            framed = undefined;
            if (edits.length > 0) rowStoreEdits.edited(edits);
        },
    };
};

const runDirectly = (run: () => void): void => {
    run();
};

const selectionOf = (
    entities: TEntities,
    ids: readonly string[] | undefined,
    limit: number,
    axis: boolean
): TRow[] => {
    const out: TRow[] = [];
    if (ids === undefined) return out;
    let count = 0;
    for (let i = 0; i < ids.length; i++) {
        const row = entities[ids[i]];
        if (axis && !onSecondAxis(row.id)) continue;
        if (count >= limit) {
            if (compareRows(row, out[count - 1]) >= 0) continue;
        } else count++;
        let at = count - 1;
        while (at > 0 && compareRows(out[at - 1], row) > 0) {
            out[at] = out[at - 1];
            at--;
        }
        out[at] = row;
    }
    return out;
};

const groupOrderOf = (state: TRowsState, group: string): readonly string[] =>
    orderedIdsOfRows((state.idsByGroup[group] ?? []).map(id => state.entities[id]));

const bindViews = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    const store = createStore<TRowsState>()(
        subscribeWithSelector(() => ({ entities: {}, idsByGroup: {} }))
    );
    const writer = rowEditorOf(rowStoreEditsOf(store));

    const windows = bindings.map(bound =>
        store.subscribe(
            state =>
                selectionOf(
                    state.entities,
                    state.idsByGroup[bound.group],
                    view.window,
                    false
                ),
            visible => deliver(bound.consumer, visible, view.window),
            { equalityFn: shallow }
        )
    );

    const cellStop: (() => void)[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };

    const pinnedTextOf =
        (column: 'label' | 'note') =>
        (state: TRowsState): string[] =>
            cells.ids.map(id => state.entities[id][column]);

    return {
        ...writer,
        readAll: () => Object.values(store.getState().entities),
        deliverableRows: () => undefined,
        groupOrder: group => groupOrderOf(store.getState(), group),
        pin: config => {
            for (const stop of windows) stop();
            windows.length = 0;
            cells = config;
            cellStop.push(
                store.subscribe(
                    pinnedTextOf('label'),
                    text => deliverCells(bindings[0].consumer, cells, text),
                    { equalityFn: shallow, fireImmediately: true }
                )
            );
            cellStop.push(
                store.subscribe(
                    pinnedTextOf('note'),
                    text => deliverCells(bindings[1].consumer, cells, text),
                    { equalityFn: shallow, fireImmediately: true }
                )
            );
        },
        patchPinnedLabel: (at, label) => writer.patchLabel(cells.ids[at], label),
        patchPinnedNote: (at, note) => writer.patchNote(cells.ids[at], note),
        settle: () => undefined,
        dispose: () => {
            for (const stop of windows) stop();
            for (const stop of cellStop) stop();
        },
    };
};

const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    const store = createStore<TEntitiesState>()(
        subscribeWithSelector(() => ({ entities: {} }))
    );
    const writer = rowEditorOf(entitiesStoreEditsOf(store));

    let churnIds: readonly string[] = [];
    const churnRead: (string | undefined)[] = [];
    const stop: ((() => void) | undefined)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    const mount = <TSlice>(
        at: number,
        select: (state: TEntitiesState) => TSlice,
        textOf: (slice: TSlice) => string,
        equalityFn?: (a: TSlice, b: TSlice) => boolean
    ): void => {
        stop[at] = store.subscribe(
            select,
            (slice, previous) => {
                churnRead[at] = textOf(slice);
                if (slice !== previous) churnWoke++;
            },
            { equalityFn, fireImmediately: true }
        );
    };

    const labelOf = (row: TRow | undefined): string =>
        row === undefined ? '' : row.label;

    const firstLabelOf = (rows: readonly (TRow | undefined)[]): string => {
        let text = '';
        for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i];
            if (row !== undefined) text = row.label;
        }
        return text;
    };

    return {
        ...writer,
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        settle: () => {
            if (churnWoke === 0) return;
            deliverChurn(churnConsumer, churnId, churnRank, churnWoke, churnRead);
            churnWoke = 0;
        },
        readAll: () => Object.values(store.getState().entities),
        deliverableRows: () => undefined,
        groupOrder: () => undefined,
        holdChurnRows: (ids, ranks) => {
            churnIds = ids;
            churnId = ids[0];
            churnRank = ranks[0];
            for (let i = 0; i < ids.length; i++) churnRead[i] = undefined;
        },
        mountOnRows: (at, from, count) => {
            if (count === 1) {
                const id = churnIds[from];
                mount(at, state => held(state.entities, id), labelOf);
                return;
            }
            const ids = churnIds.slice(from, from + count);
            mount(
                at,
                state => ids.map(id => held(state.entities, id)),
                firstLabelOf,
                shallow
            );
        },
        mountOnColumn: at => {
            const id = churnIds[0];
            mount(at, state => labelOf(held(state.entities, id)), text => text);
        },
        mountOnChain: (at, from, count, depth) => {
            const ids = churnIds.slice(from, from + count);
            let selectLevel: (state: TEntitiesState) => string = createSelector(
                [(state: TEntitiesState): TEntities => state.entities],
                entities =>
                    chainLevelOf(
                        chainWindowOf(
                            ids.map(id => labelOf(held(entities, id))),
                            0,
                            count
                        ),
                        1
                    )
            );
            for (let level = 2; level <= depth; level++) {
                selectLevel = createSelector([selectLevel], text => chainLevelOf(text, level));
            }
            mount(at, selectLevel, text => text);
        },
        mountOnDiamond: (at, from) => {
            const id = churnIds[from];
            const selectLabel = (state: TEntitiesState): string =>
                labelOf(held(state.entities, id));
            const selectLeft = createSelector([selectLabel], diamondLeftOf);
            const selectRight = createSelector([selectLabel], diamondRightOf);
            const selectJoin = createSelector([selectLeft, selectRight], diamondJoinOf);
            mount(at, selectJoin, text => text);
        },
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
            churnRead.length = 0;
        },
    };
};

type TCursor = { group: string; offset: number };
type TReadState = TRowsState & { cursor: TCursor };

const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const store = createStore<TReadState>()(
        subscribeWithSelector(() => ({
            entities: {},
            idsByGroup: {},
            cursor: { group: view.groupA, offset: 0 },
        }))
    );
    const writer = rowEditorOf(rowStoreEditsOf(store));
    const found: TRow[] = [];

    const stop = [
        store.subscribe(
            state => {
                const cursor = state.cursor;
                return selectionOf(
                    state.entities,
                    state.idsByGroup[cursor.group],
                    cursor.offset + view.window,
                    false
                ).slice(cursor.offset);
            },
            page => deliverPage(consumers.a, page, 0, view.window),
            { equalityFn: shallow }
        ),
        store.subscribe(
            state =>
                selectionOf(
                    state.entities,
                    state.idsByGroup[view.groupA],
                    view.window,
                    true
                ),
            rows => deliverPage(consumers.b, rows, 0, view.window),
            { equalityFn: shallow }
        ),
    ];

    return {
        ...writer,
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            const entities = store.getState().entities;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const row = held(entities, keys[from + i]);
                if (row !== undefined) found.push(row);
            }
            deliverPage(consumers.a, found, 0, count);
        },
        scrollTo: to => {
            store.setState(state => ({
                cursor: { group: state.cursor.group, offset: to },
            }));
        },
        switchGroup: group => {
            store.setState({ cursor: { group, offset: 0 } });
        },
        settle: () => undefined,
        readAll: () => Object.values(store.getState().entities),
        deliverableRows: () => undefined,
        groupOrder: group => groupOrderOf(store.getState(), group),
        dispose: () => {
            for (const release of stop) release();
            found.length = 0;
        },
    };
};

type TRelationState = TEntitiesState & {
    owners: Record<string, TOwner>;
    pairs: Record<string, TPairRow>;
};

const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    const store = createStore<TRelationState>()(
        subscribeWithSelector(() => ({ entities: {}, owners: {}, pairs: {} }))
    );
    const writer = rowEditorOf(entitiesStoreEditsOf(store));

    let config: TRelationConfig = { ids: [], ranks: [], owners: [], touched: [], names: [], seeds: [] };
    const stop: (() => void)[] = [];

    return {
        ...writer,
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        writeOwners: incoming => {
            store.setState(state => {
                const owners = { ...state.owners };
                for (let i = 0; i < incoming.length; i++) {
                    const owner = incoming[i];
                    owners[owner.id] = { id: owner.id, name: owner.name };
                }
                return { owners };
            });
        },
        holdRelation: given => {
            config = given;
            store.setState(state => {
                const pairs = { ...state.pairs };
                for (let i = 0; i < given.ids.length; i++) {
                    const owner = given.owners[i];
                    const row = given.ids[i];
                    pairs[`${owner} ${row}`] = { owner, row, mark: given.seeds[i] };
                }
                return { pairs };
            });
            stop.push(
                store.subscribe(
                    state => given.owners.map(owner => state.owners[owner]?.name ?? ''),
                    text => deliverRelation(consumers.a, config, text),
                    { equalityFn: shallow, fireImmediately: true }
                )
            );
            stop.push(
                store.subscribe(
                    state => given.ids.map((row, i) => state.pairs[`${given.owners[i]} ${row}`]?.mark ?? ''),
                    text => deliverRelation(consumers.b, config, text),
                    { equalityFn: shallow, fireImmediately: true }
                )
            );
        },
        patchOwnerName: (at, name) => {
            const id = config.touched[at];
            store.setState(state => {
                const stored: TOwner | undefined = state.owners[id];
                if (stored === undefined) return state;
                return { owners: { ...state.owners, [id]: { ...stored, name } } };
            });
        },
        writePair: (at, mark) => {
            const key = `${config.owners[at]} ${config.ids[at]}`;
            store.setState(state => {
                const stored: TPairRow | undefined = state.pairs[key];
                if (stored === undefined) return state;
                return { pairs: { ...state.pairs, [key]: { ...stored, mark } } };
            });
        },
        settle: () => undefined,
        readAll: () => Object.values(store.getState().entities),
        deliverableRows: () => undefined,
        groupOrder: () => undefined,
        readOwners: () => Object.values(store.getState().owners),
        readPairs: () => Object.values(store.getState().pairs),
        dispose: () => {
            for (let i = 0; i < stop.length; i++) stop[i]();
        },
    };
};

type TSingleState = { value: string; bystander: string };

const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
    const store = createStore<TSingleState>()(
        subscribeWithSelector(() => ({ value: '', bystander: '' }))
    );
    const stop: (() => void)[] = [];
    let name = '';
    let bystanderName = '';
    let read = '';
    let readBystander = '';
    let woke = false;
    let wokeBystander = false;

    return {
        ...noRowStore('zustand'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            store.setState({ value: config.seeds[0], bystander: config.seeds[1] });
            read = store.getState().value;
            readBystander = store.getState().bystander;
            stop.push(
                store.subscribe(
                    state => state.value,
                    next => {
                        read = next;
                        woke = true;
                    }
                )
            );
            stop.push(
                store.subscribe(
                    state => state.bystander,
                    next => {
                        readBystander = next;
                        wokeBystander = true;
                    }
                )
            );
            deliverSingle(consumers.a, name, read);
            deliverSingle(consumers.b, bystanderName, readBystander);
        },
        writeSingle: next => {
            store.setState({ value: next });
        },
        readSingle: () => store.getState().value,
        readBystander: () => store.getState().bystander,
        frame: runDirectly,
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

export const zustandAdapter: TAdapter = {
    name: 'zustand',
    version: '5.0.15',
    docs: 'https://github.com/pmndrs/zustand#readme — "Using subscribe with selector", "Using zustand without React"',
    departure:
        'driven through the vanilla API with no React: every consumer is a `subscribeWithSelector` ' +
        'listener, the same selector-plus-equality a `useStore(store, selector)` hook re-renders on, ' +
        'and a selector returning a fresh array is compared with the shipped `shallow`, as ' +
        '`useShallow` does. zustand has no batch API: `setState` is its bulk update, so `frame` ' +
        'buffers the writes issued inside it and applies them as ONE `setState` as it returns, ' +
        'which copies `entities` once and notifies every listener once; outside a frame each ' +
        'write is its own `setState`. Writes are the documented immutable updates: a `setState` ' +
        'spreads the whole `entities` record, about ten thousand keys, to give the changed rows ' +
        'fresh references, and a re-send ' +
        'or a same-value patch produces fresh row objects and notifies, because nothing in the ' +
        'library compares values before notifying — the `immer` middleware, which would make a ' +
        're-send a no-op the way Immer does in Redux Toolkit, is not used. Every selector re-runs ' +
        'on every `setState`, so a window view re-derives its group\'s top-k per `setState` and the ' +
        'cell and relation views rebuild their text arrays per `setState`. churn.chain and ' +
        'churn.diamond are derived with `reselect` `createSelector`, the memoised-selector pattern ' +
        'a zustand user writes for derived state: each level is a memoised selector over the ' +
        'level below, the subscriber is a `subscribeWithSelector` listener on the top one, and ' +
        'zustand itself ships no derivation. A group array is copied ' +
        'once per `setState` and each leaving id is spliced out of that copy.',
    admission:
        'the row values live in one vanilla zustand store — the `entities` record of its state, ' +
        'replaced only through `setState` — and the store\'s own listener set, run by `setState` ' +
        'before it returns and filtered by `subscribeWithSelector`, is what drives every consumer; ' +
        'under the window and read wirings the `idsByGroup` lists beside `entities` are state of the ' +
        'same store and hold ids, never values.',

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
    bindPerGroup: (consumers, view) => bindViews(consumers.views, view),
};
