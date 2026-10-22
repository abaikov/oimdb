import {
    batch,
    beginBatch,
    computed,
    endBatch,
    observable,
    observe,
} from '@legendapp/state';
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

// Recipe: an `observable` object keyed by id — Legend-State's documented shape for "a
// collection of things" — plus one `observe` per view. The rest: `legend-state.md`.

// The row node, spelled out because Legend-State's recursive proxy type collapses on a
// `Record`: `keyof Record<string, TRow>` is `string`, so the mapped type degenerates
// into an index signature and TypeScript can no longer tell `state.get` from
// `state['get']` (a row whose id happens to be "get").
type TRowNode = {
    set(value: TRow): void;
    /** Removes the key from the parent object, not merely its value. */
    delete(): void;
    // A LEAF read is a leaf DEPENDENCY: an `observe` calling `label.get()` tracks that
    // node and no other, which is what puts this row in the column-granular band.
    label: { set(value: string): void; get(): string };
    note: { set(value: string): void; get(): string };
    // `setGroup` must read the PREVIOUS group as a PRIMITIVE. The rest:
    // `legend-state.md`.
    group: { set(value: string): void; get(): string | undefined; peek(): string | undefined };
    rank: { set(value: number): void; get(): number };
    // `get()` tracks the node and everything under it. The rest: `legend-state.md`.
    get(): TRow | undefined;
    peek(): TRow | undefined;
};

// batch: node_modules/@legendapp/state/index.js:591
const frame = (run: () => void): void => {
    batch(run);
};

// Tracks only the leaves a view filters, sorts and renders by, so a `note` write wakes no view.
const trackedRowOf = (node: TRowNode, group: string): TRow | undefined => {
    if (node.group.get() !== group) return undefined;
    node.rank.get();
    node.label.get();
    return node.peek();
};

type TGroupMembers = Readonly<Record<string, true>>;

/** Spelled out for the same reason `TRowNode` is. */
type TGroupNode = {
    get(): TGroupMembers | undefined;
    peek(): TGroupMembers | undefined;
};

type TGroupMemberNode = {
    set(value: true): void;
    delete(): void;
};

type TGroupIndex = {
    groupNodeFor(group: string): TGroupNode;
    groupMemberNodeFor(group: string, id: string): TGroupMemberNode;
    idsOf(group: string): readonly string[];
};

const groupIndexOf = (byGroup: unknown): TGroupIndex => {
    const groups = byGroup as Record<string, TGroupNode>;
    const members = byGroup as Record<string, Record<string, TGroupMemberNode>>;
    return {
        groupNodeFor: group => groups[group],
        groupMemberNodeFor: (group, id) => members[group][id],
        idsOf: group => Object.keys(groups[group].peek() ?? {}),
    };
};

