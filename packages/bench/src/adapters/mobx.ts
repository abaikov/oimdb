import {
    action,
    autorun,
    compareShallow,
    computed,
    makeObservable,
    observable,
    runInAction,
} from 'mobx';
import type { IComputedValue, IReactionDisposer, ObservableSet } from 'mobx';
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
    visibleOf,
    visibleOnAxisInto,
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

// action, mobx dist/mobx.cjs.development.js:1088 (executeAction): reactions wait for the outermost action.
const frame = action((run: () => void): void => {
    run();
});

class MobxRow implements TRow {
    readonly id: string;
    group: string;
    rank: number;
    label: string;
    note: string;

    constructor(row: TRow) {
        this.id = row.id;
        this.group = row.group;
        this.rank = row.rank;
        this.label = row.label;
        this.note = row.note;
        makeObservable(this, {
            group: observable,
            rank: observable,
            label: observable,
            note: observable,
        });
    }
}

class MobxOwner implements TOwner {
    readonly id: string;
    name: string;

    constructor(owner: TOwner) {
        this.id = owner.id;
        this.name = owner.name;
        makeObservable(this, { name: observable });
    }
}

class MobxPair implements TPairRow {
    readonly owner: string;
    readonly row: string;
    mark: string;

    constructor(owner: string, row: string, mark: string) {
        this.owner = owner;
        this.row = row;
        this.mark = mark;
        makeObservable(this, { mark: observable });
    }
}

