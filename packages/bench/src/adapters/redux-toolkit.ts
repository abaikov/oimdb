import { configureStore, createSlice, original } from '@reduxjs/toolkit';
import type { PayloadAction, UnknownAction } from '@reduxjs/toolkit';
import { shallowEqual } from 'react-redux';
import { createSelector } from 'reselect';
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

// Recipe: Redux Toolkit's normalised state — a slice holding an entity map keyed by id
// AND a key index beside it, one action per frame — with `createSelector` in front of
// each view and `store.subscribe` driving the consumers. The rest: `redux-toolkit.md`.

type TEntities = Record<string, TRow>;
type TGroupIds = Partial<Record<string, string[]>>;
type TRowsState = { entities: TEntities };
type TGroupedRowsState = TRowsState & { idsByGroup: TGroupIds };
type TRowPatch = Partial<TRow> & { id: string };
type TRootState = { rows: TRowsState };
type TGroupedRootState = { rows: TGroupedRowsState };

// A read that admits the key may be missing. `Record<string, TRow>` claims every string
// is present, which is what makes an upsert reducer unwriteable. The rest:
// `redux-toolkit.md`.
const held = (entities: TEntities, id: string): TRow | undefined => entities[id];

type TRowEdit =
    | { kind: 'write'; rows: readonly TRow[] }
    | { kind: 'remove'; ids: readonly string[] }
    | { kind: 'patch'; patch: TRowPatch };

type TRegrouping = {
    leave(id: string, group: string): void;
    join(id: string, group: string): void;
};

const UNGROUPED: TRegrouping = { leave: () => undefined, join: () => undefined };

// THE ONLY QUESTION A REDUCER ASKS IS WHETHER THE ROW IS THERE, never whether a value
// changed. The rest: `redux-toolkit.md`.
const applyWrite = (entities: TEntities, rows: readonly TRow[], regrouping: TRegrouping): void => {
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const stored = held(entities, row.id);
        if (stored === undefined) {
            entities[row.id] = { ...row };
            regrouping.join(row.id, row.group);
            continue;
        }
        const from = stored.group;
        stored.group = row.group;
        stored.rank = row.rank;
        stored.label = row.label;
        stored.note = row.note;
        if (from !== row.group) {
            regrouping.leave(row.id, from);
            regrouping.join(row.id, row.group);
        }
    }
};

const applyRemove = (entities: TEntities, ids: readonly string[], regrouping: TRegrouping): void => {
    for (let i = 0; i < ids.length; i++) {
        const stored = held(entities, ids[i]);
        if (stored === undefined) continue;
        regrouping.leave(stored.id, stored.group);
        delete entities[ids[i]];
    }
};

const applyPatch = (entities: TEntities, patch: TRowPatch, regrouping: TRegrouping): void => {
    const stored = held(entities, patch.id);
    if (stored === undefined) return;
    const from = stored.group;
    Object.assign(stored, patch);
    if (stored.group !== from) {
        regrouping.leave(stored.id, from);
        regrouping.join(stored.id, stored.group);
    }
};

const applyEdits = (entities: TEntities, edits: readonly TRowEdit[], regrouping: TRegrouping): void => {
    for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];
        if (edit.kind === 'write') applyWrite(entities, edit.rows, regrouping);
        else if (edit.kind === 'remove') applyRemove(entities, edit.ids, regrouping);
        else applyPatch(entities, edit.patch, regrouping);
    }
};

const plainReducerOf =
    <TPayload>(apply: (entities: TEntities, payload: TPayload, regrouping: TRegrouping) => void) =>
    (state: TRowsState, action: PayloadAction<TPayload>): void =>
        apply(state.entities, action.payload, UNGROUPED);

const rowsSlice = createSlice({
    name: 'rows',
    initialState: { entities: {} } as TRowsState,
    reducers: {
        edited: plainReducerOf<readonly TRowEdit[]>(applyEdits),
        written: plainReducerOf<readonly TRow[]>(applyWrite),
        removed: plainReducerOf<readonly string[]>(applyRemove),
        patched: plainReducerOf<TRowPatch>(applyPatch),
    },
});

