import { batch, createAtom } from '@tanstack/store';
import type { Atom, ReadonlyAtom, Subscription } from '@tanstack/store';
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

// Recipe and every reason behind the shape: `tanstack-store.md`. batch: node_modules/@tanstack/store/src/atom.ts:70
const frame = (run: () => void): void => {
    batch(run);
};

type TRowStore = Atom<TRow>;
type TBucket = Atom<TRowStore[]>;
type TSource<T> = {
    get(): T;
    subscribe(next: (value: T) => void): Subscription;
};

const alwaysChanged = (): boolean => false;

const holdInPlace = <T>(value: T): Atom<T> =>
    createAtom<T>(value, { compare: alwaysChanged });

const selectOf = (
    rowStores: readonly TRowStore[],
    group: string,
    limit: number,
    axis: boolean
): TRow[] => {
    const out: TRow[] = [];
    let held = 0;
    for (let i = 0; i < rowStores.length; i++) {
        const row = rowStores[i].get();
        if (row.group !== group) continue;
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

const bucketIn = (
    byGroup: Map<string, TBucket>,
    group: string
): TBucket => {
    let bucket = byGroup.get(group);
    if (bucket === undefined) {
        bucket = holdInPlace<TRowStore[]>([]);
        byGroup.set(group, bucket);
    }
    return bucket;
};

const dropFrom = (
    rowStores: TRowStore[],
    leaving: ReadonlySet<TRowStore>
): void => {
    let kept = 0;
    for (let i = 0; i < rowStores.length; i++) {
        const rowStore = rowStores[i];
        if (!leaving.has(rowStore)) rowStores[kept++] = rowStore;
    }
    rowStores.length = kept;
};

const groupOrderIn = (
    byGroup: Map<string, TBucket>,
    group: string
): readonly string[] => {
    const bucket = byGroup.get(group);
    if (bucket === undefined) return [];
    const rowStores = bucket.get();
    const held: TRow[] = [];
    for (let i = 0; i < rowStores.length; i++) held.push(rowStores[i].get());
    return orderedIdsOfRows(held);
};

const writeRowsIn = (
    byId: Map<string, TRowStore>,
    byGroup: Map<string, TBucket>,
    incoming: readonly TRow[]
): void => {
    batch(() => {
        let touched: Set<TBucket> | undefined;
        const bucketOf = (group: string): TRowStore[] => {
            const bucket = bucketIn(byGroup, group);
            if (touched === undefined) touched = new Set();
            touched.add(bucket);
            return bucket.get();
        };
        for (let i = 0; i < incoming.length; i++) {
            const row = incoming[i];
            const held = byId.get(row.id);
            if (held === undefined) {
                const created = holdInPlace<TRow>({ ...row });
                byId.set(row.id, created);
                bucketOf(row.group).push(created);
            } else {
                const stored = held.get();
                const fromGroup = stored.group;
                Object.assign(stored, row);
                held.set(stored);
                if (fromGroup !== row.group) {
                    const leaving = bucketOf(fromGroup);
                    const at = leaving.indexOf(held);
                    if (at >= 0) leaving.splice(at, 1);
                    bucketOf(row.group).push(held);
                }
            }
        }
        if (touched !== undefined) {
            for (const bucket of touched) bucket.set(bucket.get());
        }
    });
};

const removeRowsIn = (
    byId: Map<string, TRowStore>,
    byGroup: Map<string, TBucket>,
    ids: readonly string[]
): void => {
    batch(() => {
        const leaving = new Set<TRowStore>();
        const touched = new Set<string>();
        for (let i = 0; i < ids.length; i++) {
            const held = byId.get(ids[i]);
            if (held === undefined) continue;
            byId.delete(ids[i]);
            leaving.add(held);
            touched.add(held.get().group);
        }
        if (leaving.size === 0) return;
        for (const group of touched) {
            const bucket = bucketIn(byGroup, group);
            dropFrom(bucket.get(), leaving);
            bucket.set(bucket.get());
        }
    });
};

const moveRowIn = (
    byId: Map<string, TRowStore>,
    byGroup: Map<string, TBucket>,
    id: string,
    group: string
): void => {
    const held = byId.get(id);
    if (held === undefined) return;
    const row = held.get();
    const leaving = bucketIn(byGroup, row.group);
    const arriving = bucketIn(byGroup, group);
    batch(() => {
        row.group = group;
        held.set(row);
        const leavingStores = leaving.get();
        const at = leavingStores.indexOf(held);
        if (at >= 0) leavingStores.splice(at, 1);
        leaving.set(leavingStores);
        const arrivingStores = arriving.get();
        arrivingStores.push(held);
        arriving.set(arrivingStores);
    });
};

const patchIn = (
    byId: Map<string, TRowStore>,
    id: string,
    change: Partial<TRow>
): void => {
    const held = byId.get(id);
    if (held === undefined) return;
    const row = held.get();
    Object.assign(row, change);
    held.set(row);
};

const bindViews = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    const byId = new Map<string, TRowStore>();
    const byGroup = new Map<string, TBucket>();

    const windows: Subscription[] = bindings.map(bound =>
        createAtom(() =>
            selectOf(
                bucketIn(byGroup, bound.group).get(),
                bound.group,
                view.window,
                false
            )
        ).subscribe(rows => deliver(bound.consumer, rows, view.window))
    );

    const pinned: TRowStore[] = [];
    const cellSubscriptions: Subscription[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };
    const labelConsumer = bindings[0].consumer;
    const noteConsumer = bindings[1].consumer;

    const columnOf = (
        column: 'label' | 'note'
    ): ReadonlyAtom<string[]> => {
        const cellStores: ReadonlyAtom<string>[] = [];
        for (let i = 0; i < pinned.length; i++) {
            const held = pinned[i];
            cellStores.push(createAtom(() => held.get()[column]));
        }
        return createAtom(() => {
            const text: string[] = new Array(cellStores.length);
            for (let i = 0; i < cellStores.length; i++) {
                text[i] = cellStores[i].get();
            }
            return text;
        });
    };

    return {
        write: incoming => writeRowsIn(byId, byGroup, incoming),
        remove: ids => removeRowsIn(byId, byGroup, ids),
        patchLabel: (id, label) => patchIn(byId, id, { label }),
        patchNote: (id, note) => patchIn(byId, id, { note }),
        setGroup: (id, group) => moveRowIn(byId, byGroup, id, group),
        setRank: (id, rank) => patchIn(byId, id, { rank }),
        pin: config => {
            for (const subscription of windows) subscription.unsubscribe();
            windows.length = 0;
            cells = config;
            pinned.length = 0;
            for (let i = 0; i < config.ids.length; i++) {
                const held = byId.get(config.ids[i]);
                if (held !== undefined) pinned.push(held);
            }
            const $labels = columnOf('label');
            const $notes = columnOf('note');
            cellSubscriptions.push(
                $labels.subscribe(text =>
                    deliverCells(labelConsumer, cells, text)
                ),
                $notes.subscribe(text =>
                    deliverCells(noteConsumer, cells, text)
                )
            );
            deliverCells(labelConsumer, cells, $labels.get());
            deliverCells(noteConsumer, cells, $notes.get());
        },
        patchPinnedLabel: (at, label) => {
            const row = pinned[at].get();
            row.label = label;
            pinned[at].set(row);
        },
        patchPinnedNote: (at, note) => {
            const row = pinned[at].get();
            row.note = note;
            pinned[at].set(row);
        },
        frame,
        settle: () => undefined,
        readAll: () => Array.from(byId.values(), rowStore => rowStore.get()),
        deliverableRows: () => undefined,
        groupOrder: group => groupOrderIn(byGroup, group),
        dispose: () => {
            for (const subscription of windows) subscription.unsubscribe();
            windows.length = 0;
            for (const subscription of cellSubscriptions) {
                subscription.unsubscribe();
            }
            cellSubscriptions.length = 0;
            pinned.length = 0;
            byId.clear();
            byGroup.clear();
        },
    };
};

const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    const byId = new Map<string, TRowStore>();

    const churnStores: TRowStore[] = [];
    const churnRead: (string | undefined)[] = [];
    const stop: (Subscription | undefined)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    const subscribe = <T>(
        at: number,
        source: TSource<T>,
        read: (value: T) => string
    ): Subscription => {
        const subscription = source.subscribe(value => {
            churnRead[at] = read(value);
            churnWoke++;
        });
        churnRead[at] = read(source.get());
        return subscription;
    };

    const headOfRows = (from: number, count: number): string => {
        let text = '';
        for (let i = from + count - 1; i >= from; i--) {
            text = churnStores[i].get().label;
        }
        return text;
    };

    const joinedHeadOfRows = (from: number, count: number): string => {
        let text = churnStores[from].get().label;
        for (let i = from + 1; i < from + count; i++) {
            text = `${text},${churnStores[i].get().label}`;
        }
        return text;
    };

    return {
        write: incoming => {
            batch(() => {
                for (let i = 0; i < incoming.length; i++) {
                    const row = incoming[i];
                    const held = byId.get(row.id);
                    if (held === undefined) {
                        byId.set(row.id, holdInPlace<TRow>({ ...row }));
                    } else {
                        const stored = held.get();
                        Object.assign(stored, row);
                        held.set(stored);
                    }
                }
            });
        },
        remove: ids => {
            for (let i = 0; i < ids.length; i++) byId.delete(ids[i]);
        },
        patchLabel: (id, label) => patchIn(byId, id, { label }),
        patchNote: (id, note) => patchIn(byId, id, { note }),
        setGroup: (id, group) => patchIn(byId, id, { group }),
        setRank: (id, rank) => patchIn(byId, id, { rank }),
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
        readAll: () => Array.from(byId.values(), rowStore => rowStore.get()),
        deliverableRows: () => undefined,
        groupOrder: () => undefined,
        holdChurnRows: (ids, ranks) => {
            churnId = ids[0];
            churnRank = ranks[0];
            for (let i = 0; i < ids.length; i++) {
                const held = byId.get(ids[i]);
                if (held !== undefined) churnStores.push(held);
                churnRead[i] = undefined;
            }
        },
        mountOnRows: (at, from, count) => {
            if (count === 1) {
                stop[at] = subscribe(at, churnStores[from], row => row.label);
                return;
            }
            const joined = createAtom(() => headOfRows(from, count));
            stop[at] = subscribe(at, joined, text => text);
        },
        mountOnColumn: at => {
            const source = churnStores[0];
            const column = createAtom(() => source.get().label);
            stop[at] = subscribe(at, column, text => text);
        },
        mountOnChain: (at, from, count, depth) => {
            let below: ReadonlyAtom<string> = createAtom(() =>
                chainLevelOf(joinedHeadOfRows(from, count), 1)
            );
            for (let level = 2; level <= depth; level++) {
                const under = below;
                below = createAtom(() => chainLevelOf(under.get(), level));
            }
            stop[at] = subscribe(at, below, text => text);
        },
        mountOnDiamond: (at, from) => {
            const root = churnStores[from];
            const left = createAtom(() => diamondLeftOf(root.get().label));
            const right = createAtom(() => diamondRightOf(root.get().label));
            const join = createAtom(() =>
                diamondJoinOf(left.get(), right.get())
            );
            stop[at] = subscribe(at, join, text => text);
        },
        unmount: at => {
            const subscription = stop[at];
            if (subscription === undefined) return;
            subscription.unsubscribe();
            stop[at] = undefined;
            churnRead[at] = undefined;
        },
        dispose: () => {
            for (let i = 0; i < stop.length; i++) stop[i]?.unsubscribe();
            stop.length = 0;
            churnStores.length = 0;
            churnRead.length = 0;
            byId.clear();
        },
    };
};