// Recipe: MobX's own model, unchanged. The rest: `mobx.md`.
const bindViews = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    // The population, and the only place a row's values live. No view enumerates it,
    // which is what makes it an independent answer for the audit below.
    const rows = observable.map<string, TRow>();
    // group → an OBSERVABLE SET of the row observables in that group. The rest: `mobx.md`.
    const byGroup = observable.map<string, ObservableSet<TRow>>(undefined, {
        deep: false,
    });

    // The bucket for a group, created empty the first time a write names it. The rest:
    // `mobx.md`.
    const bucketOf = (group: string): ObservableSet<TRow> => {
        const held = byGroup.get(group);
        if (held !== undefined) return held;
        const created = observable.set<TRow>([], { deep: false });
        byGroup.set(group, created);
        return created;
    };

    // A bucket holds `MobxRow`s, so `visibleOf` reads every column but `id` through a MobX
    // accessor. The rest: `mobx.md`.
    const windowOf = (group: string): IComputedValue<TRow[]> =>
        computed(
            () => {
                const groupRows = byGroup.get(group);
                if (groupRows === undefined) return [];
                return visibleOf(groupRows, group, view.window);
            },
            { equals: compareShallow }
        );

    // ONE COMPUTED AND ONE AUTORUN PER VIEW — two, or fifty; nothing here counts them.
    // Each reads its OWN group's bucket, so the dependency sets are disjoint. The rest:
    // `mobx.md`.
    const windows = bindings.map(bound => ({
        consumer: bound.consumer,
        rows: windowOf(bound.group),
    }));
    const stop: IReactionDisposer[] = windows.map(state =>
        autorun(() => deliver(state.consumer, state.rows.get(), view.window))
    );

    // THE CELL WIRING, empty until `pin`. `pinned` holds the row OBSERVABLES — MobX's own
    // observables, not copies — so the pin removes the `ObservableMap` lookup and
    // nothing else.
    const pinned: TRow[] = [];
    const cellStop: IReactionDisposer[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };
    const labelText: string[] = [];
    const noteText: string[] = [];
    // The FIRST TWO consumers of this wiring — A and B under `bind`. The
    // targeted-delivery script is a two-view script and is never bound per group.
    const labelConsumer = bindings[0].consumer;
    const noteConsumer = bindings[1].consumer;

    return {
        // Upsert by key; for a key already held, assign every field unconditionally.
        // The value check is MobX's own (`prepareNewValue_`), so a re-send writes 4 × n
        // properties and notifies on none. The rest: `mobx.md`.
        write: action((incoming: readonly TRow[]): void => {
            for (let i = 0; i < incoming.length; i++) {
                const row = incoming[i];
                const held = rows.get(row.id);
                if (held === undefined) {
                    const created = new MobxRow(row);
                    rows.set(row.id, created);
                    bucketOf(row.group).add(created);
                    continue;
                }
                const from = held.group;
                held.group = row.group;
                held.rank = row.rank;
                held.label = row.label;
                held.note = row.note;
                if (from !== row.group) {
                    bucketOf(from).delete(held);
                    bucketOf(row.group).add(held);
                }
            }
        }),
        // `ObservableMap.delete` plus the row's departure from its bucket, in one
        // action. The rest: `mobx.md`.
        remove: action((ids: readonly string[]): void => {
            for (let i = 0; i < ids.length; i++) {
                const held = rows.get(ids[i]);
                if (held === undefined) continue;
                const from = held.group;
                rows.delete(ids[i]);
                bucketOf(from).delete(held);
            }
        }),
        patchLabel: action((id: string, label: string): void => {
            const row = rows.get(id);
            if (row !== undefined) row.label = label;
        }),
        // MobX tracks per PROPERTY and no computed filters, sorts or renders
        // `note`, so its atom has no observers and neither reaction runs — from
        // the same three lines as the label patch above.
        patchNote: action((id: string, note: string): void => {
            const row = rows.get(id);
            if (row !== undefined) row.note = note;
        }),
        // THE MOVE. The assignment carries the VALUE and is unconditional; the two set
        // operations carry THE CHANGE OF GROUP and are the reason the destination view
        // wakes at all (see the header). The rest: `mobx.md`.
        setGroup: action((id: string, group: string): void => {
            const row = rows.get(id);
            if (row === undefined) return;
            const from = row.group;
            row.group = group;
            if (from === group) return;
            bucketOf(from).delete(row);
            bucketOf(group).add(row);
        }),
        setRank: action((id: string, rank: number): void => {
            const row = rows.get(id);
            if (row !== undefined) row.rank = rank;
        }),
        // THE OBSERVABLES, RESOLVED ONCE: the `rows.get(id)` every point write opens with
        // is all the pin takes out of the timed path. The window autoruns are replaced
        // by TWO CELL AUTORUNS, one per column. The rest: `mobx.md`.
        pin: config => {
            for (let i = 0; i < stop.length; i++) stop[i]();
            stop.length = 0;
            cells = config;
            pinned.length = 0;
            for (let i = 0; i < config.ids.length; i++) {
                const row = rows.get(config.ids[i]);
                if (row !== undefined) pinned.push(row);
            }
            labelText.length = pinned.length;
            noteText.length = pinned.length;
            cellStop.push(
                autorun(() => {
                    for (let i = 0; i < pinned.length; i++) {
                        labelText[i] = pinned[i].label;
                    }
                    deliverCells(labelConsumer, cells, labelText);
                })
            );
            cellStop.push(
                autorun(() => {
                    for (let i = 0; i < pinned.length; i++) {
                        noteText[i] = pinned[i].note;
                    }
                    deliverCells(noteConsumer, cells, noteText);
                })
            );
        },
        // The position is the address — no `rows.get`. Otherwise exactly what
        // `patchLabel` does.
        patchPinnedLabel: action((at: number, label: string): void => {
            pinned[at].label = label;
        }),
        patchPinnedNote: action((at: number, note: string): void => {
            pinned[at].note = note;
        }),
        frame,
        settle: () => undefined,
        // The population map — DELIBERATELY THE ONE STRUCTURE THE VIEWS DO NOT
        // ENUMERATE, since they derive from buckets. The rest: `mobx.md`.
        readAll: () => {
            const held: TRow[] = [];
            for (const row of rows.values()) {
                held.push({
                    id: row.id,
                    group: row.group,
                    rank: row.rank,
                    label: row.label,
                    note: row.note,
                });
            }
            return held;
        },
        // The bucket itself — what every view derives from, so this is a genuine second
        // witness. `byGroup.get` and NOT `bucketOf`: an audit may not mint a bucket for
        // a group the store never saw. The rest: `mobx.md`.
        groupOrder: group => {
            const groupRows = byGroup.get(group);
            if (groupRows === undefined) return [];
            const held: TRow[] = [];
            for (const row of groupRows) {
                held.push({
                    id: row.id,
                    group: row.group,
                    rank: row.rank,
                    label: row.label,
                    note: row.note,
                });
            }
            return orderedIdsOfRows(held);
        },
        // THE COMPUTED THE AUTORUN DELIVERS, minus the `deliver` around it. The rest:
        // `mobx.md`.
        deliverableRows: at =>
            at >= windows.length ? undefined : windows[at].rows.get(),
        // The reactions hold the graph up: drop them and the computeds unmount.
        // Both maps are created per bind, so nothing else needs tearing down.
        dispose: () => {
            for (let i = 0; i < stop.length; i++) stop[i]();
            for (let i = 0; i < cellStop.length; i++) cellStop[i]();
            cellStop.length = 0;
            pinned.length = 0;
        },
    };
};

