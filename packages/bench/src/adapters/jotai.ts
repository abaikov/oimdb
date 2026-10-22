import { atom, createStore } from 'jotai/vanilla';
import type { Atom, Getter, Setter } from 'jotai/vanilla';
import { atomFamily } from 'jotai-family';
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

type TStore = ReturnType<typeof createStore>;

type TStoreAccess = { get: Getter; set: Setter };

type TFramedStore = {
    access: TStoreAccess;
    frame: (run: () => void) => void;
};

// jotai/vanilla/internals.js:495-531 vs 695-709: a write function's `set` defers the flush, `store.set` does not.
const framedStoreOf = (store: TStore): TFramedStore => {
    const access: TStoreAccess = { get: store.get, set: store.set };
    let open = false;
    const frameAtom = atom(null, (get, set, run: () => void) => {
        access.get = get;
        access.set = set;
        open = true;
        try {
            run();
        } finally {
            access.get = store.get;
            access.set = store.set;
            open = false;
        }
    });
    return {
        access,
        frame: run => {
            if (open) run();
            else store.set(frameAtom, run);
        },
    };
};

type TRowAtomOf = (id: string) => Atom<TRow | undefined>;

type TGroupIdsAtomOf = (group: string) => Atom<readonly string[]>;

const columnFamiliesOf = (rowAtomOf: TRowAtomOf) => ({
    group: atomFamily((id: string) => atom(get => get(rowAtomOf(id))?.group)),
    rank: atomFamily((id: string) => atom(get => get(rowAtomOf(id))?.rank ?? 0)),
    label: atomFamily((id: string) => atom(get => get(rowAtomOf(id))?.label ?? '')),
});

type TColumnFamilies = ReturnType<typeof columnFamiliesOf>;

const precedes = (rank: number, id: string, otherRank: number, otherId: string): boolean =>
    rank < otherRank || (rank === otherRank && id < otherId);

// Never reads a row atom: a write to a column it does not read stops at the column atom.
const selectIds = (
    get: Getter,
    columns: TColumnFamilies,
    groupIdsAtomOf: TGroupIdsAtomOf,
    group: string,
    limit: number,
    labelsFrom: number,
    axis: boolean
): readonly string[] => {
    const ids = get(groupIdsAtomOf(group));
    const outIds: string[] = [];
    const outRanks: number[] = [];
    let held = 0;
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (axis && !onSecondAxis(id)) continue;
        if (get(columns.group(id)) !== group) continue;
        const rank = get(columns.rank(id));
        let at: number;
        if (held >= limit) {
            if (!precedes(rank, id, outRanks[held - 1], outIds[held - 1])) continue;
            at = held - 1;
        } else {
            at = held++;
        }
        while (at > 0 && precedes(rank, id, outRanks[at - 1], outIds[at - 1])) {
            outIds[at] = outIds[at - 1];
            outRanks[at] = outRanks[at - 1];
            at--;
        }
        outIds[at] = id;
        outRanks[at] = rank;
    }
    for (let i = labelsFrom; i < held; i++) get(columns.label(outIds[i]));
    return outIds;
};

const rowsOf = (store: TStore, rowAtomOf: TRowAtomOf, ids: readonly string[]): TRow[] => {
    const rows: TRow[] = [];
    for (let i = 0; i < ids.length; i++) {
        const row = store.get(rowAtomOf(ids[i]));
        if (row !== undefined) rows.push(row);
    }
    return rows;
};