type TBucketEdit = { gone: Set<string>; joined: string[] };

const regroupingOf = (state: TGroupedRowsState): TRegrouping & { commit(): void } => {
    const bucketEdits = new Map<string, TBucketEdit>();
    const bucketEditOf = (group: string): TBucketEdit => {
        let bucketEdit = bucketEdits.get(group);
        if (bucketEdit === undefined) {
            bucketEdit = { gone: new Set(), joined: [] };
            bucketEdits.set(group, bucketEdit);
        }
        return bucketEdit;
    };
    return {
        leave: (id, group) => {
            bucketEditOf(group).gone.add(id);
        },
        join: (id, group) => {
            const bucketEdit = bucketEditOf(group);
            if (!bucketEdit.gone.delete(id)) bucketEdit.joined.push(id);
        },
        commit: () => {
            if (bucketEdits.size === 0) return;
            const idsByGroup = original(state.idsByGroup) ?? {};
            for (const [group, bucketEdit] of bucketEdits) {
                const { gone, joined } = bucketEdit;
                const ids = (idsByGroup[group] ?? []).filter(id => !gone.has(id));
                for (let i = 0; i < joined.length; i++) {
                    if (!gone.has(joined[i])) ids.push(joined[i]);
                }
                state.idsByGroup[group] = ids;
            }
        },
    };
};

const groupedReducerOf =
    <TPayload>(apply: (entities: TEntities, payload: TPayload, regrouping: TRegrouping) => void) =>
    (state: TGroupedRowsState, action: PayloadAction<TPayload>): void => {
        const regrouping = regroupingOf(state);
        apply(state.entities, action.payload, regrouping);
        regrouping.commit();
    };

const groupedRowsSlice = createSlice({
    name: 'groupedRows',
    initialState: { entities: {}, idsByGroup: {} } as TGroupedRowsState,
    reducers: {
        edited: groupedReducerOf<readonly TRowEdit[]>(applyEdits),
        written: groupedReducerOf<readonly TRow[]>(applyWrite),
        removed: groupedReducerOf<readonly string[]>(applyRemove),
        patched: groupedReducerOf<TRowPatch>(applyPatch),
    },
});

type TRowEditor = Pick<
    TBinding,
    'write' | 'remove' | 'patchLabel' | 'patchNote' | 'setGroup' | 'setRank' | 'frame'
>;

type TRowActions = {
    edited(edits: readonly TRowEdit[]): UnknownAction;
    written(rows: readonly TRow[]): UnknownAction;
    removed(ids: readonly string[]): UnknownAction;
    patched(patch: TRowPatch): UnknownAction;
};

const rowEditorOf = (
    dispatch: (action: UnknownAction) => unknown,
    rowActions: TRowActions
): TRowEditor => {
    let framed: TRowEdit[] | undefined;
    const patch = (rowPatch: TRowPatch): void => {
        if (framed === undefined) dispatch(rowActions.patched(rowPatch));
        else framed.push({ kind: 'patch', patch: rowPatch });
    };
    return {
        write: rows => {
            if (framed === undefined) dispatch(rowActions.written(rows));
            else framed.push({ kind: 'write', rows });
        },
        remove: ids => {
            if (framed === undefined) dispatch(rowActions.removed(ids));
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
            if (edits.length > 0) dispatch(rowActions.edited(edits));
        },
    };
};

const PRODUCTION_MIDDLEWARE = {
    immutableCheck: false,
    serializableCheck: false,
} as const;

const SHALLOW_RESULT = { memoizeOptions: { resultEqualityCheck: shallowEqual } };

// `entities` is the slice's own state, handed in by the selector, so every row here is
// read through Redux. The rest: `redux-toolkit.md`.
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

// `idsByGroup`, WALKED EXACTLY AS THE SELECTOR WALKS IT — the arm of the audit that
// bites, because this slice keeps a grouping and `readAll` deliberately does not read
// it. The rest: `redux-toolkit.md`.
const groupOrderOf = (state: TGroupedRowsState, group: string): readonly string[] =>
    orderedIdsOfRows((state.idsByGroup[group] ?? []).map(id => state.entities[id]));