// The four ways a MobX consumer mounts a subscriber. The rest: `mobx.md`.
const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    const rows = observable.map<string, TRow>();

    const churnRows: TRow[] = [];
    /** What each subscriber last read. */
    const churnRead: (string | undefined)[] = [];
    const stop: (IReactionDisposer | undefined)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    // Mount subscriber `at`, whose body performs `read` — the tracked read that decides
    // which atoms it depends on — and returns what it read.
    const subscribe = (at: number, read: () => string): IReactionDisposer => {
        let primed = false;
        return autorun(() => {
            const text = read();
            churnRead[at] = text;
            if (!primed) {
                primed = true;
                return;
            }
            churnWoke++;
        });
    };

    // A WHOLE ROW, AS MOBX EXPRESSES IT — all four value atoms, because MobX tracks per
    // PROPERTY. The rest: `mobx.md`.
    const wholeRow = (row: TRow): string => {
        const touched = row.group.length + row.rank + row.note.length;
        return touched < 0 ? '' : row.label;
    };

    return {
        write: action((incoming: readonly TRow[]): void => {
            for (let i = 0; i < incoming.length; i++) {
                const row = incoming[i];
                const held = rows.get(row.id);
                if (held === undefined) {
                    rows.set(row.id, new MobxRow(row));
                    continue;
                }
                held.group = row.group;
                held.rank = row.rank;
                held.label = row.label;
                held.note = row.note;
            }
        }),
        remove: action((ids: readonly string[]): void => {
            for (let i = 0; i < ids.length; i++) rows.delete(ids[i]);
        }),
        patchLabel: action((id: string, label: string): void => {
            const row = rows.get(id);
            if (row !== undefined) row.label = label;
        }),
        patchNote: action((id: string, note: string): void => {
            const row = rows.get(id);
            if (row !== undefined) row.note = note;
        }),
        setGroup: action((id: string, group: string): void => {
            const row = rows.get(id);
            if (row !== undefined) row.group = group;
        }),
        setRank: action((id: string, rank: number): void => {
            const row = rows.get(id);
            if (row !== undefined) row.rank = rank;
        }),
        // A churn binding derives no view and no churn script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        // Every reaction has already run: MobX runs them at the end of the
        // outermost action.
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
            for (const row of rows.values()) {
                held.push({
                    id: row.id,
                    group: row.group,
                    rank: row.rank,
                    label: row.label,
                    note: row.note,
                });
            }
            return held;
        },
        deliverableRows: () => undefined,
        /** NOTHING TO READ: no view is derived and there is no group index. */
        groupOrder: () => undefined,
        /** THE OBSERVABLES, RESOLVED ONCE — the `rows.get` every point write opens with. */
        holdChurnRows: (ids, ranks) => {
            churnId = ids[0];
            churnRank = ranks[0];
            for (let i = 0; i < ids.length; i++) {
                const row = rows.get(ids[i]);
                if (row !== undefined) churnRows.push(row);
                churnRead[i] = undefined;
            }
        },
        mountOnRows: (at, from, count) => {
            if (count === 1) {
                stop[at] = subscribe(at, () => wholeRow(churnRows[from]));
                return;
            }
            stop[at] = subscribe(at, () => {
                let text = '';
                for (let i = from + count - 1; i >= from; i--) {
                    text = wholeRow(churnRows[i]);
                }
                return text;
            });
        },
        // ONE ATOM, and no derived value in front of it: an observable field is
        // its own atom, so this is the column and nothing stands for it.
        mountOnColumn: at => {
            const row = churnRows[0];
            stop[at] = subscribe(at, () => row.label);
        },
        mountOnChain: (at, from, count, depth) => {
            let below: IComputedValue<string> = computed(() => {
                let text = churnRows[from].label;
                for (let i = from + 1; i < from + count; i++) {
                    text = `${text},${churnRows[i].label}`;
                }
                return chainLevelOf(text, 1);
            });
            for (let level = 2; level <= depth; level++) {
                const under = below;
                below = computed(() => chainLevelOf(under.get(), level));
            }
            const head = below;
            stop[at] = subscribe(at, () => head.get());
        },
        mountOnDiamond: (at, from) => {
            const root = churnRows[from];
            const left = computed(() => diamondLeftOf(root.label));
            const right = computed(() => diamondRightOf(root.label));
            const join = computed(() => diamondJoinOf(left.get(), right.get()));
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
            churnRows.length = 0;
            churnRead.length = 0;
        },
    };
};

