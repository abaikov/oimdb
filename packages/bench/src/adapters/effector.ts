import { clearNode, combine, createEvent, createStore } from 'effector';
import type { Store, Subscription, Unit } from 'effector';
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

// No batch(fn) in effector 23; a frame here writes each row store at most once (`effector.md`).
const frame = (run: () => void): void => {
    run();
};

/** An Effector event carries one payload, so a two-argument write is an object. */
type TLabelPatch = { id: string; label: string };
type TNotePatch = { id: string; note: string };
type TGroupMove = { id: string; group: string };
type TRankMove = { id: string; rank: number };
type TRemoval = readonly string[];

/** Both halves in ONE store value, for a reason of Effector's — see the header. */
type TStoreState = {
    rows: ReadonlyMap<string, TRow>;
    byGroup: ReadonlyMap<string, readonly string[]>;
};

/** What view A selects: one store value, so a switch is one update and not two. */
type TCursor = { group: string; offset: number };

type TGroupRows = ReadonlyMap<string, TRow>;

type TGroupOp =
    | { kind: 'write'; rows: readonly TRow[] }
    | { kind: 'patch'; id: string; change: Partial<TRow> }
    | { kind: 'drop'; ids: TRemoval };

type TGroupNode = {
    store: Store<TGroupRows>;
    apply: (ops: readonly TGroupOp[]) => void;
    pending: TGroupOp[];
};

type TCellStores = [Store<string>?, ...Store<string>[]];

const mintGroup = (): TGroupNode => {
    const opsApplied = createEvent<readonly TGroupOp[]>();
    const store = createStore<TGroupRows>(new Map()).on(
        opsApplied,
        (state, ops) => {
            let rows: Map<string, TRow> | undefined;
            for (let o = 0; o < ops.length; o++) {
                const op = ops[o];
                if (op.kind === 'write') {
                    rows ??= new Map(state);
                    for (let i = 0; i < op.rows.length; i++) {
                        rows.set(op.rows[i].id, { ...op.rows[i] });
                    }
                } else if (op.kind === 'patch') {
                    const held = (rows ?? state).get(op.id);
                    if (held === undefined) continue;
                    rows ??= new Map(state);
                    rows.set(op.id, { ...held, ...op.change });
                } else {
                    for (let i = 0; i < op.ids.length; i++) {
                        if (!(rows ?? state).has(op.ids[i])) continue;
                        rows ??= new Map(state);
                        rows.delete(op.ids[i]);
                    }
                }
            }
            return rows ?? state;
        }
    );
    return { store, apply: opsApplied, pending: [] };
};

const listIn = <TKey, TItem>(
    lists: Map<TKey, TItem[]>,
    key: TKey
): TItem[] => {
    let list = lists.get(key);
    if (list === undefined) {
        list = [];
        lists.set(key, list);
    }
    return list;
};

// The group test reads the row's own column, not which store it was filed in.
const visibleOfGroup = (
    rows: TGroupRows,
    group: string,
    window: number
): TRow[] => {
    const out: TRow[] = [];
    let held = 0;
    for (const row of rows.values()) {
        if (row.group !== group) continue;
        if (held >= window) {
            if (compareRows(row, out[held - 1]) >= 0) continue;
            let at = held - 1;
            while (at > 0 && compareRows(out[at - 1], row) > 0) {
                out[at] = out[at - 1];
                at--;
            }
            out[at] = row;
            continue;
        }
        let at = held++;
        while (at > 0 && compareRows(out[at - 1], row) > 0) {
            out[at] = out[at - 1];
            at--;
        }
        out[at] = row;
    }
    // No truncation needed: the array is fresh and only ever written below
    // `held`, so its length already IS `held`.
    return out;
};