const bindViews = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    const store = configureStore({
        reducer: { rows: groupedRowsSlice.reducer },
        middleware: getDefault => getDefault(PRODUCTION_MIDDLEWARE),
    });
    const editor = rowEditorOf(action => store.dispatch(action), groupedRowsSlice.actions);

    // The selectors are built PER BINDING rather than per module: a `createSelector`
    // carries its own cache, and the load scenario tears the store down and builds a
    // fresh one, so a module-level selector would walk into the new store holding the
    // old store's memo. The rest: `redux-toolkit.md`.
    const windows = bindings.map(bound => ({
        consumer: bound.consumer,
        select: createSelector(
            [
                (state: TGroupedRootState) => state.rows.entities,
                (state: TGroupedRootState) => state.rows.idsByGroup[bound.group],
            ],
            (entities, ids) => selectionOf(entities, ids, view.window, false),
            SHALLOW_RESULT
        ),
        last: undefined as readonly TRow[] | undefined,
    }));

    // react-redux `useSelector`'s default: render only when the selected reference changed.
    const unsubscribe = store.subscribe(() => {
        const state = store.getState();
        for (let i = 0; i < windows.length; i++) {
            const window = windows[i];
            const visible = window.select(state);
            if (visible === window.last) continue;
            window.last = visible;
            deliver(window.consumer, visible, view.window);
        }
    });

    // `pin` HOISTS NOTHING HERE, and that is the honest answer for this library: a
    // write is a DISPATCHED ACTION carrying an id, and there is no handle to hold. The
    // rest: `redux-toolkit.md`.
    let unsubscribeCells: () => void = () => undefined;
    let cells: TCellConfig = { ids: [], ranks: [] };
    const labelText: string[] = [];
    const noteText: string[] = [];

    return {
        ...editor,
        readAll: () => Object.values(store.getState().rows.entities),
        deliverableRows: () => undefined,
        groupOrder: group => groupOrderOf(store.getState().rows, group),
        // Dropping the window subscription is the whole of the window teardown here: a
        // selector nobody calls costs nothing at all. The rest: `redux-toolkit.md`.
        pin: config => {
            unsubscribe();
            cells = config;
            const opening = store.getState().rows.entities;
            for (let i = 0; i < cells.ids.length; i++) {
                const row = opening[cells.ids[i]];
                labelText[i] = row.label;
                noteText[i] = row.note;
            }
            unsubscribeCells = store.subscribe(() => {
                const entities = store.getState().rows.entities;
                let labelMoved = false;
                let noteMoved = false;
                for (let i = 0; i < cells.ids.length; i++) {
                    const row = entities[cells.ids[i]];
                    if (row.label !== labelText[i]) {
                        labelText[i] = row.label;
                        labelMoved = true;
                    }
                    if (row.note !== noteText[i]) {
                        noteText[i] = row.note;
                        noteMoved = true;
                    }
                }
                if (labelMoved) deliverCells(bindings[0].consumer, cells, labelText);
                if (noteMoved) deliverCells(bindings[1].consumer, cells, noteText);
            });
            deliverCells(bindings[0].consumer, cells, labelText);
            deliverCells(bindings[1].consumer, cells, noteText);
        },
        patchPinnedLabel: (at, label) => editor.patchLabel(cells.ids[at], label),
        patchPinnedNote: (at, note) => editor.patchNote(cells.ids[at], note),
        settle: () => undefined,
        dispose: () => {
            unsubscribe();
            unsubscribeCells();
        },
    };
};