// WHY THE OFFSET IS AN OBSERVABLE: a scroll has to reach the consumer through MobX's
// own reaction, and a plain field would leave this adapter deciding when to render. The
// rest: `mobx.md`.
const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const rows = observable.map<string, TRow>();
    const byGroup = observable.map<string, ObservableSet<TRow>>(undefined, {
        deep: false,
    });
    const offset = observable.box(0);
    const pagedGroup = observable.box(view.groupA);
    /** Reused only by the pull; both views hand back fresh arrays. */
    const found: TRow[] = [];

    const bucketOf = (group: string): ObservableSet<TRow> => {
        const held = byGroup.get(group);
        if (held !== undefined) return held;
        const created = observable.set<TRow>([], { deep: false });
        byGroup.set(group, created);
        return created;
    };

    const paged = computed(
        () => {
            const at = offset.get();
            const group = pagedGroup.get();
            const groupRows = byGroup.get(group);
            return groupRows === undefined
                ? []
                : visibleOf(groupRows, group, at + view.window);
        },
        { equals: compareShallow }
    );
    const onAxis = computed(
        () => {
            const groupRows = byGroup.get(view.groupA);
            if (groupRows === undefined) return [];
            return visibleOnAxisInto([], groupRows, view.groupA, view.window);
        },
        { equals: compareShallow }
    );

    const stop: IReactionDisposer[] = [
        autorun(() => {
            const at = offset.get();
            deliverPage(consumers.a, paged.get(), at, view.window);
        }),
        autorun(() => {
            deliverPage(consumers.b, onAxis.get(), 0, view.window);
        }),
    ];

    return {
        write: action((incoming: readonly TRow[]): void => {
            for (let i = 0; i < incoming.length; i++) {
                const row = incoming[i];
                const held = rows.get(row.id);
                if (held === undefined) {
                    const created = new MobxRow(row);
                    rows.set(row.id, created);
                    bucketOf(row.group).add(created);
                    continue;
                }
                const from = held.group;
                held.group = row.group;
                held.rank = row.rank;
                held.label = row.label;
                held.note = row.note;
                if (from !== row.group) {
                    bucketOf(from).delete(held);
                    bucketOf(row.group).add(held);
                }
            }
        }),
        remove: action((ids: readonly string[]): void => {
            for (let i = 0; i < ids.length; i++) {
                const held = rows.get(ids[i]);
                if (held === undefined) continue;
                const from = held.group;
                rows.delete(ids[i]);
                bucketOf(from).delete(held);
            }
        }),
        patchLabel: action((id: string, label: string): void => {
            const row = rows.get(id);
            if (row !== undefined) row.label = label;
        }),
        patchNote: action((id: string, note: string): void => {
            const row = rows.get(id);
            if (row !== undefined) row.note = note;
        }),
        setGroup: action((id: string, group: string): void => {
            const row = rows.get(id);
            if (row === undefined) return;
            const from = row.group;
            row.group = group;
            if (from === group) return;
            bucketOf(from).delete(row);
            bucketOf(group).add(row);
        }),
        setRank: action((id: string, rank: number): void => {
            const row = rows.get(id);
            if (row !== undefined) row.rank = rank;
        }),
        // No read script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        // ONE `ObservableMap.get` PER KEY, and the three columns read off the observable.
        // The rest: `mobx.md`.
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const row = rows.get(keys[from + i]);
                if (row !== undefined) found.push(row);
            }
            deliverPage(consumers.a, found, 0, count);
        },
        // ONE OBSERVABLE WRITE. Nothing is re-ordered and no row is touched.
        scrollTo: action((to: number): void => {
            offset.set(to);
        }),
        switchGroup: action((group: string): void => {
            pagedGroup.set(group);
            offset.set(0);
        }),
        frame,
        settle: () => undefined,
        readAll: () => {
            const held: TRow[] = [];
            for (const row of rows.values()) {
                held.push({
                    id: row.id,
                    group: row.group,
                    rank: row.rank,
                    label: row.label,
                    note: row.note,
                });
            }
            return held;
        },
        deliverableRows: () => undefined,
        groupOrder: group => {
            const groupRows = byGroup.get(group);
            if (groupRows === undefined) return [];
            const held: TRow[] = [];
            for (const row of groupRows) {
                held.push({
                    id: row.id,
                    group: row.group,
                    rank: row.rank,
                    label: row.label,
                    note: row.note,
                });
            }
            return orderedIdsOfRows(held);
        },
        dispose: () => {
            for (let i = 0; i < stop.length; i++) stop[i]();
            stop.length = 0;
            found.length = 0;
        },
    };
};