// Recipe: Effector's own model, unmodified. State is a `Store`, every change is an
// `Event` the store is `.on`-ed to, derived state is `.map`, and `.watch` is the
// subscription. The rest: `effector.md`.
const bindViews = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    const byGroup = new Map<string, TGroupNode>();
    // id → the group node its row is filed in: a TABLE OF HANDLES, never of values.
    const nodeOf = new Map<string, TGroupNode>();

    const nodeFor = (group: string): TGroupNode => {
        let node = byGroup.get(group);
        if (node === undefined) {
            node = mintGroup();
            byGroup.set(group, node);
        }
        return node;
    };

    // A frame is one event per touched group store, its payload that store's ops in order.
    let framing = false;
    const touched: TGroupNode[] = [];
    const framedIds = new Set<string>();

    const release = (node: TGroupNode): void => {
        if (node.pending.length === 0) return;
        const ops = node.pending;
        node.pending = [];
        node.apply(ops);
    };

    const send = (node: TGroupNode, op: TGroupOp): void => {
        if (!framing) {
            node.apply([op]);
            return;
        }
        if (node.pending.length === 0) touched.push(node);
        node.pending.push(op);
        if (op.kind === 'patch') {
            framedIds.add(op.id);
        } else if (op.kind === 'write') {
            for (let i = 0; i < op.rows.length; i++) framedIds.add(op.rows[i].id);
        }
    };

    const groupFrame = (run: () => void): void => {
        framing = true;
        run();
        framing = false;
        for (let i = 0; i < touched.length; i++) release(touched[i]);
        touched.length = 0;
        framedIds.clear();
    };

    const patch = (id: string, change: Partial<TRow>): void => {
        const node = nodeOf.get(id);
        if (node !== undefined) send(node, { kind: 'patch', id, change });
    };

    const windows = bindings.map(bound => {
        const $window = nodeFor(bound.group).store.map(rows =>
            visibleOfGroup(rows, bound.group, view.window)
        );
        return {
            node: $window,
            stop: $window.watch(visible =>
                deliver(bound.consumer, visible, view.window)
            ),
        };
    });

    // THE CELL WIRING, empty until `pin`: a `.map` per pinned cell and column, and a
    // `combine` per column over its cells. The rest: `effector.md`.
    const pinnedIds: string[] = [];
    const pinnedNodes: TGroupNode[] = [];
    const cellStop: Subscription[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };
    // The FIRST TWO consumers of this wiring — A and B under `bind`. The
    // targeted-delivery script is a two-view script and is never bound per group.
    const labelConsumer = bindings[0].consumer;
    const noteConsumer = bindings[1].consumer;
    const cellNodes: Unit<unknown>[] = [];

    const pinnedTextOf = (column: 'label' | 'note'): Store<string[]> => {
        const cellStores: TCellStores = [];
        for (let i = 0; i < pinnedIds.length; i++) {
            const id = pinnedIds[i];
            const cellStore = pinnedNodes[i].store.map(
                rows => rows.get(id)?.[column] ?? ''
            );
            cellStores.push(cellStore);
            cellNodes.push(cellStore);
        }
        // A tuple `combine` hands its callback the whole array at position 0, as in `joinedOf`.
        const $text = combine(cellStores, (...held: unknown[]) =>
            (held[0] as readonly string[]).slice()
        );
        cellNodes.push($text);
        return $text;
    };

    return {
        write: incoming => {
            const joining = new Map<TGroupNode, TRow[]>();
            const leaving = new Map<TGroupNode, string[]>();
            for (let i = 0; i < incoming.length; i++) {
                const row = incoming[i];
                const left = nodeOf.get(row.id);
                const joined = nodeFor(row.group);
                if (left !== undefined && left !== joined) {
                    listIn(leaving, left).push(row.id);
                }
                listIn(joining, joined).push(row);
                nodeOf.set(row.id, joined);
            }
            for (const [node, ids] of leaving) send(node, { kind: 'drop', ids });
            for (const [node, rows] of joining) send(node, { kind: 'write', rows });
        },
        remove: ids => {
            const leaving = new Map<TGroupNode, string[]>();
            for (let i = 0; i < ids.length; i++) {
                const node = nodeOf.get(ids[i]);
                if (node === undefined) continue;
                nodeOf.delete(ids[i]);
                listIn(leaving, node).push(ids[i]);
            }
            for (const [node, going] of leaving) {
                send(node, { kind: 'drop', ids: going });
            }
        },
        patchLabel: (id, label) => patch(id, { label }),
        patchNote: (id, note) => patch(id, { note }),
        setGroup: (id, group) => {
            const left = nodeOf.get(id);
            if (left === undefined) return;
            if (framedIds.has(id)) release(left);
            const held = left.store.getState().get(id);
            if (held === undefined) return;
            const joined = nodeFor(group);
            if (joined === left) {
                send(left, { kind: 'patch', id, change: { group } });
                return;
            }
            send(left, { kind: 'drop', ids: [id] });
            nodeOf.set(id, joined);
            send(joined, { kind: 'write', rows: [{ ...held, group }] });
        },
        setRank: (id, rank) => patch(id, { rank }),
        // `pin` takes the window derivations OUT OF THE GRAPH and puts the cell
        // derivations in. The rest: `effector.md`.
        pin: config => {
            for (const held of windows) {
                held.stop.unsubscribe();
                clearNode(held.node);
            }
            windows.length = 0;
            cells = config;
            pinnedIds.length = 0;
            pinnedNodes.length = 0;
            for (let i = 0; i < config.ids.length; i++) {
                const node = nodeOf.get(config.ids[i]);
                if (node === undefined) continue;
                pinnedIds.push(config.ids[i]);
                pinnedNodes.push(node);
            }
            const $labels = pinnedTextOf('label');
            const $notes = pinnedTextOf('note');
            cellStop.push(
                $labels.watch(text => deliverCells(labelConsumer, cells, text))
            );
            cellStop.push(
                $notes.watch(text => deliverCells(noteConsumer, cells, text))
            );
        },
        // A PIN RESOLVES NOTHING FOR THIS LIBRARY: the id → node table is read on
        // every write, so `patchPinnedLabel` costs what `patchLabel` costs.
        patchPinnedLabel: (at, label) => patch(pinnedIds[at], { label }),
        patchPinnedNote: (at, note) => patch(pinnedIds[at], { note }),
        frame: groupFrame,
        settle: () => undefined,
        // The group stores' own state: a reducer that dropped a write shows here.
        readAll: () => {
            const out: TRow[] = [];
            for (const node of byGroup.values()) {
                for (const row of node.store.getState().values()) out.push(row);
            }
            return out;
        },
        deliverableRows: () => undefined,
        groupOrder: group => {
            const node = byGroup.get(group);
            if (node === undefined) return [];
            return orderedIdsOfRows(Array.from(node.store.getState().values()));
        },
        dispose: () => {
            for (const held of windows) {
                held.stop.unsubscribe();
                clearNode(held.node);
            }
            windows.length = 0;
            for (let i = 0; i < cellStop.length; i++) cellStop[i].unsubscribe();
            cellStop.length = 0;
            for (const node of cellNodes) clearNode(node);
            cellNodes.length = 0;
            pinnedIds.length = 0;
            pinnedNodes.length = 0;
            touched.length = 0;
            framedIds.clear();
            byGroup.clear();
            nodeOf.clear();
        },
    };
};