// Recipe: the framework-free store plus the two documented composition primitives — a
// derived atom for the view, a write-only atom for the batch. The rest: `jotai.md`.
const bindViews = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    const store = createStore();
    const { access, frame } = framedStoreOf(store);
    const rowFamily = atomFamily((_id: string) =>
        atom<TRow | undefined>(undefined)
    );
    // A jotai atom rather than a plain Map, and it has to be: a row moving into a group
    // is not a write to anything the destination view already reads, so the bucket
    // itself is what must invalidate it. The rest: `jotai.md`.
    const groupIdsFamily = atomFamily((_group: string) =>
        atom<readonly string[]>([])
    );

    const columns = columnFamiliesOf(rowFamily);

    // ONE DERIVED ATOM PER VIEW, SUBSCRIBED — two, or fifty. The rest: `jotai.md`.
    const windows = bindings.map(bound => ({
        consumer: bound.consumer,
        ids: atom(get =>
            selectIds(get, columns, groupIdsFamily, bound.group, view.window, 0, false)
        ),
    }));
    const stop = windows.map(state =>
        store.sub(state.ids, () =>
            deliver(
                state.consumer,
                rowsOf(store, rowFamily, store.get(state.ids)),
                view.window
            )
        )
    );

    // `pinned` holds ATOMS: what the pin hoists out of the clock is the family's own
    // key lookup, which every point write opens with. The rest: `jotai.md`.
    const pinned: ReturnType<typeof rowFamily>[] = [];
    const labelAtoms: Atom<string>[] = [];
    const noteAtoms: Atom<string>[] = [];
    const cellStop: (() => void)[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };
    const labelText: string[] = [];
    const noteText: string[] = [];
    /** The targeted-delivery script is a two-view script and is never bound per group. */
    const labelConsumer = bindings[0].consumer;
    const noteConsumer = bindings[1].consumer;

    const renderLabels = (): void => {
        for (let i = 0; i < labelAtoms.length; i++) {
            labelText[i] = store.get(labelAtoms[i]);
        }
        deliverCells(labelConsumer, cells, labelText);
    };
    const renderNotes = (): void => {
        for (let i = 0; i < noteAtoms.length; i++) {
            noteText[i] = store.get(noteAtoms[i]);
        }
        deliverCells(noteConsumer, cells, noteText);
    };

    // Every `set` inside a write-only atom's write function is part of ONE transaction,
    // flushed when the outermost `store.set` returns, so a load of n rows is one
    // delivery per view rather than n. The rest: `jotai.md`.
    const writeRows = atom(null, (get, set, incoming: readonly TRow[]) => {
        let drafts: Map<string, string[]> | undefined;
        const draftOf = (group: string): string[] => {
            if (drafts === undefined) drafts = new Map();
            let draft = drafts.get(group);
            if (draft === undefined) {
                draft = get(groupIdsFamily(group)).slice();
                drafts.set(group, draft);
            }
            return draft;
        };
        for (let i = 0; i < incoming.length; i++) {
            const row = incoming[i];
            const rowAtom = rowFamily(row.id);
            const stored = get(rowAtom);
            // Copied so the value the store holds is not the harness's object.
            set(rowAtom, { ...row });
            if (stored === undefined) {
                draftOf(row.group).push(row.id);
            } else if (stored.group !== row.group) {
                const leaving = draftOf(stored.group);
                const at = leaving.indexOf(row.id);
                if (at >= 0) leaving.splice(at, 1);
                draftOf(row.group).push(row.id);
            }
        }
        if (drafts !== undefined) {
            for (const [group, draft] of drafts) {
                set(groupIdsFamily(group), draft);
            }
        }
    });

    // THE ROW'S ATOM AND ITS GROUP'S, because only emptying the row's would leave the
    // view reading an atom holding `undefined` for ever — a different store from one
    // the row has left. The rest: `jotai.md`.
    const removeRows = atom(null, (get, set, ids: readonly string[]) => {
        const going = new Set(ids);
        const touched = new Set<string>();
        for (let i = 0; i < ids.length; i++) {
            const rowAtom = rowFamily(ids[i]);
            const row = get(rowAtom);
            if (row !== undefined) touched.add(row.group);
            set(rowAtom, undefined);
        }
        for (const group of touched) {
            const groupAtom = groupIdsFamily(group);
            set(
                groupAtom,
                get(groupAtom).filter(id => !going.has(id))
            );
        }
    });

    // Three atoms, ONE transaction. The rest: `jotai.md`.
    const moveRow = atom(null, (get, set, id: string, group: string) => {
        const rowAtom = rowFamily(id);
        const row = get(rowAtom);
        if (row === undefined) return;
        set(rowAtom, { ...row, group });
        if (row.group === group) return;
        const from = groupIdsFamily(row.group);
        set(
            from,
            get(from).filter(held => held !== id)
        );
        const to = groupIdsFamily(group);
        set(to, [...get(to), id]);
    });

    return {
        write: incoming => {
            access.set(writeRows, incoming);
        },
        remove: ids => {
            access.set(removeRows, ids);
        },
        // A single `store.set` is already its own batch. The rest: `jotai.md`.
        patchLabel: (id, label) => {
            const rowAtom = rowFamily(id);
            const row = access.get(rowAtom);
            if (row !== undefined) access.set(rowAtom, { ...row, label });
        },
        // The row atom changes; the window's column atoms recompute to equal values and stop it.
        patchNote: (id, note) => {
            const rowAtom = rowFamily(id);
            const row = access.get(rowAtom);
            if (row !== undefined) access.set(rowAtom, { ...row, note });
        },
        setGroup: (id, group) => {
            access.set(moveRow, id, group);
        },
        setRank: (id, rank) => {
            const rowAtom = rowFamily(id);
            const row = access.get(rowAtom);
            if (row !== undefined) access.set(rowAtom, { ...row, rank });
        },
        // THE ATOMS, RESOLVED ONCE, and ONE DERIVED ATOM PER PINNED CELL: jotai's
        // `Object.is` on the column's string is what keeps a label write from waking
        // the note view. The rest: `jotai.md`.
        pin: config => {
            for (let i = 0; i < stop.length; i++) stop[i]();
            stop.length = 0;
            cells = config;
            pinned.length = 0;
            labelAtoms.length = 0;
            noteAtoms.length = 0;
            for (let i = 0; i < config.ids.length; i++) {
                const rowAtom = rowFamily(config.ids[i]);
                pinned.push(rowAtom);
                labelAtoms.push(
                    atom(get => {
                        const row = get(rowAtom);
                        return row === undefined ? '' : row.label;
                    })
                );
                noteAtoms.push(
                    atom(get => {
                        const row = get(rowAtom);
                        return row === undefined ? '' : row.note;
                    })
                );
            }
            labelText.length = pinned.length;
            noteText.length = pinned.length;
            for (let i = 0; i < pinned.length; i++) {
                cellStop.push(store.sub(labelAtoms[i], renderLabels));
                cellStop.push(store.sub(noteAtoms[i], renderNotes));
            }
            // Untimed: the state every sample starts from.
            renderLabels();
            renderNotes();
        },
        patchPinnedLabel: (at, label) => {
            const rowAtom = pinned[at];
            const row = access.get(rowAtom);
            if (row !== undefined) access.set(rowAtom, { ...row, label });
        },
        patchPinnedNote: (at, note) => {
            const rowAtom = pinned[at];
            const row = access.get(rowAtom);
            if (row !== undefined) access.set(rowAtom, { ...row, note });
        },
        frame,
        // Nothing to do: the recompute and the listener flush both happen before
        // the outermost `store.set` returns.
        settle: () => undefined,
        // THE FAMILY'S OWN KEYS AND NOT THE GROUP ATOMS, deliberately: the group atoms
        // are what the views iterate, so an audit reading them could agree with the
        // views about a row that had fallen out of both. The rest: `jotai.md`.
        readAll: () => {
            const held: TRow[] = [];
            for (const id of rowFamily.getParams()) {
                const row = store.get(rowFamily(id));
                if (row !== undefined) held.push(row);
            }
            return held;
        },
        deliverableRows: () => undefined,
        // THE GROUP'S IDS ATOM — the structure `readAll` deliberately does not read,
        // and what `selectIds` derives from. The rest: `jotai.md`.
        groupOrder: group => {
            const ids = store.get(groupIdsFamily(group));
            const held: TRow[] = [];
            for (let i = 0; i < ids.length; i++) {
                const row = store.get(rowFamily(ids[i]));
                if (row !== undefined) held.push(row);
            }
            return orderedIdsOfRows(held);
        },
        // Unsubscribing unmounts the view atoms and everything they had mounted. The
        // rest: `jotai.md`.
        dispose: () => {
            for (let i = 0; i < stop.length; i++) stop[i]();
            stop.length = 0;
            for (let i = 0; i < cellStop.length; i++) cellStop[i]();
            cellStop.length = 0;
            pinned.length = 0;
            labelAtoms.length = 0;
            noteAtoms.length = 0;
        },
    };
};