const bindViews = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    const state = observable<Record<string, TRow>>({});
    // group → { [id]: true }, mutated a key at a time. The rest: `legend-state.md`.
    const byGroup = observable<Record<string, Record<string, true>>>({});

    const nodeFor = (id: string): TRowNode =>
        (state as unknown as Record<string, TRowNode>)[id];

    const { groupNodeFor, groupMemberNodeFor, idsOf } = groupIndexOf(byGroup);

    const watch = (group: string, consumer: BenchConsumer): (() => void) => {
        // Nothing downstream keeps the array, so it is one buffer per view
        // rather than one per notification.
        const visible: TRow[] = [];
        return observe(() => {
            // TWO KINDS OF TRACKED READ, in this order. The group node first: the bucket
            // dependency, which wakes this view when a row joins or leaves. The rest:
            // `legend-state.md`.
            const members = groupNodeFor(group).get();
            const window = view.window;
            let held = 0;
            if (members !== undefined) {
                for (const id in members) {
                    const row = trackedRowOf(nodeFor(id), group);
                    if (row === undefined) continue;
                    if (held >= window) {
                        if (compareRows(row, visible[held - 1]) >= 0) continue;
                        let at = held - 1;
                        while (at > 0 && compareRows(visible[at - 1], row) > 0) {
                            visible[at] = visible[at - 1];
                            at--;
                        }
                        visible[at] = row;
                        continue;
                    }
                    let at = held++;
                    while (at > 0 && compareRows(visible[at - 1], row) > 0) {
                        visible[at] = visible[at - 1];
                        at--;
                    }
                    visible[at] = row;
                }
            }
            visible.length = held;
            deliver(consumer, visible, window);
        });
    };

    // ONE `observe` PER VIEW — two, or fifty — each tracking its own group's ids node
    // and row nodes, so the dependency sets are disjoint and Legend-State does the
    // routing. The rest: `legend-state.md`.
    const stop = bindings.map(bound => watch(bound.group, bound.consumer));

    // `pinned` holds NODES — Legend-State's own proxies onto the stored rows — so what
    // the pin hoists out of the clock is the proxy's key resolution and nothing else.
    const pinned: TRowNode[] = [];
    const cellStop: (() => void)[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };
    const labelText: string[] = [];
    const noteText: string[] = [];
    // The FIRST TWO consumers of this wiring — A and B under `bind`. The
    // targeted-delivery script is a two-view script and is never bound per group.
    const labelConsumer = bindings[0].consumer;
    const noteConsumer = bindings[1].consumer;

    return {
        // Hand each id a fresh object carrying the incoming values. The rest:
        // `legend-state.md`.
        write: rows => {
            beginBatch();
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const node = nodeFor(row.id);
                const previous = node.group.peek();
                node.set({ ...row });
                if (previous === row.group) continue;
                if (previous !== undefined) groupMemberNodeFor(previous, row.id).delete();
                groupMemberNodeFor(row.group, row.id).set(true);
            }
            endBatch();
        },
        // `delete()` removes the KEY, which is what the audit needs: it reads the
        // root's own key set, so a node left holding `undefined` would still be in
        // the population. The rest: `legend-state.md`.
        remove: ids => {
            beginBatch();
            for (let i = 0; i < ids.length; i++) {
                const node = nodeFor(ids[i]);
                const group = node.group.peek();
                if (group !== undefined) groupMemberNodeFor(group, ids[i]).delete();
                node.delete();
            }
            endBatch();
        },
        patchLabel: (id, label) => {
            nodeFor(id).label.set(label);
        },
        // Legend-State notifies per node and no view tracks a `note` leaf, so this
        // re-runs no view at all. The rest: `legend-state.md`.
        patchNote: (id, note) => {
            nodeFor(id).note.set(note);
        },
        // Three nodes, ONE batch. The rest: `legend-state.md`.
        setGroup: (id, group) => {
            beginBatch();
            const node = nodeFor(id);
            // The PREVIOUS group, as a PRIMITIVE and read FIRST — see `TRowNode`
            // for the failure the other spelling caused.
            const previous = node.group.peek();
            node.group.set(group);
            if (previous !== undefined && previous !== group) {
                groupMemberNodeFor(previous, id).delete();
                groupMemberNodeFor(group, id).set(true);
            }
            endBatch();
        },
        setRank: (id, rank) => {
            nodeFor(id).rank.set(rank);
        },
        // THE NODES, RESOLVED ONCE: the `state[id]` every point write opens with. The
        // rest: `legend-state.md`.
        pin: config => {
            for (const dispose of stop) dispose();
            stop.length = 0;
            cells = config;
            pinned.length = 0;
            for (let i = 0; i < config.ids.length; i++) {
                pinned.push(nodeFor(config.ids[i]));
            }
            labelText.length = pinned.length;
            noteText.length = pinned.length;
            cellStop.push(
                observe(() => {
                    for (let i = 0; i < pinned.length; i++) {
                        labelText[i] = pinned[i].label.get();
                    }
                    deliverCells(labelConsumer, cells, labelText);
                })
            );
            cellStop.push(
                observe(() => {
                    for (let i = 0; i < pinned.length; i++) {
                        noteText[i] = pinned[i].note.get();
                    }
                    deliverCells(noteConsumer, cells, noteText);
                })
            );
        },
        patchPinnedLabel: (at, label) => {
            pinned[at].label.set(label);
        },
        patchPinnedNote: (at, note) => {
            pinned[at].note.set(note);
        },
        frame,
        // Nothing to do. Outside a batch every `set` notifies before it returns,
        // and `write` closes its own batch.
        settle: () => undefined,
        // `peek()` is `get()`'s value without the subscription, which is what an audit
        // outside every `observe` wants. The rest: `legend-state.md`.
        readAll: () =>
            Object.values(
                (state as unknown as { peek(): Record<string, TRow> }).peek()
            ),
        deliverableRows: () => undefined,
        // The `byGroup` observable — the half of the store `readAll` cannot reach,
        // asked through the same two nodes a view reads, in the same order. The rest:
        // `legend-state.md`.
        groupOrder: group => {
            const ids = idsOf(group);
            const held: TRow[] = [];
            for (let i = 0; i < ids.length; i++) {
                const row = nodeFor(ids[i]).get();
                if (row !== undefined) held.push(row);
            }
            return orderedIdsOfRows(held);
        },
        dispose: () => {
            for (const dispose of stop) dispose();
            stop.length = 0;
            // A reaction left standing is the one thing the header warns about.
            for (const dispose of cellStop) dispose();
            cellStop.length = 0;
            pinned.length = 0;
        },
    };
};