const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const byId = new Map<string, TRowStore>();
    const byGroup = new Map<string, TBucket>();
    const $offset = createAtom(0);
    const $group = createAtom(view.groupA);
    const found: TRow[] = [];

    const $paged = createAtom(() => {
        const offset = $offset.get();
        const group = $group.get();
        return {
            offset,
            rows: selectOf(
                bucketIn(byGroup, group).get(),
                group,
                offset + view.window,
                false
            ),
        };
    });
    const $onAxis = createAtom(() =>
        selectOf(
            bucketIn(byGroup, view.groupA).get(),
            view.groupA,
            view.window,
            true
        )
    );

    const stop: Subscription[] = [
        $paged.subscribe(held =>
            deliverPage(consumers.a, held.rows, held.offset, view.window)
        ),
        $onAxis.subscribe(rows => deliverPage(consumers.b, rows, 0, view.window)),
    ];

    return {
        write: incoming => writeRowsIn(byId, byGroup, incoming),
        remove: ids => removeRowsIn(byId, byGroup, ids),
        patchLabel: (id, label) => patchIn(byId, id, { label }),
        patchNote: (id, note) => patchIn(byId, id, { note }),
        setGroup: (id, group) => moveRowIn(byId, byGroup, id, group),
        setRank: (id, rank) => patchIn(byId, id, { rank }),
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const held = byId.get(keys[from + i]);
                if (held !== undefined) found.push(held.get());
            }
            deliverPage(consumers.a, found, 0, count);
        },
        scrollTo: to => {
            $offset.set(to);
        },
        switchGroup: group => {
            batch(() => {
                $group.set(group);
                $offset.set(0);
            });
        },
        settle: () => undefined,
        readAll: () => Array.from(byId.values(), rowStore => rowStore.get()),
        deliverableRows: () => undefined,
        groupOrder: group => groupOrderIn(byGroup, group),
        dispose: () => {
            for (const subscription of stop) subscription.unsubscribe();
            stop.length = 0;
            found.length = 0;
            byId.clear();
            byGroup.clear();
        },
    };
};