/** ONE ROW: the store holding it and the event that replaces it. */
type TRowNode = { store: Store<TRow>; patch: (next: TRow) => void };

// The stores one subscriber reads, WRITTEN AS A TUPLE for `TOwnerStores`' reason: that
// is what `combine`'s `Tuple` constraint accepts.
type TRowStores = [Store<TRow>?, ...Store<TRow>[]];

// A `Store` PER ROW here, where the window wiring holds the whole population in one —
// and that is Effector's own shape rather than a convenience. The rest: `effector.md`.
const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    /** id → that row's own store and the event that writes it. */
    // A TABLE OF HANDLES, never of values: admitted because A KEY LOOKUP IS NOT
    // STORAGE — the value lives in the Effector store this addresses, and the event
    // beside it is the only thing that writes it. `packages/bench/PARTICIPANTS.md`.
    const byId = new Map<string, TRowNode>();

    const mintRow = (row: TRow): TRowNode => {
        const patched = createEvent<TRow>();
        return {
            store: createStore<TRow>({ ...row }).on(patched, (_, next) => next),
            patch: patched,
        };
    };

    /** The churn rows' stores, in `holdChurnRows` order. */
    const churnStores: Store<TRow>[] = [];
    /** What each subscriber last read. */
    const churnRead: (string | undefined)[] = [];
    type TMounted = { nodes: Unit<unknown>[]; stop: Subscription };
    const mounted: (TMounted | undefined)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    const readerOf = (at: number): ((text: string) => void) => text => {
        churnWoke++;
        churnRead[at] = text;
    };

    const joinedOf = (
        from: number,
        count: number,
        derive: (label: string) => string
    ): Store<string> => {
        const sources: TRowStores = [];
        for (let i = from; i < from + count; i++) sources.push(churnStores[i]);
        // The tuple's optional first element survives the mapped type, so the
        // callback is handed the whole array at position 0 — `bindRelationStore`
        // reads its `combine` the same way. The assertion says that and no more.
        return combine(sources, (...held: unknown[]) => {
            const rows = held[0] as readonly TRow[];
            let text = '';
            for (let i = rows.length - 1; i >= 0; i--) text = rows[i].label;
            return derive(text);
        });
    };

    const chainJoinedOf = (from: number, count: number): Store<string> => {
        const sources: TRowStores = [];
        for (let i = from; i < from + count; i++) sources.push(churnStores[i]);
        return combine(sources, (...held: unknown[]) => {
            const rows = held[0] as readonly TRow[];
            let text = rows[0].label;
            for (let i = 1; i < rows.length; i++) text = `${text},${rows[i].label}`;
            return chainLevelOf(text, 1);
        });
    };

    return {
        write: incoming => {
            for (let i = 0; i < incoming.length; i++) {
                const row = incoming[i];
                const held = byId.get(row.id);
                if (held === undefined) byId.set(row.id, mintRow(row));
                else held.patch({ ...row });
            }
        },
        remove: ids => {
            for (let i = 0; i < ids.length; i++) byId.delete(ids[i]);
        },
        patchLabel: (id, label) => {
            const held = byId.get(id);
            if (held === undefined) return;
            held.patch({ ...held.store.getState(), label });
        },
        patchNote: (id, note) => {
            const held = byId.get(id);
            if (held === undefined) return;
            held.patch({ ...held.store.getState(), note });
        },
        setGroup: (id, group) => {
            const held = byId.get(id);
            if (held === undefined) return;
            held.patch({ ...held.store.getState(), group });
        },
        setRank: (id, rank) => {
            const held = byId.get(id);
            if (held === undefined) return;
            held.patch({ ...held.store.getState(), rank });
        },
        // A churn binding derives no view and no churn script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        // Every listener has already run; what is left is the frame boundary —
        // one delivery if anything woke, none if nothing did.
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
        readAll: () => {
            const held: TRow[] = [];
            for (const node of byId.values()) held.push(node.store.getState());
            return held;
        },
        deliverableRows: () => undefined,
        /** NOTHING TO READ: no view is derived and there is no group index. */
        groupOrder: () => undefined,
        /** THE STORES, RESOLVED ONCE — the `byId.get` a point write opens with. */
        holdChurnRows: (ids, ranks) => {
            churnId = ids[0];
            churnRank = ranks[0];
            for (let i = 0; i < ids.length; i++) {
                const held = byId.get(ids[i]);
                if (held !== undefined) churnStores.push(held.store);
                churnRead[i] = undefined;
            }
        },
        mountOnRows: (at, from, count) => {
            const woke = readerOf(at);
            if (count === 1) {
                const source = churnStores[from];
                mounted[at] = {
                    nodes: [],
                    stop: source.updates.watch(row => woke(row.label)),
                };
                churnRead[at] = source.getState().label;
                return;
            }
            const node = joinedOf(from, count, label => label);
            mounted[at] = { nodes: [node], stop: node.updates.watch(woke) };
            churnRead[at] = node.getState();
        },
        mountOnColumn: at => {
            const node = churnStores[0].map(row => row.label);
            mounted[at] = {
                nodes: [node],
                stop: node.updates.watch(readerOf(at)),
            };
            churnRead[at] = node.getState();
        },
        mountOnChain: (at, from, count, depth) => {
            let below = chainJoinedOf(from, count);
            const nodes: Unit<unknown>[] = [below];
            for (let level = 2; level <= depth; level++) {
                below = below.map(text => chainLevelOf(text, level));
                nodes.push(below);
            }
            mounted[at] = { nodes, stop: below.updates.watch(readerOf(at)) };
            churnRead[at] = below.getState();
        },
        mountOnDiamond: (at, from) => {
            const root = churnStores[from];
            const left = root.map(row => diamondLeftOf(row.label));
            const right = root.map(row => diamondRightOf(row.label));
            const join = combine(left, right, diamondJoinOf);
            mounted[at] = {
                nodes: [left, right, join],
                stop: join.updates.watch(readerOf(at)),
            };
            churnRead[at] = join.getState();
        },
        unmount: at => {
            const held = mounted[at];
            if (held === undefined) return;
            held.stop.unsubscribe();
            for (let i = 0; i < held.nodes.length; i++) clearNode(held.nodes[i]);
            mounted[at] = undefined;
            churnRead[at] = undefined;
        },
        dispose: () => {
            for (let i = 0; i < mounted.length; i++) {
                const held = mounted[i];
                if (held === undefined) continue;
                held.stop.unsubscribe();
                for (let n = 0; n < held.nodes.length; n++) {
                    clearNode(held.nodes[n]);
                }
            }
            mounted.length = 0;
            churnStores.length = 0;
            churnRead.length = 0;
            byId.clear();
        },
    };
};