// The rows slice without the key index, with `store.subscribe` per subscriber.
// https://redux.js.org/api/store#subscribelistener REDUX HAS NO PER-ROW EDGE AND THIS
// WIRING DOES NOT INVENT ONE. The rest: `redux-toolkit.md`.
const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    const store = configureStore({
        reducer: { rows: rowsSlice.reducer },
        middleware: getDefault => getDefault(PRODUCTION_MIDDLEWARE),
    });
    const editor = rowEditorOf(action => store.dispatch(action), rowsSlice.actions);

    let churnIds: readonly string[] = [];
    const churnRead: (string | undefined)[] = [];
    const stop: ((() => void) | undefined)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    // A wake is counted only when what `select` produced differs from what it produced
    // last time — see the header on why the two quantities differ here.
    const subscribe = <T>(
        at: number,
        select: (state: TRootState) => T,
        textOf: (value: T) => string
    ): (() => void) => {
        let last = select(store.getState());
        churnRead[at] = textOf(last);
        return store.subscribe(() => {
            const next = select(store.getState());
            if (next === last) return;
            last = next;
            churnWoke++;
            churnRead[at] = textOf(next);
        });
    };

    const labelOf = (row: TRow | undefined): string =>
        row === undefined ? '' : row.label;

    const composedOf =
        (from: number, count: number) =>
        (entities: TEntities): string => {
            let text = '';
            for (let i = from + count - 1; i >= from; i--) {
                const row = held(entities, churnIds[i]);
                if (row !== undefined) text = row.label;
            }
            return text;
        };

    const joinedComposedOf =
        (from: number, count: number) =>
        (entities: TEntities): string => {
            let text = labelOf(held(entities, churnIds[from]));
            for (let i = from + 1; i < from + count; i++) {
                text = `${text},${labelOf(held(entities, churnIds[i]))}`;
            }
            return text;
        };

    return {
        ...editor,
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        // Every listener has already run. What is left is the frame boundary — one
        // delivery if anything woke, none if nothing did.
        settle: () => {
            if (churnWoke === 0) return;
            deliverChurn(churnConsumer, churnId, churnRank, churnWoke, churnRead);
            churnWoke = 0;
        },
        readAll: () => Object.values(store.getState().rows.entities),
        deliverableRows: () => undefined,
        groupOrder: () => undefined,
        // NOTHING TO HOIST, and that is the honest answer for this library: a write is
        // a DISPATCHED ACTION carrying an id and there is no handle to hold, so the ids
        // are what a subscriber is built over. The rest: `redux-toolkit.md`.
        holdChurnRows: (ids, ranks) => {
            churnIds = ids;
            churnId = ids[0];
            churnRank = ranks[0];
            for (let i = 0; i < ids.length; i++) churnRead[i] = undefined;
        },
        mountOnRows: (at, from, count) => {
            if (count === 1) {
                const id = churnIds[from];
                stop[at] = subscribe(at, state => held(state.rows.entities, id), labelOf);
                return;
            }
            const compose = composedOf(from, count);
            stop[at] = subscribe(at, state => compose(state.rows.entities), text => text);
        },
        mountOnColumn: at => {
            const id = churnIds[0];
            stop[at] = subscribe(at, state => labelOf(held(state.rows.entities, id)), text => text);
        },
        mountOnChain: (at, from, count, depth) => {
            const compose = joinedComposedOf(from, count);
            let head: (state: TRootState) => string = createSelector(
                [(state: TRootState): TEntities => state.rows.entities],
                entities => chainLevelOf(compose(entities), 1)
            );
            for (let level = 2; level <= depth; level++) {
                head = createSelector([head], text => chainLevelOf(text, level));
            }
            stop[at] = subscribe(at, head, text => text);
        },
        mountOnDiamond: (at, from) => {
            const id = churnIds[from];
            const selectLabel = (state: TRootState): string =>
                labelOf(held(state.rows.entities, id));
            const selectLeft = createSelector([selectLabel], diamondLeftOf);
            const selectRight = createSelector([selectLabel], diamondRightOf);
            const selectJoin = createSelector(
                [selectLeft, selectRight],
                diamondJoinOf
            );
            stop[at] = subscribe(at, selectJoin, text => text);
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

type TViewState = { group: string; offset: number };

// VIEW A'S CURSOR, AS A SECOND SLICE. The rest: `redux-toolkit.md`.
const viewSlice = createSlice({
    name: 'view',
    initialState: { group: '', offset: 0 } as TViewState,
    reducers: {
        scrolled: (state, action: PayloadAction<number>) => {
            state.offset = action.payload;
        },
        switched: (state, action: PayloadAction<string>) => {
            state.group = action.payload;
            state.offset = 0;
        },
    },
});

type TReadRootState = { rows: TGroupedRowsState; view: TViewState };

// A scroll runs the one subscriber, because Redux has one edge; view B's memo returns
// the array it returned last time and is not delivered. The rest: `redux-toolkit.md`.
const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const store = configureStore({
        reducer: { rows: groupedRowsSlice.reducer, view: viewSlice.reducer },
        middleware: getDefault => getDefault(PRODUCTION_MIDDLEWARE),
    });
    const editor = rowEditorOf(action => store.dispatch(action), groupedRowsSlice.actions);
    store.dispatch(viewSlice.actions.switched(view.groupA));

    const selectEntities = (state: TReadRootState): TEntities => state.rows.entities;
    const selectPageRows = createSelector(
        [
            selectEntities,
            (state: TReadRootState) => state.rows.idsByGroup[state.view.group],
            (state: TReadRootState) => state.view.offset,
        ],
        (entities, ids, offset) => selectionOf(entities, ids, offset + view.window, false),
        SHALLOW_RESULT
    );
    const selectOnAxis = createSelector(
        [selectEntities, (state: TReadRootState) => state.rows.idsByGroup[view.groupA]],
        (entities, ids) => selectionOf(entities, ids, view.window, true),
        SHALLOW_RESULT
    );

    const found: TRow[] = [];

    let lastPageRows: readonly TRow[] | undefined;
    let lastOffset = -1;
    let lastOnAxis: readonly TRow[] | undefined;
    // react-redux `useSelector`'s default: render only when the selected reference changed.
    const unsubscribe = store.subscribe(() => {
        const state = store.getState();
        const pageRows = selectPageRows(state);
        const offset = state.view.offset;
        if (pageRows !== lastPageRows || offset !== lastOffset) {
            lastPageRows = pageRows;
            lastOffset = offset;
            deliverPage(consumers.a, pageRows, offset, view.window);
        }
        const onAxis = selectOnAxis(state);
        if (onAxis !== lastOnAxis) {
            lastOnAxis = onAxis;
            deliverPage(consumers.b, onAxis, 0, view.window);
        }
    });

    return {
        ...editor,
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        // ONE ENTITY-RECORD LOOKUP PER KEY, out of the slice's own state. Nothing is
        // resolved in advance and nothing is dispatched, so no subscriber runs.
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            const entities = store.getState().rows.entities;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const row = held(entities, keys[from + i]);
                if (row !== undefined) found.push(row);
            }
            deliverPage(consumers.a, found, 0, count);
        },
        // No row is written and no rank moves; `state.rows` comes out
        // reference-identical, which is what view B's memo compares against.
        scrollTo: to => store.dispatch(viewSlice.actions.scrolled(to)),
        switchGroup: group => store.dispatch(viewSlice.actions.switched(group)),
        // A no-op: `dispatch` notifies before it returns.
        settle: () => undefined,
        readAll: () => Object.values(store.getState().rows.entities),
        deliverableRows: () => undefined,
        groupOrder: group => groupOrderOf(store.getState().rows, group),
        dispose: () => {
            unsubscribe();
            found.length = 0;
        },
    };
};