const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    const byId = new Map<string, TRowStore>();
    const $ownerPopulation = holdInPlace<Atom<TOwner>[]>([]);
    const ownerById = new Map<string, Atom<TOwner>>();
    const pairByKey = new Map<string, Atom<TPairRow>>();
    const $pairPopulation = holdInPlace<Atom<TPairRow>[]>([]);

    let config: TRelationConfig = {
        ids: [],
        ranks: [],
        owners: [],
        touched: [],
        names: [],
        seeds: [],
    };
    const touchedStores: Atom<TOwner>[] = [];
    const rowOwnerStores: Atom<TOwner>[] = [];
    const pairStores: Atom<TPairRow>[] = [];
    const relationSubscriptions: Subscription[] = [];

    const pairKey = (owner: string, row: string): string => `${owner} ${row}`;

    return {
        write: incoming => {
            batch(() => {
                for (let i = 0; i < incoming.length; i++) {
                    const row = incoming[i];
                    const held = byId.get(row.id);
                    if (held === undefined) {
                        byId.set(row.id, holdInPlace<TRow>({ ...row }));
                    } else {
                        const stored = held.get();
                        Object.assign(stored, row);
                        held.set(stored);
                    }
                }
            });
        },
        remove: ids => {
            for (let i = 0; i < ids.length; i++) byId.delete(ids[i]);
        },
        patchLabel: (id, label) => patchIn(byId, id, { label }),
        patchNote: (id, note) => patchIn(byId, id, { note }),
        setGroup: (id, group) => patchIn(byId, id, { group }),
        setRank: (id, rank) => patchIn(byId, id, { rank }),
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        writeOwners: incoming => {
            batch(() => {
                const grown = $ownerPopulation.get();
                for (let i = 0; i < incoming.length; i++) {
                    const owner = incoming[i];
                    const created = holdInPlace<TOwner>({
                        id: owner.id,
                        name: owner.name,
                    });
                    ownerById.set(owner.id, created);
                    grown.push(created);
                }
                $ownerPopulation.set(grown);
            });
        },
        holdRelation: given => {
            config = given;
            for (let at = 0; at < given.touched.length; at++) {
                const held = ownerById.get(given.touched[at]);
                if (held !== undefined) touchedStores.push(held);
            }
            batch(() => {
                const grown = $pairPopulation.get();
                for (let i = 0; i < given.ids.length; i++) {
                    const owner = given.owners[i];
                    const row = given.ids[i];
                    const ownerStore = ownerById.get(owner);
                    if (ownerStore !== undefined) rowOwnerStores.push(ownerStore);
                    const created = holdInPlace<TPairRow>({
                        owner,
                        row,
                        mark: given.seeds[i],
                    });
                    pairByKey.set(pairKey(owner, row), created);
                    pairStores.push(created);
                    grown.push(created);
                }
                $pairPopulation.set(grown);
            });
            const $names = createAtom(() => {
                const text: string[] = new Array(rowOwnerStores.length);
                for (let i = 0; i < rowOwnerStores.length; i++) {
                    text[i] = rowOwnerStores[i].get().name;
                }
                return text;
            });
            const $marks = createAtom(() => {
                const text: string[] = new Array(pairStores.length);
                for (let i = 0; i < pairStores.length; i++) {
                    text[i] = pairStores[i].get().mark;
                }
                return text;
            });
            relationSubscriptions.push(
                $names.subscribe(text => deliverRelation(consumers.a, config, text)),
                $marks.subscribe(text => deliverRelation(consumers.b, config, text))
            );
            deliverRelation(consumers.a, config, $names.get());
            deliverRelation(consumers.b, config, $marks.get());
        },
        patchOwnerName: (at, name) => {
            const owner = touchedStores[at].get();
            owner.name = name;
            touchedStores[at].set(owner);
        },
        writePair: (at, mark) => {
            const held = pairByKey.get(
                pairKey(config.owners[at], config.ids[at])
            );
            if (held === undefined) return;
            const pair = held.get();
            pair.mark = mark;
            held.set(pair);
        },
        settle: () => undefined,
        readAll: () => Array.from(byId.values(), rowStore => rowStore.get()),
        deliverableRows: () => undefined,
        groupOrder: () => undefined,
        readOwners: () =>
            Array.from($ownerPopulation.get(), ownerStore => ownerStore.get()),
        readPairs: () =>
            Array.from($pairPopulation.get(), pairStore => pairStore.get()),
        dispose: () => {
            for (const subscription of relationSubscriptions) {
                subscription.unsubscribe();
            }
            relationSubscriptions.length = 0;
            touchedStores.length = 0;
            rowOwnerStores.length = 0;
            pairStores.length = 0;
            byId.clear();
            ownerById.clear();
            pairByKey.clear();
        },
    };
};