// `store.sub(atom, listener)` is the documented framework-free surface
// (https://jotai.org/docs/core/store): subscribing MOUNTS an atom and, transitively,
// everything it read. The rest: `jotai.md`.
const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    const store = createStore();
    const { access, frame } = framedStoreOf(store);
    const rowFamily = atomFamily((_id: string) =>
        atom<TRow | undefined>(undefined)
    );

    type TRowAtom = ReturnType<typeof rowFamily>;
    const churnAtoms: TRowAtom[] = [];
    const churnRead: (string | undefined)[] = [];
    const stop: (() => void)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    const readRowInto = (at: number, first: TRowAtom): void => {
        const row = store.get(first);
        churnRead[at] = row === undefined ? '' : row.label;
    };

    const readHeadInto = (at: number, head: Atom<string>): void => {
        churnRead[at] = store.get(head);
    };

    const readerOf = (at: number, first: TRowAtom): (() => void) => () => {
        churnWoke++;
        readRowInto(at, first);
    };

    const headReaderOf = (at: number, head: Atom<string>): (() => void) => () => {
        churnWoke++;
        readHeadInto(at, head);
    };

    /** The window binding's batch, minus the group index no view here needs. */
    const writeRows = atom(null, (_get, set, incoming: readonly TRow[]) => {
        for (let i = 0; i < incoming.length; i++) {
            const row = incoming[i];
            set(rowFamily(row.id), { ...row });
        }
    });

    const removeRows = atom(null, (_get, set, ids: readonly string[]) => {
        for (let i = 0; i < ids.length; i++) set(rowFamily(ids[i]), undefined);
    });

    const patch = (id: string, change: Partial<TRow>): void => {
        const rowAtom = rowFamily(id);
        const row = access.get(rowAtom);
        if (row !== undefined) access.set(rowAtom, { ...row, ...change });
    };

    return {
        write: incoming => {
            access.set(writeRows, incoming);
        },
        remove: ids => {
            access.set(removeRows, ids);
        },
        patchLabel: (id, label) => patch(id, { label }),
        patchNote: (id, note) => patch(id, { note }),
        setGroup: (id, group) => patch(id, { group }),
        setRank: (id, rank) => patch(id, { rank }),
        // A churn binding derives no view and no churn script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        // Every listener has already run. What is left is the frame boundary: one
        // delivery if anything woke, none if nothing did.
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
            for (const id of rowFamily.getParams()) {
                const row = store.get(rowFamily(id));
                if (row !== undefined) held.push(row);
            }
            return held;
        },
        deliverableRows: () => undefined,
        /** NOTHING TO READ: no view is derived and there is no `groupIdsFamily`. */
        groupOrder: () => undefined,
        // THE ATOMS, RESOLVED ONCE — the family lookup every point write opens with,
        // hoisted out of the clock.
        holdChurnRows: (ids, ranks) => {
            churnId = ids[0];
            churnRank = ranks[0];
            for (let i = 0; i < ids.length; i++) {
                churnAtoms.push(rowFamily(ids[i]));
                churnRead[i] = undefined;
            }
        },
        // The branch is on the SHAPE the script asked for and not on anything read out
        // of the store.
        mountOnRows: (at, from, count) => {
            const first = churnAtoms[from];
            if (count === 1) {
                stop[at] = store.sub(first, readerOf(at, first));
                readRowInto(at, first);
                return;
            }
            const sources = churnAtoms.slice(from, from + count);
            const composed = atom(get => {
                let text = '';
                for (let i = sources.length - 1; i >= 0; i--) {
                    const row = get(sources[i]);
                    if (row !== undefined) text = row.label;
                }
                return text;
            });
            stop[at] = store.sub(composed, readerOf(at, first));
            readRowInto(at, first);
        },
        mountOnColumn: at => {
            const first = churnAtoms[0];
            const column = atom(get => {
                const row = get(first);
                return row === undefined ? '' : row.label;
            });
            stop[at] = store.sub(column, readerOf(at, first));
            readRowInto(at, first);
        },
        /** Subscribing to the head mounts every level and every root beneath it. */
        mountOnChain: (at, from, count, depth) => {
            const sources = churnAtoms.slice(from, from + count);
            let below: Atom<string> = atom(get => {
                let text = get(sources[0])?.label ?? '';
                for (let i = 1; i < sources.length; i++) {
                    text = `${text},${get(sources[i])?.label ?? ''}`;
                }
                return chainLevelOf(text, 1);
            });
            for (let level = 2; level <= depth; level++) {
                const under = below;
                below = atom(get => chainLevelOf(get(under), level));
            }
            stop[at] = store.sub(below, headReaderOf(at, below));
            readHeadInto(at, below);
        },
        mountOnDiamond: (at, from) => {
            const root = churnAtoms[from];
            const left = atom(get => diamondLeftOf(get(root)?.label ?? ''));
            const right = atom(get => diamondRightOf(get(root)?.label ?? ''));
            const join = atom(get => diamondJoinOf(get(left), get(right)));
            stop[at] = store.sub(join, headReaderOf(at, join));
            readHeadInto(at, join);
        },
        unmount: at => {
            const release = stop[at];
            if (release === undefined) return;
            release();
            stop[at] = undefined as unknown as () => void;
            churnRead[at] = undefined;
        },
        dispose: () => {
            for (let i = 0; i < stop.length; i++) stop[i]?.();
            stop.length = 0;
            churnAtoms.length = 0;
            churnRead.length = 0;
        },
    };
};