type TOwners = Record<string, TOwner>;
type TPairs = Record<string, TPairRow>;
type TRelationRootState = {
    rows: TRowsState;
    owners: { entities: TOwners };
    pairs: { entities: TPairs };
};

// A separate slice and not a second record inside `rowsSlice`, which is what makes the
// join measurable at all: Immer marks the modified branch only, so a write to an owner
// leaves `state.pairs` REFERENCE-IDENTICAL and the pair view's memoised selector hits
// its cache.
const ownersSlice = createSlice({
    name: 'owners',
    initialState: { entities: {} } as { entities: TOwners },
    reducers: {
        writeOwners: (state, action: PayloadAction<readonly TOwner[]>) => {
            const incoming = action.payload;
            for (let i = 0; i < incoming.length; i++) {
                const owner = incoming[i];
                state.entities[owner.id] = { id: owner.id, name: owner.name };
            }
        },
        patchOwnerName: (state, action: PayloadAction<{ id: string; name: string }>) => {
            const stored: TOwner | undefined = state.entities[action.payload.id];
            if (stored !== undefined) stored.name = action.payload.name;
        },
    },
});

// Redux normalises by one key per slice, so a pair address is a joined string — the arm
// `TRelationBinding.writePair` puts against a descent through identities.
const pairsSlice = createSlice({
    name: 'pairs',
    initialState: { entities: {} } as { entities: TPairs },
    reducers: {
        seedPairs: (state, action: PayloadAction<TRelationConfig>) => {
            const given = action.payload;
            for (let i = 0; i < given.ids.length; i++) {
                const owner = given.owners[i];
                const row = given.ids[i];
                state.entities[`${owner} ${row}`] = { owner, row, mark: given.seeds[i] };
            }
        },
        writePair: (state, action: PayloadAction<{ key: string; mark: string }>) => {
            const stored: TPairRow | undefined = state.entities[action.payload.key];
            if (stored !== undefined) stored.mark = action.payload.mark;
        },
    },
});