// Every shape here ends in an `observe` because a `computed` sits idle until `.get()`.
// The rest: `legend-state.md`.
const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    const state = observable<Record<string, TRow>>({});
    const nodeFor = (id: string): TRowNode =>
        (state as unknown as Record<string, TRowNode>)[id];

    type TComputedNode = { get(): string };

    const churnNodes: TRowNode[] = [];
    /** What each subscriber last read. */
    const churnRead: (string | undefined)[] = [];
    const stop: ((() => void) | undefined)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    /** `read` is the tracked call that decides which nodes this reaction depends on. */
    const subscribe = (at: number, read: () => string): (() => void) => {
        let primed = false;
        return observe(() => {
            const text = read();
            churnRead[at] = text;
            if (!primed) {
                primed = true;
                return;
            }
            churnWoke++;
        });
    };

    const labelOfRow = (node: TRowNode): string => {
        const row = node.get();
        return row === undefined ? '' : row.label;
    };

    return {
        write: rows => {
            beginBatch();
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                // Copied, because `set` keeps the reference it is given.
                nodeFor(row.id).set({ ...row });
            }
            endBatch();
        },
        remove: ids => {
            beginBatch();
            for (let i = 0; i < ids.length; i++) nodeFor(ids[i]).delete();
            endBatch();
        },
        patchLabel: (id, label) => {
            nodeFor(id).label.set(label);
        },
        patchNote: (id, note) => {
            nodeFor(id).note.set(note);
        },
        setGroup: (id, group) => {
            nodeFor(id).group.set(group);
        },
        setRank: (id, rank) => {
            nodeFor(id).rank.set(rank);
        },
        // A churn binding derives no view and no churn script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        // Every reaction has already run: outside a batch a `set` notifies before it
        // returns. What is left is the frame boundary — one delivery if anything woke,
        // none if nothing did.
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
            Object.values(
                (state as unknown as { peek(): Record<string, TRow> }).peek()
            ),
        deliverableRows: () => undefined,
        /** NOTHING TO READ: no view is derived and there is no group index. */
        groupOrder: () => undefined,
        // THE NODES, RESOLVED ONCE — the `state[id]` every point write opens with,
        // hoisted out of the clock.
        holdChurnRows: (ids, ranks) => {
            churnId = ids[0];
            churnRank = ranks[0];
            for (let i = 0; i < ids.length; i++) {
                churnNodes.push(nodeFor(ids[i]));
                churnRead[i] = undefined;
            }
        },
        mountOnRows: (at, from, count) => {
            if (count === 1) {
                stop[at] = subscribe(at, () => labelOfRow(churnNodes[from]));
                return;
            }
            stop[at] = subscribe(at, () => {
                let text = '';
                for (let i = from + count - 1; i >= from; i--) {
                    text = labelOfRow(churnNodes[i]);
                }
                return text;
            });
        },
        mountOnColumn: at => {
            const node = churnNodes[0];
            stop[at] = subscribe(at, () => node.label.get());
        },
        mountOnChain: (at, from, count, depth) => {
            let below = computed(() => {
                let text = labelOfRow(churnNodes[from]);
                for (let i = from + 1; i < from + count; i++) {
                    text = `${text},${labelOfRow(churnNodes[i])}`;
                }
                return chainLevelOf(text, 1);
            }) as unknown as TComputedNode;
            for (let level = 2; level <= depth; level++) {
                const under = below;
                below = computed(() =>
                    chainLevelOf(under.get(), level)
                ) as unknown as TComputedNode;
            }
            const head = below;
            stop[at] = subscribe(at, () => head.get());
        },
        mountOnDiamond: (at, from) => {
            const root = churnNodes[from];
            const left = computed(() =>
                diamondLeftOf(labelOfRow(root))
            ) as unknown as TComputedNode;
            const right = computed(() =>
                diamondRightOf(labelOfRow(root))
            ) as unknown as TComputedNode;
            const join = computed(() =>
                diamondJoinOf(left.get(), right.get())
            ) as unknown as TComputedNode;
            stop[at] = subscribe(at, () => join.get());
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
            churnNodes.length = 0;
            churnRead.length = 0;
        },
    };
};