// WHY VIEW A'S CURSOR IS ITS OWN STORE AND NOT A FIELD OF THE FIRST: a scroll or a
// switch must reach view A and NOT view B, and one store value is one edge. The
// rest: `effector.md`.
const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const rowsWritten = createEvent<readonly TRow[]>();
    const labelPatched = createEvent<TLabelPatch>();
    const notePatched = createEvent<TNotePatch>();
    const groupMoved = createEvent<TGroupMove>();
    const rankMoved = createEvent<TRankMove>();
    const rowsRemoved = createEvent<TRemoval>();
    const scrolled = createEvent<number>();
    const switched = createEvent<string>();

    const $state = createStore<TStoreState>({
        rows: new Map<string, TRow>(),
        byGroup: new Map<string, readonly string[]>(),
    })
        .on(rowsWritten, (state, incoming) => {
            const rows = new Map(state.rows);
            let drafts: Map<string, string[]> | undefined;
            const draftOf = (group: string): string[] => {
                if (drafts === undefined) drafts = new Map();
                let draft = drafts.get(group);
                if (draft === undefined) {
                    draft = (state.byGroup.get(group) ?? []).slice();
                    drafts.set(group, draft);
                }
                return draft;
            };
            for (let i = 0; i < incoming.length; i++) {
                const row = incoming[i];
                const stored = rows.get(row.id);
                rows.set(row.id, { ...row });
                if (stored === undefined) {
                    draftOf(row.group).push(row.id);
                } else if (stored.group !== row.group) {
                    const leaving = draftOf(stored.group);
                    const at = leaving.indexOf(row.id);
                    if (at >= 0) leaving.splice(at, 1);
                    draftOf(row.group).push(row.id);
                }
            }
            if (drafts === undefined) return { rows, byGroup: state.byGroup };
            const byGroup = new Map(state.byGroup);
            for (const [group, ids] of drafts) byGroup.set(group, ids);
            return { rows, byGroup };
        })
        .on(labelPatched, (state, { id, label }) => {
            const held = state.rows.get(id);
            if (held === undefined) return state;
            const rows = new Map(state.rows);
            rows.set(id, { ...held, label });
            return { rows, byGroup: state.byGroup };
        })
        .on(notePatched, (state, { id, note }) => {
            const held = state.rows.get(id);
            if (held === undefined) return state;
            const rows = new Map(state.rows);
            rows.set(id, { ...held, note });
            return { rows, byGroup: state.byGroup };
        })
        .on(groupMoved, (state, { id, group }) => {
            const held = state.rows.get(id);
            if (held === undefined) return state;
            const rows = new Map(state.rows);
            rows.set(id, { ...held, group });
            if (held.group === group) return { rows, byGroup: state.byGroup };
            const byGroup = new Map(state.byGroup);
            byGroup.set(
                held.group,
                (byGroup.get(held.group) ?? []).filter(heldId => heldId !== id)
            );
            byGroup.set(group, [...(byGroup.get(group) ?? []), id]);
            return { rows, byGroup };
        })
        .on(rankMoved, (state, { id, rank }) => {
            const held = state.rows.get(id);
            if (held === undefined) return state;
            const rows = new Map(state.rows);
            rows.set(id, { ...held, rank });
            return { rows, byGroup: state.byGroup };
        })
        .on(rowsRemoved, (state, ids) => {
            const rows = new Map(state.rows);
            const going = new Set<string>();
            const touched = new Set<string>();
            for (let i = 0; i < ids.length; i++) {
                const held = rows.get(ids[i]);
                if (held === undefined) continue;
                rows.delete(ids[i]);
                going.add(ids[i]);
                touched.add(held.group);
            }
            if (going.size === 0) return state;
            const byGroup = new Map(state.byGroup);
            for (const group of touched) {
                byGroup.set(
                    group,
                    (byGroup.get(group) ?? []).filter(id => !going.has(id))
                );
            }
            return { rows, byGroup };
        });

    const $cursor = createStore<TCursor>({ group: view.groupA, offset: 0 })
        .on(scrolled, (cursor, offset) => ({ group: cursor.group, offset }))
        .on(switched, (_, group) => ({ group, offset: 0 }));

    /** Reused only by the pull; both views hand back fresh arrays. */
    const found: TRow[] = [];

    const selectOf = (
        state: TStoreState,
        group: string,
        limit: number,
        axis: boolean
    ): TRow[] => {
        const ids = state.byGroup.get(group);
        const out: TRow[] = [];
        if (ids === undefined) return out;
        let held = 0;
        for (let i = 0; i < ids.length; i++) {
            const row = state.rows.get(ids[i]);
            if (row === undefined || row.group !== group) continue;
            if (axis && !onSecondAxis(row.id)) continue;
            if (held >= limit) {
                if (compareRows(row, out[held - 1]) >= 0) continue;
                let at = held - 1;
                while (at > 0 && compareRows(out[at - 1], row) > 0) {
                    out[at] = out[at - 1];
                    at--;
                }
                out[at] = row;
                continue;
            }
            let at = held++;
            while (at > 0 && compareRows(out[at - 1], row) > 0) {
                out[at] = out[at - 1];
                at--;
            }
            out[at] = row;
        }
        return out;
    };

    const $paged = combine($state, $cursor, (state, cursor) => ({
        offset: cursor.offset,
        rows: selectOf(
            state,
            cursor.group,
            cursor.offset + view.window,
            false
        ),
    }));
    const $onAxis = $state.map(state =>
        selectOf(state, view.groupA, view.window, true)
    );

    const nodes: Unit<unknown>[] = [$paged, $onAxis];
    const stop: Subscription[] = [
        $paged.watch(held =>
            deliverPage(consumers.a, held.rows, held.offset, view.window)
        ),
        $onAxis.watch(rows => deliverPage(consumers.b, rows, 0, view.window)),
    ];

    return {
        write: incoming => rowsWritten(incoming),
        remove: ids => rowsRemoved(ids),
        patchLabel: (id, label) => labelPatched({ id, label }),
        patchNote: (id, note) => notePatched({ id, note }),
        setGroup: (id, group) => groupMoved({ id, group }),
        setRank: (id, rank) => rankMoved({ id, rank }),
        // No read script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        // ONE `Map.get` PER KEY out of the store's own value. Nothing is resolved in
        // advance and nothing is remembered between pages.
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            const rows = $state.getState().rows;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const row = rows.get(keys[from + i]);
                if (row !== undefined) found.push(row);
            }
            deliverPage(consumers.a, found, 0, count);
        },
        // ONE EVENT ON ONE STORE. Nothing is re-ordered and no row is touched;
        // `$onAxis` is a `.map` of `$state`, which did not update, so it is not
        // recomputed at all.
        scrollTo: to => scrolled(to),
        switchGroup: group => switched(group),
        settle: () => undefined,
        readAll: () => Array.from($state.getState().rows.values()),
        deliverableRows: () => undefined,
        groupOrder: group => {
            const state = $state.getState();
            const ids = state.byGroup.get(group);
            if (ids === undefined) return [];
            const held: TRow[] = [];
            for (let i = 0; i < ids.length; i++) {
                const row = state.rows.get(ids[i]);
                if (row !== undefined) held.push(row);
            }
            return orderedIdsOfRows(held);
        },
        dispose: () => {
            for (let i = 0; i < stop.length; i++) stop[i].unsubscribe();
            stop.length = 0;
            for (let i = 0; i < nodes.length; i++) clearNode(nodes[i]);
            nodes.length = 0;
            found.length = 0;
        },
    };
};