const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
    const value = createAtom('');
    const bystander = createAtom('');
    const subscriptions: Subscription[] = [];
    let name = '';
    let bystanderName = '';
    let read = '';
    let readBystander = '';
    let woke = false;
    let wokeBystander = false;

    return {
        ...noRowStore('tanstack-store'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            value.set(config.seeds[0]);
            bystander.set(config.seeds[1]);
            subscriptions.push(
                value.subscribe(next => {
                    read = next;
                    woke = true;
                }),
                bystander.subscribe(next => {
                    readBystander = next;
                    wokeBystander = true;
                })
            );
            read = value.get();
            readBystander = bystander.get();
            woke = false;
            wokeBystander = false;
            deliverSingle(consumers.a, name, read);
            deliverSingle(consumers.b, bystanderName, readBystander);
        },
        writeSingle: next => {
            value.set(next);
        },
        readSingle: () => value.get(),
        readBystander: () => bystander.get(),
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
            for (const subscription of subscriptions) subscription.unsubscribe();
            subscriptions.length = 0;
        },
    };
};

export const tanstackStoreAdapter: TAdapter = {
    name: 'tanstack-store',
    version: '0.11.2',
    docs: 'https://tanstack.com/store',
    departure:
        'a removal compacts each touched bucket array once, in place, for the whole batch rather than ' +
        'per removed row, so a batch of removals out of one group is one pass over it and not one per id.',
    admission:
        "every row's columns live in a @tanstack/store `createAtom` holder whose compare always reports " +
        'a change, so a write mutates the held row in place and sets the same reference back; the id ' +
        'and group maps beside them hold handles to those atoms rather than any value; the change ' +
        "signal is the library's own `subscribe` on a derived atom, run when the outermost `batch` returns.",

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