// WHY THE OFFSET IS AN ATOM: a scroll has to reach the consumer through jotai's own
// invalidation, and a plain variable would leave this adapter deciding when to render.
// The rest: `jotai.md`.
const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const store = createStore();
    const { access, frame } = framedStoreOf(store);
    const rowFamily = atomFamily((_id: string) =>
        atom<TRow | undefined>(undefined)
    );
    const groupIdsFamily = atomFamily((_group: string) =>
        atom<readonly string[]>([])
    );
    const offsetAtom = atom(0);
    const pagedGroupAtom = atom(view.groupA);
    const switchPagedGroup = atom(null, (_get, set, group: string) => {
        set(pagedGroupAtom, group);
        set(offsetAtom, 0);
    });
    /** Reused only by the pull. */
    const found: TRow[] = [];
    const columns = columnFamiliesOf(rowFamily);

    const pagedAtom = atom(get => {
        const offset = get(offsetAtom);
        return {
            offset,
            ids: selectIds(
                get,
                columns,
                groupIdsFamily,
                get(pagedGroupAtom),
                offset + view.window,
                offset,
                false
            ),
        };
    });
    const onAxisAtom = atom(get =>
        selectIds(get, columns, groupIdsFamily, view.groupA, view.window, 0, true)
    );

    const stop = [
        store.sub(pagedAtom, () => {
            const held = store.get(pagedAtom);
            deliverPage(
                consumers.a,
                rowsOf(store, rowFamily, held.ids),
                held.offset,
                view.window
            );
        }),
        store.sub(onAxisAtom, () => {
            deliverPage(
                consumers.b,
                rowsOf(store, rowFamily, store.get(onAxisAtom)),
                0,
                view.window
            );
        }),
    ];

    const writeRows = atom(null, (get, set, incoming: readonly TRow[]) => {
        let drafts: Map<string, string[]> | undefined;
        const draftOf = (group: string): string[] => {
            if (drafts === undefined) drafts = new Map();
            let draft = drafts.get(group);
            if (draft === undefined) {
                draft = get(groupIdsFamily(group)).slice();
                drafts.set(group, draft);
            }
            return draft;
        };
        for (let i = 0; i < incoming.length; i++) {
            const row = incoming[i];
            const rowAtom = rowFamily(row.id);
            const stored = get(rowAtom);
            set(rowAtom, { ...row });
            if (stored === undefined) {
                draftOf(row.group).push(row.id);
            } else if (stored.group !== row.group) {
                const leaving = draftOf(stored.group);
                const at = leaving.indexOf(row.id);
                if (at >= 0) leaving.splice(at, 1);
                draftOf(row.group).push(row.id);
            }
        }
        if (drafts !== undefined) {
            for (const [group, draft] of drafts) {
                set(groupIdsFamily(group), draft);
            }
        }
    });

    const removeRows = atom(null, (get, set, ids: readonly string[]) => {
        const going = new Set(ids);
        const touched = new Set<string>();
        for (let i = 0; i < ids.length; i++) {
            const rowAtom = rowFamily(ids[i]);
            const row = get(rowAtom);
            if (row !== undefined) touched.add(row.group);
            set(rowAtom, undefined);
        }
        for (const group of touched) {
            const groupAtom = groupIdsFamily(group);
            set(
                groupAtom,
                get(groupAtom).filter(id => !going.has(id))
            );
        }
    });

    const moveRow = atom(null, (get, set, id: string, group: string) => {
        const rowAtom = rowFamily(id);
        const row = get(rowAtom);
        if (row === undefined) return;
        set(rowAtom, { ...row, group });
        if (row.group === group) return;
        const from = groupIdsFamily(row.group);
        set(
            from,
            get(from).filter(held => held !== id)
        );
        const to = groupIdsFamily(group);
        set(to, [...get(to), id]);
    });

    const patch = (id: string, change: Partial<TRow>): void => {
        const rowAtom = rowFamily(id);
        const row = access.get(rowAtom);
        if (row !== undefined) access.set(rowAtom, { ...row, ...change });
    };

    return {
        write: incoming => {
            access.set(writeRows, incoming);
        },
        remove: ids => {
            access.set(removeRows, ids);
        },
        patchLabel: (id, label) => patch(id, { label }),
        patchNote: (id, note) => patch(id, { note }),
        setGroup: (id, group) => {
            access.set(moveRow, id, group);
        },
        setRank: (id, rank) => patch(id, { rank }),
        // No read script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        // ONE FAMILY LOOKUP AND ONE `store.get` PER KEY. Nothing is hoisted;
        // `store.get` outside an atom's read function tracks nothing and mounts
        // nothing.
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const row = store.get(rowFamily(keys[from + i]));
                if (row !== undefined) found.push(row);
            }
            deliverPage(consumers.a, found, 0, count);
        },
        // No row is touched; view B has never read this atom and is not recomputed.
        scrollTo: to => {
            access.set(offsetAtom, to);
        },
        switchGroup: group => {
            access.set(switchPagedGroup, group);
        },
        frame,
        // A no-op: the recompute and the listener flush both happen inside `set`.
        settle: () => undefined,
        readAll: () => {
            const held: TRow[] = [];
            for (const id of rowFamily.getParams()) {
                const row = store.get(rowFamily(id));
                if (row !== undefined) held.push(row);
            }
            return held;
        },
        deliverableRows: () => undefined,
        groupOrder: group => {
            const ids = store.get(groupIdsFamily(group));
            const held: TRow[] = [];
            for (let i = 0; i < ids.length; i++) {
                const row = store.get(rowFamily(ids[i]));
                if (row !== undefined) held.push(row);
            }
            return orderedIdsOfRows(held);
        },
        dispose: () => {
            for (const release of stop) release();
            stop.length = 0;
            found.length = 0;
        },
    };
};