type TPairMark = { key: string; mark: string };

// ONE OWNER: the store holding it and the event that renames it. A rename is fired at
// the store rather than at a map, so nothing looks the owner up.
type TOwnerNode = { store: Store<TOwner>; rename: (name: string) => void };

// The owner stores view A derives from, in `config.touched` order. The rest:
// `effector.md`.
type TOwnerStores = [Store<TOwner>?, ...Store<TOwner>[]];

// TWO ENTITY TYPES — the rows in one store, the pair records in another, and the owners
// one store each, which is the reason the cursor got its own store in `bindReadStore`:
// ONE STORE VALUE IS ONE EDGE, so an owner write and a pair write can only be told
// apart by landing in different stores. The rest: `effector.md`.
const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    const rowsWritten = createEvent<readonly TRow[]>();
    const labelPatched = createEvent<TLabelPatch>();
    const notePatched = createEvent<TNotePatch>();
    const groupMoved = createEvent<TGroupMove>();
    const rankMoved = createEvent<TRankMove>();
    const rowsRemoved = createEvent<TRemoval>();
    const pairsSeeded = createEvent<TRelationConfig>();
    const pairMarked = createEvent<TPairMark>();

    const $rows = createStore<ReadonlyMap<string, TRow>>(new Map())
        .on(rowsWritten, (state, incoming) => {
            const rows = new Map(state);
            for (let i = 0; i < incoming.length; i++) {
                const row = incoming[i];
                rows.set(row.id, { ...row });
            }
            return rows;
        })
        .on(labelPatched, (state, { id, label }) => {
            const held = state.get(id);
            if (held === undefined) return state;
            const rows = new Map(state);
            rows.set(id, { ...held, label });
            return rows;
        })
        .on(notePatched, (state, { id, note }) => {
            const held = state.get(id);
            if (held === undefined) return state;
            const rows = new Map(state);
            rows.set(id, { ...held, note });
            return rows;
        })
        .on(groupMoved, (state, { id, group }) => {
            const held = state.get(id);
            if (held === undefined) return state;
            const rows = new Map(state);
            rows.set(id, { ...held, group });
            return rows;
        })
        .on(rankMoved, (state, { id, rank }) => {
            const held = state.get(id);
            if (held === undefined) return state;
            const rows = new Map(state);
            rows.set(id, { ...held, rank });
            return rows;
        })
        .on(rowsRemoved, (state, ids) => {
            const rows = new Map(state);
            let dropped = false;
            for (let i = 0; i < ids.length; i++) {
                if (rows.delete(ids[i])) dropped = true;
            }
            return dropped ? rows : state;
        });

    // id → store and its event: a table of HANDLES, not storage.
    const ownerById = new Map<string, TOwnerNode>();

    const $pairs = createStore<ReadonlyMap<string, TPairRow>>(new Map())
        .on(pairsSeeded, (state, given) => {
            const pairs = new Map(state);
            for (let i = 0; i < given.ids.length; i++) {
                const owner = given.owners[i];
                const row = given.ids[i];
                pairs.set(`${owner} ${row}`, {
                    owner,
                    row,
                    mark: given.seeds[i],
                });
            }
            return pairs;
        })
        .on(pairMarked, (state, { key, mark }) => {
            const held = state.get(key);
            if (held === undefined) return state;
            const pairs = new Map(state);
            pairs.set(key, { owner: held.owner, row: held.row, mark });
            return pairs;
        });

    let config: TRelationConfig = {
        ids: [],
        ranks: [],
        owners: [],
        touched: [],
        names: [],
        seeds: [],
    };
    /** The owners the join script writes, by POSITION in `config.touched`. */
    const touchedOwners: TOwnerNode[] = [];
    /** Their stores, in the same order — view A's dependency list. */
    const touchedStores: TOwnerStores = [];
    /** Which of those stores each rendered line's name comes from. */
    const ownerAt: number[] = [];
    const nodes: Store<string[]>[] = [];
    const stop: Subscription[] = [];

    const pairKey = (owner: string, row: string): string => `${owner} ${row}`;

    return {
        write: incoming => rowsWritten(incoming),
        remove: ids => rowsRemoved(ids),
        patchLabel: (id, label) => labelPatched({ id, label }),
        patchNote: (id, note) => notePatched({ id, note }),
        setGroup: (id, group) => groupMoved({ id, group }),
        setRank: (id, rank) => rankMoved({ id, rank }),
        // No relation script pins: the targeted-delivery script is a two-view
        // script and is bound by `bind`.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        writeOwners: owners => {
            for (let i = 0; i < owners.length; i++) {
                const owner = owners[i];
                const renamed = createEvent<string>();
                const store = createStore<TOwner>({
                    id: owner.id,
                    name: owner.name,
                }).on(renamed, (held, name) => ({ id: held.id, name }));
                ownerById.set(owner.id, { store, rename: renamed });
            }
        },
        // THE STORES BOTH SCRIPTS WORK THROUGH, RESOLVED ONCE, and the pair records at
        // their seeds. The rest: `effector.md`.
        holdRelation: given => {
            config = given;
            pairsSeeded(given);
            for (let at = 0; at < given.touched.length; at++) {
                const held = ownerById.get(given.touched[at]);
                if (held === undefined) continue;
                touchedOwners.push(held);
                touchedStores.push(held.store);
            }
            for (let i = 0; i < given.ids.length; i++) {
                ownerAt.push(given.touched.indexOf(given.owners[i]));
            }
            // The tuple's optional first element survives the mapped type, so the
            // callback is handed `[TOwner?, ...]` widened back to the store type
            // at position 0. The assertion says that and nothing more.
            const names = combine(touchedStores, (...held: unknown[]) => {
                const owners = held[0] as readonly (TOwner | undefined)[];
                const text: string[] = [];
                for (let i = 0; i < ownerAt.length; i++) {
                    const owner = owners[ownerAt[i]];
                    text.push(owner === undefined ? '' : owner.name);
                }
                return text;
            });
            const marks = $pairs.map(pairs => {
                const text: string[] = [];
                for (let i = 0; i < given.ids.length; i++) {
                    const pair = pairs.get(
                        `${given.owners[i]} ${given.ids[i]}`
                    );
                    text.push(pair === undefined ? '' : pair.mark);
                }
                return text;
            });
            nodes.push(names, marks);
            stop.push(
                names.watch(text => {
                    deliverRelation(consumers.a, config, text);
                })
            );
            stop.push(
                marks.watch(text => {
                    deliverRelation(consumers.b, config, text);
                })
            );
        },
        // ONE EVENT ON ONE OWNER'S OWN STORE, at a POSITION — no map read. It reaches
        // view A because that store is in view A's dependency list, and it cannot reach
        // view B, which names no owner store.
        patchOwnerName: (at, name) => {
            touchedOwners[at].rename(name);
        },
        // COMPOSE THE ADDRESS AND FIRE. The string is built fresh every call: caching
        // eight of them would make the row a measurement of an array read.
        writePair: (at, mark) => {
            pairMarked({
                key: pairKey(config.owners[at], config.ids[at]),
                mark,
            });
        },
        settle: () => undefined,
        readAll: () => Array.from($rows.getState().values()),
        deliverableRows: () => undefined,
        /** NOTHING TO READ: no window, no group, no sort, no group index. */
        groupOrder: () => undefined,
        readOwners: () => {
            const held: TOwner[] = [];
            for (const owner of ownerById.values()) {
                held.push(owner.store.getState());
            }
            return held;
        },
        // EVERY PAIR RECORD, WITH THE ADDRESS READ OUT OF THE RECORD ITSELF: the map's
        // keys are this file's own composition, so answering from them would make the
        // audit agree with whatever the composition did.
        readPairs: () => Array.from($pairs.getState().values()),
        dispose: () => {
            for (let i = 0; i < stop.length; i++) stop[i].unsubscribe();
            stop.length = 0;
            // Only the derived stores: the owner stores are roots and recompute
            // nothing, exactly as `$rows` and `$pairs` do not.
            for (const node of nodes) clearNode(node);
            nodes.length = 0;
            touchedOwners.length = 0;
            touchedStores.length = 0;
            ownerAt.length = 0;
            ownerById.clear();
        },
    };
};