// WHY THE CURSOR IS AN OBSERVABLE NODE: a scroll has to reach the consumer through
// Legend-State's own notification pass, and a plain field would leave this adapter
// deciding when to render. The rest: `legend-state.md`.
const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const state = observable<Record<string, TRow>>({});
    const byGroup = observable<Record<string, Record<string, true>>>({});
    const cursor = observable<{ group: string; at: number }>({
        group: view.groupA,
        at: 0,
    }) as unknown as {
        group: { get(): string; set(value: string): void };
        at: { get(): number; set(value: number): void };
    };

    const nodeFor = (id: string): TRowNode =>
        (state as unknown as Record<string, TRowNode>)[id];
    const { groupNodeFor, groupMemberNodeFor, idsOf } = groupIndexOf(byGroup);

    /** One buffer per view and one for the pull: a render allocates nothing. */
    const paged: TRow[] = [];
    const onAxis: TRow[] = [];
    const found: TRow[] = [];

    // `watch`'s selection with `limit` allowed to exceed the window and a second
    // predicate, which reads the immutable id and so is tested before any tracking.
    const selectInto = (
        out: TRow[],
        group: string,
        limit: number,
        axis: boolean
    ): TRow[] => {
        const members = groupNodeFor(group).get();
        let held = 0;
        if (members !== undefined) {
            for (const id in members) {
                if (axis && !onSecondAxis(id)) continue;
                const row = trackedRowOf(nodeFor(id), group);
                if (row === undefined) continue;
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
        }
        out.length = held;
        return out;
    };

    const stop = [
        observe(() => {
            const at = cursor.at.get();
            const group = cursor.group.get();
            deliverPage(
                consumers.a,
                selectInto(paged, group, at + view.window, false),
                at,
                view.window
            );
        }),
        observe(() => {
            deliverPage(
                consumers.b,
                selectInto(onAxis, view.groupA, view.window, true),
                0,
                view.window
            );
        }),
    ];

    return {
        write: rows => {
            beginBatch();
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const node = nodeFor(row.id);
                const previous = node.group.peek();
                node.set({ ...row });
                if (previous === row.group) continue;
                if (previous !== undefined) groupMemberNodeFor(previous, row.id).delete();
                groupMemberNodeFor(row.group, row.id).set(true);
            }
            endBatch();
        },
        remove: ids => {
            beginBatch();
            for (let i = 0; i < ids.length; i++) {
                const node = nodeFor(ids[i]);
                const group = node.group.peek();
                if (group !== undefined) groupMemberNodeFor(group, ids[i]).delete();
                node.delete();
            }
            endBatch();
        },
        patchLabel: (id, label) => {
            nodeFor(id).label.set(label);
        },
        patchNote: (id, note) => {
            nodeFor(id).note.set(note);
        },
        setGroup: (id, group) => {
            beginBatch();
            const node = nodeFor(id);
            const previous = node.group.peek();
            node.group.set(group);
            if (previous !== undefined && previous !== group) {
                groupMemberNodeFor(previous, id).delete();
                groupMemberNodeFor(group, id).set(true);
            }
            endBatch();
        },
        setRank: (id, rank) => {
            nodeFor(id).rank.set(rank);
        },
        // No read script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        // ONE NODE RESOLUTION AND ONE `get()` PER KEY. Nothing is hoisted; Legend-State
        // only tracks under an active `observe` and this runs outside every one.
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const row = nodeFor(keys[from + i]).get();
                if (row !== undefined) found.push(row);
            }
            deliverPage(consumers.a, found, 0, count);
        },
        // No row is touched; view B has never read this node and is not re-run.
        scrollTo: to => {
            cursor.at.set(to);
        },
        switchGroup: group => {
            batch(() => {
                cursor.group.set(group);
                cursor.at.set(0);
            });
        },
        // A no-op: outside a batch a `set` notifies before it returns.
        settle: () => undefined,
        readAll: () =>
            Object.values(
                (state as unknown as { peek(): Record<string, TRow> }).peek()
            ),
        deliverableRows: () => undefined,
        groupOrder: group => {
            const ids = idsOf(group);
            const held: TRow[] = [];
            for (let i = 0; i < ids.length; i++) {
                const row = nodeFor(ids[i]).get();
                if (row !== undefined) held.push(row);
            }
            return orderedIdsOfRows(held);
        },
        dispose: () => {
            for (const release of stop) release();
            stop.length = 0;
            paged.length = 0;
            onAxis.length = 0;
            found.length = 0;
        },
    };
};