// A second `atomFamily` for the owners, and a third keyed by a JOINED PAIR OF IDS for
// the records addressed by one identity of each. The rest: `jotai.md`.
const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    const store = createStore();
    const { access, frame } = framedStoreOf(store);
    const rowFamily = atomFamily((_id: string) =>
        atom<TRow | undefined>(undefined)
    );
    const ownerFamily = atomFamily((_id: string) =>
        atom<TOwner | undefined>(undefined)
    );
    /** One atom per COMPOSED address. */
    const pairFamily = atomFamily((_key: string) =>
        atom<TPairRow | undefined>(undefined)
    );

    type TOwnerAtom = ReturnType<typeof ownerFamily>;
    type TPairAtom = ReturnType<typeof pairFamily>;

    let config: TRelationConfig = {
        ids: [],
        ranks: [],
        owners: [],
        touched: [],
        names: [],
        seeds: [],
    };
    /** The owners the join script writes, by POSITION in `config.touched`. */
    const touchedAtoms: TOwnerAtom[] = [];
    /** The owner atom each rendered line's name comes from, in `ids` order. */
    const rowOwnerAtoms: TOwnerAtom[] = [];
    /** The pair atom each rendered line's mark comes from, in `ids` order. */
    const rowPairAtoms: TPairAtom[] = [];
    const stop: (() => void)[] = [];

    const pairKey = (owner: string, row: string): string => `${owner} ${row}`;

    const writeRows = atom(null, (_get, set, incoming: readonly TRow[]) => {
        for (let i = 0; i < incoming.length; i++) {
            const row = incoming[i];
            set(rowFamily(row.id), { ...row });
        }
    });

    const removeRows = atom(null, (_get, set, ids: readonly string[]) => {
        for (let i = 0; i < ids.length; i++) set(rowFamily(ids[i]), undefined);
    });

    const writeOwnerRecords = atom(
        null,
        (_get, set, incoming: readonly TOwner[]) => {
            for (let i = 0; i < incoming.length; i++) {
                const owner = incoming[i];
                set(ownerFamily(owner.id), { id: owner.id, name: owner.name });
            }
        }
    );

    /** Untimed: the mint happens here so no timed step pays it. */
    const seedPairRecords = atom(null, (_get, set, given: TRelationConfig) => {
        for (let i = 0; i < given.ids.length; i++) {
            const owner = given.owners[i];
            const row = given.ids[i];
            const pairAtom = pairFamily(pairKey(owner, row));
            set(pairAtom, { owner, row, mark: given.seeds[i] });
            rowPairAtoms.push(pairAtom);
        }
    });

    const namesAtom = atom(get => {
        const text: string[] = [];
        for (let i = 0; i < rowOwnerAtoms.length; i++) {
            const owner = get(rowOwnerAtoms[i]);
            text.push(owner === undefined ? '' : owner.name);
        }
        return text;
    });
    const marksAtom = atom(get => {
        const text: string[] = [];
        for (let i = 0; i < rowPairAtoms.length; i++) {
            const pair = get(rowPairAtoms[i]);
            text.push(pair === undefined ? '' : pair.mark);
        }
        return text;
    });

    const renderNames = (): void => {
        deliverRelation(consumers.a, config, store.get(namesAtom));
    };
    const renderMarks = (): void => {
        deliverRelation(consumers.b, config, store.get(marksAtom));
    };

    const patch = (id: string, change: Partial<TRow>): void => {
        const rowAtom = rowFamily(id);
        const row = access.get(rowAtom);
        if (row !== undefined) access.set(rowAtom, { ...row, ...change });
    };

    return {
        write: incoming => {
            access.set(writeRows, incoming);
        },
        remove: ids => {
            access.set(removeRows, ids);
        },
        patchLabel: (id, label) => patch(id, { label }),
        patchNote: (id, note) => patch(id, { note }),
        setGroup: (id, group) => patch(id, { group }),
        setRank: (id, rank) => patch(id, { rank }),
        // No relation script pins: the targeted-delivery script is a two-view
        // script and is bound by `bind`.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        writeOwners: incoming => {
            access.set(writeOwnerRecords, incoming);
        },
        // THE ATOMS BOTH SCRIPTS WORK THROUGH, RESOLVED ONCE — the family lookup a
        // keyed write would open with, hoisted out of the clock along with the mint.
        // The rest: `jotai.md`.
        holdRelation: given => {
            config = given;
            for (let at = 0; at < given.touched.length; at++) {
                touchedAtoms.push(ownerFamily(given.touched[at]));
            }
            for (let i = 0; i < given.ids.length; i++) {
                rowOwnerAtoms.push(ownerFamily(given.owners[i]));
            }
            store.set(seedPairRecords, given);
            stop.push(store.sub(namesAtom, renderNames));
            stop.push(store.sub(marksAtom, renderMarks));
            renderNames();
            renderMarks();
        },
        // At a POSITION — no family lookup. It invalidates view A's derived atom
        // because that atom read this one, and it cannot reach view B, which reads no
        // owner.
        patchOwnerName: (at, name) => {
            const ownerAtom = touchedAtoms[at];
            const owner = access.get(ownerAtom);
            if (owner === undefined) return;
            access.set(ownerAtom, { id: owner.id, name });
        },
        // The address string is built fresh every call: caching eight of them would
        // make the row a measurement of an array read.
        writePair: (at, mark) => {
            const pairAtom = pairFamily(
                pairKey(config.owners[at], config.ids[at])
            );
            const pair = access.get(pairAtom);
            if (pair === undefined) return;
            access.set(pairAtom, { owner: pair.owner, row: pair.row, mark });
        },
        frame,
        // A no-op: jotai flushes its listeners in the `finally` of the outermost
        // `store.set`, before the write returns.
        settle: () => undefined,
        readAll: () => {
            const held: TRow[] = [];
            for (const id of rowFamily.getParams()) {
                const row = store.get(rowFamily(id));
                if (row !== undefined) held.push(row);
            }
            return held;
        },
        deliverableRows: () => undefined,
        /** NOTHING TO READ: no window, no group, no sort, no group index. */
        groupOrder: () => undefined,
        readOwners: () => {
            const held: TOwner[] = [];
            for (const id of ownerFamily.getParams()) {
                const owner = store.get(ownerFamily(id));
                if (owner !== undefined) held.push(owner);
            }
            return held;
        },
        // THE ADDRESS IS READ OUT OF THE RECORD ITSELF: the family's keys are this
        // file's own composition, so answering from them would make the audit agree
        // with whatever the composition did. The rest: `jotai.md`.
        readPairs: () => {
            const held: TPairRow[] = [];
            for (const key of pairFamily.getParams()) {
                const pair = store.get(pairFamily(key));
                if (pair !== undefined) held.push(pair);
            }
            return held;
        },
        dispose: () => {
            for (let i = 0; i < stop.length; i++) stop[i]();
            stop.length = 0;
            touchedAtoms.length = 0;
            rowOwnerAtoms.length = 0;
            rowPairAtoms.length = 0;
        },
    };
};