// TWO ENTITY TYPES — a second `observable.map` for the owners, and a third keyed by a
// JOINED PAIR OF IDS for the records addressed by one identity of each. The rest:
// `mobx.md`.
const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    const rows = observable.map<string, TRow>();
    const owners = observable.map<string, TOwner>();
    const pairs = observable.map<string, TPairRow>();

    let config: TRelationConfig = {
        ids: [],
        ranks: [],
        owners: [],
        touched: [],
        names: [],
        seeds: [],
    };
    /** The owners the join script writes, by POSITION in `config.touched`. */
    const touchedOwners: TOwner[] = [];
    /** The owner observable each rendered line's name comes from, in `ids` order. */
    const rowOwners: TOwner[] = [];
    /** The pair observable each rendered line's mark comes from, in `ids` order. */
    const rowPairs: TPairRow[] = [];
    const stop: IReactionDisposer[] = [];
    const nameText: string[] = [];
    const markText: string[] = [];

    const pairKey = (owner: string, row: string): string => `${owner} ${row}`;

    return {
        write: action((incoming: readonly TRow[]): void => {
            for (let i = 0; i < incoming.length; i++) {
                const row = incoming[i];
                const held = rows.get(row.id);
                if (held === undefined) {
                    rows.set(row.id, new MobxRow(row));
                    continue;
                }
                held.group = row.group;
                held.rank = row.rank;
                held.label = row.label;
                held.note = row.note;
            }
        }),
        remove: action((ids: readonly string[]): void => {
            for (let i = 0; i < ids.length; i++) rows.delete(ids[i]);
        }),
        patchLabel: action((id: string, label: string): void => {
            const row = rows.get(id);
            if (row !== undefined) row.label = label;
        }),
        patchNote: action((id: string, note: string): void => {
            const row = rows.get(id);
            if (row !== undefined) row.note = note;
        }),
        setGroup: action((id: string, group: string): void => {
            const row = rows.get(id);
            if (row !== undefined) row.group = group;
        }),
        setRank: action((id: string, rank: number): void => {
            const row = rows.get(id);
            if (row !== undefined) row.rank = rank;
        }),
        // No relation script pins: the targeted-delivery script is a two-view
        // script and is bound by `bind`.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        writeOwners: action((incoming: readonly TOwner[]): void => {
            for (let i = 0; i < incoming.length; i++) {
                const owner = incoming[i];
                owners.set(owner.id, new MobxOwner(owner));
            }
        }),
        // THE OBSERVABLES BOTH SCRIPTS WORK THROUGH, RESOLVED ONCE — the `owners.get` and
        // `pairs.get` a keyed write would open with — and the pair records created at
        // their seeds, outside the clock, so every timed step is a resolution and an
        // update rather than a mint. The rest: `mobx.md`.
        holdRelation: given => {
            config = given;
            nameText.length = given.ids.length;
            markText.length = given.ids.length;
            runInAction(() => {
                for (let at = 0; at < given.touched.length; at++) {
                    const held = owners.get(given.touched[at]);
                    if (held !== undefined) touchedOwners.push(held);
                }
                for (let i = 0; i < given.ids.length; i++) {
                    const owner = given.owners[i];
                    const row = given.ids[i];
                    const held = owners.get(owner);
                    if (held !== undefined) rowOwners.push(held);
                    const created = new MobxPair(owner, row, given.seeds[i]);
                    pairs.set(pairKey(owner, row), created);
                    rowPairs.push(created);
                }
            });
            stop.push(
                autorun(() => {
                    for (let i = 0; i < rowOwners.length; i++) {
                        nameText[i] = rowOwners[i].name;
                    }
                    deliverRelation(consumers.a, config, nameText);
                })
            );
            stop.push(
                autorun(() => {
                    for (let i = 0; i < rowPairs.length; i++) {
                        markText[i] = rowPairs[i].mark;
                    }
                    deliverRelation(consumers.b, config, markText);
                })
            );
        },
        // ONE ATOM WRITE, at a POSITION — no map read. It reaches view A because view
        // A's autorun read this observable's `name`, and it cannot reach view B, whose
        // autorun never read an owner.
        patchOwnerName: action((at: number, name: string): void => {
            touchedOwners[at].name = name;
        }),
        // COMPOSE THE ADDRESS, FIND THE RECORD, WRITE THE MARK. The string is built
        // fresh every call: caching eight of them would make the row a measurement of
        // an array read.
        writePair: action((at: number, mark: string): void => {
            const held = pairs.get(pairKey(config.owners[at], config.ids[at]));
            if (held !== undefined) held.mark = mark;
        }),
        frame,
        settle: () => undefined,
        readAll: () => {
            const held: TRow[] = [];
            for (const row of rows.values()) {
                held.push({
                    id: row.id,
                    group: row.group,
                    rank: row.rank,
                    label: row.label,
                    note: row.note,
                });
            }
            return held;
        },
        deliverableRows: () => undefined,
        /** NOTHING TO READ: no window, no group, no sort, no group index. */
        groupOrder: () => undefined,
        readOwners: () => {
            const held: TOwner[] = [];
            for (const owner of owners.values()) {
                held.push({ id: owner.id, name: owner.name });
            }
            return held;
        },
        // EVERY PAIR RECORD, WITH THE ADDRESS READ OUT OF THE RECORD ITSELF and not out
        // of the map's keys — those keys are this file's own composition, so answering
        // from them would make the audit agree with whatever the composition did.
        readPairs: () => {
            const held: TPairRow[] = [];
            for (const pair of pairs.values()) {
                held.push({ owner: pair.owner, row: pair.row, mark: pair.mark });
            }
            return held;
        },
        dispose: () => {
            for (let i = 0; i < stop.length; i++) stop[i]();
            stop.length = 0;
            touchedOwners.length = 0;
            rowOwners.length = 0;
            rowPairs.length = 0;
            nameText.length = 0;
            markText.length = 0;
        },
    };
};