// THE OWNER NODE AND THE PAIR NODE, spelled out for `TRowNode`'s reason. The rest:
// `legend-state.md`.
type TOwnerNode = {
    set(value: TOwner): void;
    name: { set(value: string): void; get(): string };
};
type TPairNode = {
    set(value: TPairRow): void;
    mark: { set(value: string): void; get(): string };
};

// A second `observable` keyed by owner id, and a third keyed by a JOINED PAIR OF IDS
// for the records addressed by one identity of each. The rest: `legend-state.md`.
const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    const state = observable<Record<string, TRow>>({});
    const ownerState = observable<Record<string, TOwner>>({});
    /** Keyed by the COMPOSED address. */
    const pairState = observable<Record<string, TPairRow>>({});

    const nodeFor = (id: string): TRowNode =>
        (state as unknown as Record<string, TRowNode>)[id];
    const ownerNodeFor = (id: string): TOwnerNode =>
        (ownerState as unknown as Record<string, TOwnerNode>)[id];
    const pairNodeFor = (key: string): TPairNode =>
        (pairState as unknown as Record<string, TPairNode>)[key];

    let config: TRelationConfig = {
        ids: [],
        ranks: [],
        owners: [],
        touched: [],
        names: [],
        seeds: [],
    };
    /** The owners the join script writes, by POSITION in `config.touched`. */
    const touchedNodes: TOwnerNode[] = [];
    /** The owner node each rendered line's name comes from, in `ids` order. */
    const rowOwnerNodes: TOwnerNode[] = [];
    /** The pair node each rendered line's mark comes from, in `ids` order. */
    const rowPairNodes: TPairNode[] = [];
    const stop: (() => void)[] = [];
    const nameText: string[] = [];
    const markText: string[] = [];

    const pairKey = (owner: string, row: string): string => `${owner} ${row}`;

    return {
        write: rows => {
            beginBatch();
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                // Copied, because `set` keeps the reference it is given.
                nodeFor(row.id).set({ ...row });
            }
            endBatch();
        },
        remove: ids => {
            beginBatch();
            for (let i = 0; i < ids.length; i++) nodeFor(ids[i]).delete();
            endBatch();
        },
        patchLabel: (id, label) => {
            nodeFor(id).label.set(label);
        },
        patchNote: (id, note) => {
            nodeFor(id).note.set(note);
        },
        setGroup: (id, group) => {
            nodeFor(id).group.set(group);
        },
        setRank: (id, rank) => {
            nodeFor(id).rank.set(rank);
        },
        // No relation script pins: the targeted-delivery script is a two-view
        // script and is bound by `bind`.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        writeOwners: owners => {
            beginBatch();
            for (let i = 0; i < owners.length; i++) {
                const owner = owners[i];
                ownerNodeFor(owner.id).set({ id: owner.id, name: owner.name });
            }
            endBatch();
        },
        // THE NODES BOTH SCRIPTS WORK THROUGH, RESOLVED ONCE — the proxy descent a
        // keyed write opens with, hoisted out of the clock along with the mint. The
        // rest: `legend-state.md`.
        holdRelation: given => {
            config = given;
            nameText.length = given.ids.length;
            markText.length = given.ids.length;
            for (let at = 0; at < given.touched.length; at++) {
                touchedNodes.push(ownerNodeFor(given.touched[at]));
            }
            beginBatch();
            for (let i = 0; i < given.ids.length; i++) {
                const owner = given.owners[i];
                const row = given.ids[i];
                rowOwnerNodes.push(ownerNodeFor(owner));
                const node = pairNodeFor(pairKey(owner, row));
                node.set({ owner, row, mark: given.seeds[i] });
                rowPairNodes.push(node);
            }
            endBatch();
            stop.push(
                observe(() => {
                    for (let i = 0; i < rowOwnerNodes.length; i++) {
                        nameText[i] = rowOwnerNodes[i].name.get();
                    }
                    deliverRelation(consumers.a, config, nameText);
                })
            );
            stop.push(
                observe(() => {
                    for (let i = 0; i < rowPairNodes.length; i++) {
                        markText[i] = rowPairNodes[i].mark.get();
                    }
                    deliverRelation(consumers.b, config, markText);
                })
            );
        },
        // At a POSITION — no descent. It reaches view A because view A's reaction read
        // this leaf, and it cannot reach view B, which read no owner.
        patchOwnerName: (at, name) => {
            touchedNodes[at].name.set(name);
        },
        // The address string is built fresh every call: caching eight of them would
        // make the row a measurement of an array read.
        writePair: (at, mark) => {
            pairNodeFor(pairKey(config.owners[at], config.ids[at])).mark.set(
                mark
            );
        },
        // Nothing to do: outside a batch every `set` notifies before it returns.
        settle: () => undefined,
        readAll: () =>
            Object.values(
                (state as unknown as { peek(): Record<string, TRow> }).peek()
            ),
        deliverableRows: () => undefined,
        /** NOTHING TO READ: no window, no group, no sort, no group index. */
        groupOrder: () => undefined,
        /** The second observable's root, read with `peek()` — `readAll`'s move. */
        readOwners: () =>
            Object.values(
                (ownerState as unknown as { peek(): Record<string, TOwner> }).peek()
            ),
        // THE ADDRESS IS READ OUT OF THE RECORD ITSELF: the observable's keys are this
        // file's own composition, so answering from them would make the audit agree
        // with whatever the composition did.
        readPairs: () =>
            Object.values(
                (pairState as unknown as { peek(): Record<string, TPairRow> }).peek()
            ),
        dispose: () => {
            // A reaction left standing is the one thing the header warns about.
            for (const dispose of stop) dispose();
            stop.length = 0;
            touchedNodes.length = 0;
            rowOwnerNodes.length = 0;
            rowPairNodes.length = 0;
            nameText.length = 0;
            markText.length = 0;
        },
    };
};