/* ── one value, one subscriber, and a second value beside it ───────────── */

// `atom(initial)` is jotai's own scalar and `store.sub` its own subscriber, both out of
// `jotai/vanilla` — the entry point every other wiring in this file uses. The rest:
// `jotai.md`.
const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
    const store = createStore();
    const { access, frame } = framedStoreOf(store);
    const value = atom('');
    const bystander = atom('');
    const stop: (() => void)[] = [];
    let name = '';
    let bystanderName = '';
    let read = '';
    let readBystander = '';
    let woke = false;
    let wokeBystander = false;

    return {
        ...noRowStore('jotai'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            store.set(value, config.seeds[0]);
            store.set(bystander, config.seeds[1]);
            read = config.seeds[0];
            readBystander = config.seeds[1];
            stop.push(
                store.sub(value, () => {
                    read = store.get(value);
                    woke = true;
                })
            );
            stop.push(
                store.sub(bystander, () => {
                    readBystander = store.get(bystander);
                    wokeBystander = true;
                })
            );
            deliverSingle(consumers.a, name, read);
            deliverSingle(consumers.b, bystanderName, readBystander);
        },
        writeSingle: next => {
            access.set(value, next);
        },
        frame,
        readSingle: () => store.get(value),
        readBystander: () => store.get(bystander),
        // Every listener has already run: jotai flushes a vanilla store's subscribers
        // inside the write. What is left is the frame boundary.
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

export const jotaiAdapter: TAdapter = {
    name: 'jotai',
    version: '3.0.1',
    docs: 'https://jotai.org/docs/core/store',
    departure:
        'a removal rebuilds each touched group\'s ids atom once for the whole batch rather than per ' +
        'removed row; and the timed teardown unsubscribes the view atoms only, leaving the store and ' +
        'its atom families to the collector.',
    admission:
        'every row lives in its own jotai atom, one per key via `jotai-family`, read and written ' +
        'through the store — and each consumer is driven by `store.sub` on a derived view atom that ' +
        'reads per-column derived atoms (group, rank, label) and selects ids, flushed inside the ' +
        'write, its listener reading the selected rows back through `store.get`. The per-group ids atoms hold keys only, never a value, and the ' +
        'population audit enumerates the family\'s own `getParams` rather than any list this ' +
        'adapter keeps.',

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
    churn: churnShapes(consumers => bindChurnStore(consumers.a)),
};