/* ── one value, one subscriber, and a second value beside it ───────────── */

// `createStore(initial)` is Effector's own scalar and an EVENT is the only way anything
// is written to one — the shape its store documentation opens with. The rest:
// `effector.md`.
const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
    const valueWritten = createEvent<string>();
    // A SECOND EVENT, FOR THE SEED ALONE. The rest: `effector.md`.
    const bystanderWritten = createEvent<string>();
    const value = createStore('').on(valueWritten, (_, next) => next);
    const bystander = createStore('').on(bystanderWritten, (_, next) => next);
    const stop: Subscription[] = [];
    let name = '';
    let bystanderName = '';
    let read = '';
    let readBystander = '';
    let woke = false;
    let wokeBystander = false;

    return {
        ...noRowStore('effector'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            valueWritten(config.seeds[0]);
            bystanderWritten(config.seeds[1]);
            read = value.getState();
            readBystander = bystander.getState();
            stop.push(
                value.updates.watch(next => {
                    read = next;
                    woke = true;
                })
            );
            stop.push(
                bystander.updates.watch(next => {
                    readBystander = next;
                    wokeBystander = true;
                })
            );
            woke = false;
            wokeBystander = false;
            deliverSingle(consumers.a, name, read);
            deliverSingle(consumers.b, bystanderName, readBystander);
        },
        writeSingle: next => {
            valueWritten(next);
        },
        readSingle: () => value.getState(),
        readBystander: () => bystander.getState(),
        frame,
        // Every watcher has already run; what is left is the frame boundary.
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
            for (let i = 0; i < stop.length; i++) stop[i].unsubscribe();
            stop.length = 0;
            clearNode(value);
            clearNode(bystander);
            clearNode(valueWritten);
            clearNode(bystanderWritten);
        },
    };
};