// THREE SLICES in one state tree, which is the documented reason `createSlice` and
// normalisation exist. The rest: `redux-toolkit.md`.
const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    const store = configureStore({
        reducer: {
            rows: rowsSlice.reducer,
            owners: ownersSlice.reducer,
            pairs: pairsSlice.reducer,
        },
        middleware: getDefault => getDefault(PRODUCTION_MIDDLEWARE),
    });
    const editor = rowEditorOf(action => store.dispatch(action), rowsSlice.actions);

    let config: TRelationConfig = { ids: [], ranks: [], owners: [], touched: [], names: [], seeds: [] };
    let unsubscribe: () => void = () => undefined;

    return {
        ...editor,
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        writeOwners: owners => store.dispatch(ownersSlice.actions.writeOwners(owners)),
        // The selectors are built here because each is a function of `config`, which
        // arrives with this call, and per binding for the reason `bindViews` gives — a
        // `createSelector` carries its own cache. The rest: `redux-toolkit.md`.
        holdRelation: given => {
            config = given;
            store.dispatch(pairsSlice.actions.seedPairs(given));
            const selectNames = createSelector(
                [(state: TRelationRootState) => state.owners.entities],
                entities => given.owners.map(owner => entities[owner]?.name ?? ''),
                SHALLOW_RESULT
            );
            const selectMarks = createSelector(
                [(state: TRelationRootState) => state.pairs.entities],
                entities => given.ids.map((row, i) => entities[`${given.owners[i]} ${row}`]?.mark ?? ''),
                SHALLOW_RESULT
            );
            let lastNames: readonly string[] | undefined;
            let lastMarks: readonly string[] | undefined;
            // react-redux `useSelector`'s default: render only when the selected reference changed.
            const renderBoth = (): void => {
                const state = store.getState();
                const names = selectNames(state);
                if (names !== lastNames) {
                    lastNames = names;
                    deliverRelation(consumers.a, config, names);
                }
                const marks = selectMarks(state);
                if (marks !== lastMarks) {
                    lastMarks = marks;
                    deliverRelation(consumers.b, config, marks);
                }
            };
            unsubscribe = store.subscribe(renderBoth);
            renderBoth();
        },
        // Modifies the owners slice alone, so the pair selector's input is
        // reference-identical and view B re-runs no derivation.
        patchOwnerName: (at, name) =>
            store.dispatch(ownersSlice.actions.patchOwnerName({ id: config.touched[at], name })),
        // The address string is built fresh every call: caching eight of them would
        // make the row a measurement of an array read.
        writePair: (at, mark) =>
            store.dispatch(pairsSlice.actions.writePair({ key: `${config.owners[at]} ${config.ids[at]}`, mark })),
        // A no-op: `dispatch` runs the subscriber before it returns.
        settle: () => undefined,
        readAll: () => Object.values(store.getState().rows.entities),
        deliverableRows: () => undefined,
        groupOrder: () => undefined,
        readOwners: () => Object.values(store.getState().owners.entities),
        // THE ADDRESS IS READ OUT OF THE RECORD ITSELF: the slice's keys are this
        // file's own composition, so answering from them would make the audit agree
        // with whatever the composition did.
        readPairs: () => Object.values(store.getState().pairs.entities),
        dispose: () => unsubscribe(),
    };
};