/* ── one value, one subscriber, and a second value beside it ───────────── */

// `observable.box` is MobX's own scalar — its documented answer to "an observable that
// is not an object" — and `autorun` is the subscriber every other wiring in this file
// is driven by. The rest: `mobx.md`.
const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
    const value = observable.box('');
    const bystander = observable.box('');
    const stop: IReactionDisposer[] = [];
    let name = '';
    let bystanderName = '';
    let read = '';
    let readBystander = '';
    let woke = false;
    let wokeBystander = false;

    return {
        ...noRowStore('mobx'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            runInAction(() => {
                value.set(config.seeds[0]);
                bystander.set(config.seeds[1]);
            });
            let primed = false;
            stop.push(
                autorun(() => {
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
                autorun(() => {
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
        writeSingle: action((next: string): void => {
            value.set(next);
        }),
        frame,
        readSingle: () => value.get(),
        readBystander: () => bystander.get(),
        // Every reaction has already run: MobX runs them at the end of the
        // outermost action, which the write above opens and closes.
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

export const mobxAdapter: TAdapter = {
    name: 'mobx',
    version: '7.0.6',
    docs: 'https://mobx.js.org/reactions.html#autorun',
    departure:
        'its row-shaped churn subscriber reads all four of a row\'s atoms rather than the one column ' +
        'the churn line renders — MobX tracks per PROPERTY, so a subscriber that read one would be ' +
        'the column shape under another name, while the chain and diamond derive from the label ' +
        'alone as every adapter\'s do; a removal leaves the group index through one ' +
        'observable.set delete per id, where ' +
        'other rows splice or rebuild the group\'s array; and the timed teardown disposes the ' +
        'reactions only, leaving the observable map the population lives in to the collector.',
    admission:
        'every mutable column lives in its own MobX atom, on class instances annotated with ' +
        'makeObservable (MobX\'s documented store shape: accessors on the instance, no Proxy) held ' +
        'in an observable.map, and the group index is an observable.map of observable.sets of those ' +
        "same objects rather than of values; the change signal is MobX's own autorun over a " +
        'computed, run at the end of the outermost action, and the chain, the diamond and the view ' +
        'switch are computeds and observable.boxes MobX re-evaluates itself.',

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