export const effectorAdapter: TAdapter = {
    name: 'effector',
    version: '23.4.4',
    docs: 'https://effector.dev/docs/api/effector/store',
    departure:
        'a reducer must be pure, so a point write copies the Map of the store it lands in, where the ' +
        'other rows assign into the row they already hold. The window and cell wirings hold one store ' +
        'PER GROUP, created at bind for the watched groups because a derived store fixes its inputs ' +
        'at construction, so a point write copies its own group\'s Map, wakes that group\'s view ' +
        'alone, and a move is two events on two stores. Effector 23 exports no batch(fn), so in ' +
        'those two wirings `frame` collects the frame\'s writes and fires ONE event per touched ' +
        'group store with the array of them, the Effector idiom for a bulk edit: the store copies ' +
        'its Map once and its view recomputes once per frame. Each pinned cell is a `.map` of its ' +
        'row\'s group store down to one column\'s string, so Effector\'s own `===` skip keeps a label ' +
        'write away from the note consumer. The read wiring keeps the population in ONE ' +
        'store, because view A re-points to another group on a switch and a `combine` cannot change ' +
        'its inputs, so a point write there copies all of it; only the four moves of the two-axis ' +
        'script write there. In the churn, read, relation and single wirings `frame` calls its ' +
        'function directly. The churn wiring, which subscribes ' +
        'only after `holdChurnRows` has resolved its rows, holds a `Store` per row and copies that ' +
        'row alone, as the relation wiring does for its owners. The window array a derived store ' +
        'produces is allocated fresh on every recomputation, so Effector\'s own identity skip can ' +
        'never fire on a view; and a removal rebuilds each touched store once for the whole batch ' +
        'rather than per removed row.',
    admission:
        'the rows live in Effector `Store`s — one per group in the window wiring, beside an id -> ' +
        'group-store table that holds handles only; one holding a Map keyed by id in the read wiring, ' +
        'whose `byGroup` index holds ids only, never a value; one per row in the churn and relation ' +
        'wirings — replaced by a reducer on every write, and each consumer is driven by `.watch` or ' +
        '`.updates.watch` on the store it reads.',

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