/* ── one value, one subscriber, and a second value beside it ───────────── */

// `observable(initial)` over a primitive is Legend-State's own scalar and `observe` is
// the subscriber every other wiring in this file is driven by. The rest:
// `legend-state.md`.
const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
    const value = observable('');
    const bystander = observable('');
    const stop: (() => void)[] = [];
    let name = '';
    let bystanderName = '';
    let read = '';
    let readBystander = '';
    let woke = false;
    let wokeBystander = false;

    return {
        ...noRowStore('legend-state'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            value.set(config.seeds[0]);
            bystander.set(config.seeds[1]);
            let primed = false;
            stop.push(
                observe(() => {
                    read = value.get();
                    if (!primed) {
                        primed = true;
                        return;
                    }
                    woke = true;
                })
            );
            let primedBystander = false;
            stop.push(
                observe(() => {
                    readBystander = bystander.get();
                    if (!primedBystander) {
                        primedBystander = true;
                        return;
                    }
                    wokeBystander = true;
                })
            );
            woke = false;
            wokeBystander = false;
            deliverSingle(consumers.a, name, read);
            deliverSingle(consumers.b, bystanderName, readBystander);
        },
        writeSingle: next => {
            value.set(next);
        },
        readSingle: () => value.peek(),
        readBystander: () => bystander.peek(),
        frame,
        // Every reaction has already run: outside a batch a `set` notifies before it
        // returns. What is left is the frame boundary.
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

export const legendStateAdapter: TAdapter = {
    name: 'legend-state',
    version: '2.1.15',
    docs: 'https://legendapp.com/open-source/state/v2/usage/reactivity/',
    departure:
        'the timed teardown disposes the standing reactions only, leaving the observables the ' +
        'population lives in to the collector.',
    admission:
        'every column lives in a Legend-State `observable` keyed by id, written through the node and ' +
        'read back with `get()`/`peek()` — and each consumer is driven by `observe`, re-run from the ' +
        'library\'s own notification pass. The second observable this adapter keeps maps each group ' +
        'to an object keyed by member id (`byGroup[group][id].set(true)` / `.delete()`), never a value.',

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
    // the view list and by nothing else, so this row compares libraries.
    bindPerGroup: (consumers, view) => bindViews(consumers.views, view),
};