/* ── one value, one subscriber, and a second value beside it ───────────── */

type TSingleState = { value: string; bystander: string };

// The smallest thing the cited guide can be asked for: a slice whose state is the two
// values, one reducer that writes the first, and the store's own subscribe as the
// change signal. The rest: `redux-toolkit.md`.
const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
    const slice = createSlice({
        name: 'single',
        initialState: { value: '', bystander: '' } as TSingleState,
        reducers: {
            writeSingle: (state, action: PayloadAction<string>) => {
                state.value = action.payload;
            },
            seedSingle: (_state, action: PayloadAction<TSingleState>) => action.payload,
        },
    });
    const store = configureStore({
        reducer: { single: slice.reducer },
        middleware: getDefault => getDefault(PRODUCTION_MIDDLEWARE),
    });
    const stop: (() => void)[] = [];
    let name = '';
    let bystanderName = '';
    let read = '';
    let readBystander = '';
    let woke = false;
    let wokeBystander = false;

    const stateOf = (): TSingleState => store.getState().single;

    return {
        ...noRowStore('redux-toolkit'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            store.dispatch(slice.actions.seedSingle({ value: config.seeds[0], bystander: config.seeds[1] }));
            read = config.seeds[0];
            readBystander = config.seeds[1];
            // react-redux `useSelector`'s default: a listener whose selected value is `===` does not render.
            stop.push(
                store.subscribe(() => {
                    const next = stateOf().value;
                    if (next === read) return;
                    read = next;
                    woke = true;
                })
            );
            stop.push(
                store.subscribe(() => {
                    const next = stateOf().bystander;
                    if (next === readBystander) return;
                    readBystander = next;
                    wokeBystander = true;
                })
            );
            deliverSingle(consumers.a, name, read);
            deliverSingle(consumers.b, bystanderName, readBystander);
        },
        writeSingle: next => store.dispatch(slice.actions.writeSingle(next)),
        readSingle: () => stateOf().value,
        readBystander: () => stateOf().bystander,
        frame: run => run(),
        // Every listener has already run. What is left is the frame boundary.
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

export const reduxToolkitAdapter: TAdapter = {
    name: 'redux-toolkit',
    version: '2.13.0',
    docs: 'https://redux.js.org/usage/deriving-data-selectors',
    departure:
        "no createEntityAdapter, the normalising guide's own helper: its upsert assigns a freshly " +
        'built object per row, which defeats the Immer no-op the re-send scenario measures. Each ' +
        "subscriber applies react-redux useSelector's default bail-out — a view is delivered only " +
        'when what it selected differs by reference from last time — which this bench drives ' +
        'without React; every selector returning an array is a reselect `createSelector` with ' +
        "`resultEqualityCheck: shallowEqual` (react-redux's), so a recomputed view holding the same " +
        'row objects keeps its old reference, and each pinned cell compares its own selected string. ' +
        'Outside a frame every write is one action; inside `frame` the writes are buffered and ' +
        'dispatched as ONE `edited` action as the frame returns, the style guide\'s "avoid ' +
        'dispatching many actions in a row". churn.column selects the label string and compares ' +
        'it by `===`, exactly as the row shapes compare the selected row. A reducer rebuilds each ' +
        'touched group array once per action by filtering its original; the timed teardown is the ' +
        'two unsubscribe calls, leaving the store to the collector.',
    admission:
        'the row values live in the Redux store — the rows slice\'s `entities` record, written only ' +
        'by its reducers — and `store.subscribe`, which Redux calls at the end of every dispatch, is ' +
        'what drives the consumer; under the window and read wirings the `idsByGroup` index beside it ' +
        'is slice state written by those same reducers and holds ids, never values.',

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
    // THE SAME BODY, HANDED FIFTY VIEWS INSTEAD OF TWO — the two builders differ
    // by the view list and nothing else, so this row compares libraries.
    bindPerGroup: (consumers, view) => bindViews(consumers.views, view),
};
