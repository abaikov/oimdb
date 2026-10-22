import { atom, batch, computed, listenKeys, map } from 'nanostores';
import type { MapStore, ReadableAtom, WritableAtom } from 'nanostores';
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

const frame = (run: () => void): void => {
    batch(run);
};

type TGroupStore = MapStore<Record<string, TRow>>;

// Recipe: nanostores 1.5 — one `map` store per group holding that group's rows, one
// `computed` per view over its group's store, and `.subscribe` on each computed. The
// rest: `nanostores.md`.
const bindViews = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    const byGroup = new Map<string, TGroupStore>();
    // id → the group store its row is filed in: a TABLE OF HANDLES, never of values.
    const storeOf = new Map<string, TGroupStore>();

    const storeFor = (group: string): TGroupStore => {
        let store = byGroup.get(group);
        if (store === undefined) {
            store = map<Record<string, TRow>>({});
            byGroup.set(group, store);
        }
        return store;
    };

    const draftIn = (
        drafts: Map<TGroupStore, Record<string, TRow>>,
        store: TGroupStore
    ): Record<string, TRow> => {
        let draft = drafts.get(store);
        if (draft === undefined) {
            draft = { ...store.get() };
            drafts.set(store, draft);
        }
        return draft;
    };

    const publish = (drafts: Map<TGroupStore, Record<string, TRow>>): void => {
        for (const [store, draft] of drafts) store.set(draft);
    };

    const visibleOfGroup = (
        rows: Record<string, TRow>,
        group: string,
        window: number
    ): TRow[] => {
        const out: TRow[] = [];
        let held = 0;
        for (const id in rows) {
            const row = rows[id];
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

    // ONE COMPUTED PER VIEW — two, or fifty — each over ITS OWN GROUP'S STORE, which
    // exists from bind because the watched groups are known there. The rest:
    // `nanostores.md`.
    const windows = bindings.map(bound => {
        const rows = computed(storeFor(bound.group), held =>
            visibleOfGroup(held, bound.group, view.window)
        );
        return rows.subscribe(visible =>
            deliver(bound.consumer, visible, view.window)
        );
    });

    // THE CELL WIRING, empty until `pin`. The rest: `nanostores.md`.
    const pinnedIds: string[] = [];
    const pinnedStores: TGroupStore[] = [];
    const cellStop: (() => void)[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };
    // The FIRST TWO consumers of this wiring — A and B under `bind`. The
    // targeted-delivery script is a two-view script and is never bound per group.
    const labelConsumer = bindings[0].consumer;
    const noteConsumer = bindings[1].consumer;

    const patch = (id: string, change: Partial<TRow>): void => {
        const store = storeOf.get(id);
        if (store === undefined) return;
        const held: TRow | undefined = store.get()[id];
        if (held === undefined) return;
        store.setKey(id, { ...held, ...change });
    };

    const pinnedTextOf = (
        column: 'label' | 'note'
    ): ReadableAtom<string[]> => {
        const cellStores: ReadableAtom<string>[] = [];
        for (let i = 0; i < pinnedIds.length; i++) {
            const id = pinnedIds[i];
            cellStores.push(
                computed(pinnedStores[i], rows => {
                    const row: TRow | undefined = rows[id];
                    return row === undefined ? '' : row[column];
                })
            );
        }
        return computed(cellStores, (...text: string[]) => text);
    };

    return {
        // A `map` store's granularity is the whole record and its equality is `!==` on
        // it, so all it can tell is that it was handed a new value, and that is what
        // the row reports.
        write: incoming => {
            const drafts = new Map<TGroupStore, Record<string, TRow>>();
            for (let i = 0; i < incoming.length; i++) {
                const row = incoming[i];
                const left = storeOf.get(row.id);
                const joined = storeFor(row.group);
                if (left !== undefined && left !== joined) {
                    delete draftIn(drafts, left)[row.id];
                }
                // Copied, never stored by reference: the harness reuses the
                // arrays it hands out.
                draftIn(drafts, joined)[row.id] = { ...row };
                storeOf.set(row.id, joined);
            }
            // One notification per touched group store for the whole batch, not
            // once per key.
            publish(drafts);
        },
        remove: ids => {
            const drafts = new Map<TGroupStore, Record<string, TRow>>();
            for (let i = 0; i < ids.length; i++) {
                const store = storeOf.get(ids[i]);
                if (store === undefined) continue;
                storeOf.delete(ids[i]);
                delete draftIn(drafts, store)[ids[i]];
            }
            publish(drafts);
        },
        patchLabel: (id, label) => patch(id, { label }),
        patchNote: (id, note) => patch(id, { note }),
        // THE MOVE: out of one group's store and into the other's. The rest:
        // `nanostores.md`.
        setGroup: (id, group) => {
            const left = storeOf.get(id);
            if (left === undefined) return;
            const held: TRow | undefined = left.get()[id];
            if (held === undefined) return;
            const joined = storeFor(group);
            if (joined === left) {
                left.setKey(id, { ...held, group });
                return;
            }
            const remaining = { ...left.get() };
            delete remaining[id];
            left.set(remaining);
            storeOf.set(id, joined);
            joined.setKey(id, { ...held, group });
        },
        setRank: (id, rank) => patch(id, { rank }),
        readAll: () => {
            const out: TRow[] = [];
            for (const store of byGroup.values()) {
                const rows = store.get();
                for (const id in rows) out.push(rows[id]);
            }
            return out;
        },
        deliverableRows: () => undefined,
        groupOrder: group => {
            const store = byGroup.get(group);
            if (store === undefined) return [];
            return orderedIdsOfRows(Object.values(store.get()));
        },
        // A write still looks its key up through the id → store table, so
        // `patchPinnedLabel` costs what `patchLabel` costs. The rest: `nanostores.md`.
        pin: config => {
            for (const stop of windows) stop();
            windows.length = 0;
            cells = config;
            pinnedIds.length = 0;
            pinnedStores.length = 0;
            for (let i = 0; i < config.ids.length; i++) {
                const store = storeOf.get(config.ids[i]);
                if (store === undefined) continue;
                pinnedIds.push(config.ids[i]);
                pinnedStores.push(store);
            }
            cellStop.push(
                pinnedTextOf('label').subscribe(text =>
                    deliverCells(labelConsumer, cells, text)
                )
            );
            cellStop.push(
                pinnedTextOf('note').subscribe(text =>
                    deliverCells(noteConsumer, cells, text)
                )
            );
        },
        patchPinnedLabel: (at, label) => patch(pinnedIds[at], { label }),
        patchPinnedNote: (at, note) => patch(pinnedIds[at], { note }),
        frame,
        settle: () => undefined,
        // The computeds unmount a second later on nanostores' own
        // `STORE_UNMOUNT_DELAY` timer; unsubscribing is what stops them being
        // fed.
        dispose: () => {
            for (const stop of windows) stop();
            windows.length = 0;
            for (const stop of cellStop) stop();
            cellStop.length = 0;
            pinnedIds.length = 0;
            pinnedStores.length = 0;
            byGroup.clear();
            storeOf.clear();
        },
    };
};

// A STORE PER ROW here, where the window wiring is one store for the whole population.
// The rest: `nanostores.md`.
const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    /** id → that row's own store. The population, one store at a time. */
    // A TABLE OF HANDLES, never of values: admitted because A KEY LOOKUP IS NOT
    // STORAGE — each row's value lives in the nanostore addressed here, and every
    // read and write goes through it. `packages/bench/PARTICIPANTS.md`.
    const byId = new Map<string, MapStore<TRow>>();

    const churnStores: MapStore<TRow>[] = [];
    /** What each subscriber last read. */
    const churnRead: (string | undefined)[] = [];
    const stop: ((() => void) | undefined)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    const readerOf = (at: number): ((text: string) => void) => text => {
        churnWoke++;
        churnRead[at] = text;
    };

    return {
        write: incoming => {
            for (let i = 0; i < incoming.length; i++) {
                const row = incoming[i];
                const held = byId.get(row.id);
                if (held === undefined) byId.set(row.id, map<TRow>({ ...row }));
                else held.set({ ...row });
            }
        },
        remove: ids => {
            for (let i = 0; i < ids.length; i++) byId.delete(ids[i]);
        },
        // `setKey` is the per-column write, and it is what puts a key name in the
        // notification `listenKeys` filters on.
        patchLabel: (id, label) => byId.get(id)?.setKey('label', label),
        patchNote: (id, note) => byId.get(id)?.setKey('note', note),
        setGroup: (id, group) => byId.get(id)?.setKey('group', group),
        setRank: (id, rank) => byId.get(id)?.setKey('rank', rank),
        // A churn binding derives no view and no churn script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        // Every listener has already run: nanostores drains its notification
        // queue inline.
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
            for (const store of byId.values()) held.push(store.get());
            return held;
        },
        deliverableRows: () => undefined,
        /** NOTHING TO READ: no view is derived and there is no group index. */
        groupOrder: () => undefined,
        /** THE STORES, RESOLVED ONCE — the `byId.get` every point write opens with. */
        holdChurnRows: (ids, ranks) => {
            churnId = ids[0];
            churnRank = ranks[0];
            for (let i = 0; i < ids.length; i++) {
                const store = byId.get(ids[i]);
                if (store !== undefined) churnStores.push(store);
                churnRead[i] = undefined;
            }
        },
        mountOnRows: (at, from, count) => {
            const woke = readerOf(at);
            if (count === 1) {
                const source = churnStores[from];
                stop[at] = source.listen(row => woke(row.label));
                churnRead[at] = source.get().label;
                return;
            }
            const sources = churnStores.slice(from, from + count);
            const joined: ReadableAtom<string> = computed(sources, (...rows) => {
                let text = '';
                for (let i = rows.length - 1; i >= 0; i--) {
                    text = (rows[i] as TRow).label;
                }
                return text;
            });
            stop[at] = joined.listen(text => woke(text));
            churnRead[at] = joined.get();
        },
        mountOnColumn: at => {
            const woke = readerOf(at);
            const source = churnStores[0];
            stop[at] = listenKeys(source, ['label'], row => woke(row.label));
            churnRead[at] = source.get().label;
        },
        mountOnChain: (at, from, count, depth) => {
            const sources = churnStores.slice(from, from + count);
            let below: ReadableAtom<string> = computed(sources, (...rows) => {
                let text = (rows[0] as TRow).label;
                for (let i = 1; i < rows.length; i++) {
                    text = `${text},${(rows[i] as TRow).label}`;
                }
                return chainLevelOf(text, 1);
            });
            for (let level = 2; level <= depth; level++) {
                below = computed(below, text => chainLevelOf(text, level));
            }
            const woke = readerOf(at);
            stop[at] = below.listen(text => woke(text));
            churnRead[at] = below.get();
        },
        mountOnDiamond: (at, from) => {
            const root = churnStores[from];
            const left = computed(root, row => diamondLeftOf(row.label));
            const right = computed(root, row => diamondRightOf(row.label));
            const join = computed([left, right], diamondJoinOf);
            const woke = readerOf(at);
            stop[at] = join.listen(text => woke(text));
            churnRead[at] = join.get();
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
            churnStores.length = 0;
            churnRead.length = 0;
            byId.clear();
        },
    };
};

// WHY THE OFFSET IS AN ATOM: a scroll has to reach the consumer through the library's
// own notification, and a plain variable would leave this adapter deciding when to
// render. The rest: `nanostores.md`.
const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const $rows = map<Record<string, TRow>>({});
    const byGroup = new Map<string, Set<string>>();
    const $cursor = atom({ group: view.groupA, offset: 0 });
    /** Reused only by the pull; both views hand back fresh arrays. */
    const found: TRow[] = [];

    const bucketOf = (group: string): Set<string> => {
        let bucket = byGroup.get(group);
        if (bucket === undefined) {
            bucket = new Set<string>();
            byGroup.set(group, bucket);
        }
        return bucket;
    };

    const selectOf = (
        rows: Record<string, TRow>,
        ids: ReadonlySet<string>,
        group: string,
        limit: number,
        axis: boolean
    ): TRow[] => {
        const out: TRow[] = [];
        let held = 0;
        for (const id of ids) {
            const row: TRow | undefined = rows[id];
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

    /** The answer AND the offset it was derived at — the delivery needs both. */
    const $paged = computed([$rows, $cursor], (rows, cursor) => ({
        offset: cursor.offset,
        rows: selectOf(
            rows,
            bucketOf(cursor.group),
            cursor.group,
            cursor.offset + view.window,
            false
        ),
    }));
    const $onAxis = computed($rows, rows =>
        selectOf(rows, bucketOf(view.groupA), view.groupA, view.window, true)
    );

    const stop = [
        $paged.subscribe(held =>
            deliverPage(consumers.a, held.rows, held.offset, view.window)
        ),
        $onAxis.subscribe(rows =>
            deliverPage(consumers.b, rows, 0, view.window)
        ),
    ];

    return {
        write: incoming => {
            const current = $rows.get();
            const next: Record<string, TRow> = { ...current };
            for (let i = 0; i < incoming.length; i++) {
                const row = incoming[i];
                next[row.id] = { ...row };
                const stored: TRow | undefined = current[row.id];
                if (stored === undefined) {
                    bucketOf(row.group).add(row.id);
                } else if (stored.group !== row.group) {
                    bucketOf(stored.group).delete(row.id);
                    bucketOf(row.group).add(row.id);
                }
            }
            $rows.set(next);
        },
        remove: ids => {
            const current = $rows.get();
            let next: Record<string, TRow> | undefined;
            for (let i = 0; i < ids.length; i++) {
                const id = ids[i];
                const held: TRow | undefined = current[id];
                if (held === undefined) continue;
                if (next === undefined) next = { ...current };
                delete next[id];
                bucketOf(held.group).delete(id);
            }
            if (next !== undefined) $rows.set(next);
        },
        patchLabel: (id, label) => {
            const held: TRow | undefined = $rows.get()[id];
            if (held === undefined) return;
            $rows.setKey(id, { ...held, label });
        },
        patchNote: (id, note) => {
            const held: TRow | undefined = $rows.get()[id];
            if (held === undefined) return;
            $rows.setKey(id, { ...held, note });
        },
        setGroup: (id, group) => {
            const held: TRow | undefined = $rows.get()[id];
            if (held === undefined) return;
            if (held.group !== group) {
                bucketOf(held.group).delete(id);
                bucketOf(group).add(id);
            }
            $rows.setKey(id, { ...held, group });
        },
        setRank: (id, rank) => {
            const held: TRow | undefined = $rows.get()[id];
            if (held === undefined) return;
            $rows.setKey(id, { ...held, rank });
        },
        // No read script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        // ONE RECORD READ AND ONE KEY LOOKUP PER KEY, through the store's own `get()`.
        // Nothing is resolved in advance and nothing is remembered between pages.
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            const rows = $rows.get();
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const row: TRow | undefined = rows[keys[from + i]];
                if (row !== undefined) found.push(row);
            }
            deliverPage(consumers.a, found, 0, count);
        },
        // ONE ATOM WRITE. Nothing is re-ordered and no row is touched; view B does
        // not name this atom among its inputs and is not recomputed.
        scrollTo: to => {
            $cursor.set({ group: $cursor.get().group, offset: to });
        },
        switchGroup: group => {
            $cursor.set({ group, offset: 0 });
        },
        settle: () => undefined,
        readAll: () => Object.values($rows.get()),
        deliverableRows: () => undefined,
        groupOrder: group => {
            const ids = byGroup.get(group);
            if (ids === undefined) return [];
            const stored = $rows.get();
            const held: TRow[] = [];
            for (const id of ids) {
                const row: TRow | undefined = stored[id];
                if (row !== undefined) held.push(row);
            }
            return orderedIdsOfRows(held);
        },
        dispose: () => {
            for (const release of stop) release();
            stop.length = 0;
            found.length = 0;
            byGroup.clear();
        },
    };
};

// TWO ENTITY TYPES — a `map` store per owner, a `map` store per PAIR RECORD under a
// composed address, and one `computed` per view. The rest: `nanostores.md`.
const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    // id → store, for all three types: a table of HANDLES, not storage.
    const byId = new Map<string, MapStore<TRow>>();
    const ownerById = new Map<string, MapStore<TOwner>>();
    const pairByKey = new Map<string, MapStore<TPairRow>>();

    let config: TRelationConfig = {
        ids: [],
        ranks: [],
        owners: [],
        touched: [],
        names: [],
        seeds: [],
    };
    /** The owners the join script writes, by POSITION in `config.touched`. */
    const touchedStores: MapStore<TOwner>[] = [];
    /** Which of those stores each rendered line's name comes from. */
    const ownerAt: number[] = [];
    /** The pair stores, in `ids` order — view B's dependency list. */
    const pairStores: MapStore<TPairRow>[] = [];
    const stop: (() => void)[] = [];

    const pairKey = (owner: string, row: string): string => `${owner} ${row}`;

    return {
        write: incoming => {
            for (let i = 0; i < incoming.length; i++) {
                const row = incoming[i];
                const held = byId.get(row.id);
                if (held === undefined) byId.set(row.id, map<TRow>({ ...row }));
                else held.set({ ...row });
            }
        },
        remove: ids => {
            for (let i = 0; i < ids.length; i++) byId.delete(ids[i]);
        },
        patchLabel: (id, label) => byId.get(id)?.setKey('label', label),
        patchNote: (id, note) => byId.get(id)?.setKey('note', note),
        setGroup: (id, group) => byId.get(id)?.setKey('group', group),
        setRank: (id, rank) => byId.get(id)?.setKey('rank', rank),
        // No relation script pins: the targeted-delivery script is a two-view
        // script and is bound by `bind`.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        writeOwners: owners => {
            for (let i = 0; i < owners.length; i++) {
                const owner = owners[i];
                ownerById.set(
                    owner.id,
                    map<TOwner>({ id: owner.id, name: owner.name })
                );
            }
        },
        // THE STORES BOTH SCRIPTS WORK THROUGH, RESOLVED ONCE, and the pair records
        // created at their seeds — outside the clock, so every timed step is a
        // resolution and an update rather than a mint. The rest: `nanostores.md`.
        holdRelation: given => {
            config = given;
            for (let at = 0; at < given.touched.length; at++) {
                const held = ownerById.get(given.touched[at]);
                if (held !== undefined) touchedStores.push(held);
            }
            for (let i = 0; i < given.ids.length; i++) {
                const owner = given.owners[i];
                const row = given.ids[i];
                ownerAt.push(given.touched.indexOf(owner));
                const created = map<TPairRow>({
                    owner,
                    row,
                    mark: given.seeds[i],
                });
                pairByKey.set(pairKey(owner, row), created);
                pairStores.push(created);
            }
            const names: ReadableAtom<string[]> = computed(
                touchedStores,
                (...owners) => {
                    const text: string[] = [];
                    for (let i = 0; i < ownerAt.length; i++) {
                        text.push((owners[ownerAt[i]] as TOwner).name);
                    }
                    return text;
                }
            );
            const marks: ReadableAtom<string[]> = computed(
                pairStores,
                (...pairs) => {
                    const text: string[] = [];
                    for (let i = 0; i < pairs.length; i++) {
                        text.push((pairs[i] as TPairRow).mark);
                    }
                    return text;
                }
            );
            stop.push(
                names.subscribe(text => {
                    deliverRelation(consumers.a, config, text);
                })
            );
            stop.push(
                marks.subscribe(text => {
                    deliverRelation(consumers.b, config, text);
                })
            );
        },
        // ONE `setKey` ON ONE STORE, at a POSITION — no map read. It reaches view A
        // because that store is in view A's dependency list, and it cannot reach view
        // B, which names no owner store.
        patchOwnerName: (at, name) => {
            touchedStores[at].setKey('name', name);
        },
        // COMPOSE THE ADDRESS, FIND THE STORE, WRITE THE MARK. The string is built
        // fresh every call: caching eight of them would make the row a measurement of
        // an array read.
        writePair: (at, mark) => {
            pairByKey
                .get(pairKey(config.owners[at], config.ids[at]))
                ?.setKey('mark', mark);
        },
        settle: () => undefined,
        readAll: () => {
            const held: TRow[] = [];
            for (const store of byId.values()) held.push(store.get());
            return held;
        },
        deliverableRows: () => undefined,
        /** NOTHING TO READ: no window, no group, no sort, no group index. */
        groupOrder: () => undefined,
        readOwners: () => {
            const held: TOwner[] = [];
            for (const store of ownerById.values()) held.push(store.get());
            return held;
        },
        // EVERY PAIR RECORD, WITH THE ADDRESS READ OUT OF THE RECORD ITSELF: the map's
        // keys are this file's own composition, so answering from them would make the
        // audit agree with whatever the composition did.
        readPairs: () => {
            const held: TPairRow[] = [];
            for (const store of pairByKey.values()) held.push(store.get());
            return held;
        },
        dispose: () => {
            for (let i = 0; i < stop.length; i++) stop[i]();
            stop.length = 0;
            touchedStores.length = 0;
            ownerAt.length = 0;
            pairStores.length = 0;
            byId.clear();
            ownerById.clear();
            pairByKey.clear();
        },
    };
};

/* ── one value, one subscriber, and a second value beside it ───────────── */

// `atom` is nanostores' own scalar — the store its README opens with — and `listen` is
// its subscriber. The rest: `nanostores.md`.
const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
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
        ...noRowStore('nanostores'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            value.set(config.seeds[0]);
            bystander.set(config.seeds[1]);
            read = config.seeds[0];
            readBystander = config.seeds[1];
            stop.push(
                value.listen(next => {
                    read = next;
                    woke = true;
                })
            );
            stop.push(
                bystander.listen(next => {
                    readBystander = next;
                    wokeBystander = true;
                })
            );
            deliverSingle(consumers.a, name, read);
            deliverSingle(consumers.b, bystanderName, readBystander);
        },
        writeSingle: next => {
            value.set(next);
        },
        readSingle: () => value.get(),
        readBystander: () => bystander.get(),
        frame,
        // Every listener has already run: nanostores drains its notification
        // queue inline.
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

type TRowStore = MapStore<TRow>;

type TMemberGroup = {
    members: Map<string, TRowStore>;
    version: number;
    $version: WritableAtom<number>;
};

type TRowEntry = { store: TRowStore; group: TMemberGroup };

const windowOfMembers = (
    members: ReadonlyMap<string, TRowStore>,
    window: number
): TRow[] => {
    const out: TRow[] = [];
    let held = 0;
    for (const store of members.values()) {
        const row = store.get();
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
    return out;
};

const bindViewsPerRow = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    const groupByName = new Map<string, TMemberGroup>();
    const entryById = new Map<string, TRowEntry>();

    const groupFor = (name: string): TMemberGroup => {
        let group = groupByName.get(name);
        if (group === undefined) {
            group = { members: new Map(), version: 0, $version: atom(0) };
            groupByName.set(name, group);
        }
        return group;
    };

    const bump = (group: TMemberGroup): void => {
        group.$version.set(++group.version);
    };

    const admit = (row: TRow): void => {
        const group = groupFor(row.group);
        const entry = entryById.get(row.id);
        if (entry === undefined) {
            const created: TRowEntry = { store: map<TRow>({ ...row }), group };
            created.store.listen(() => bump(created.group));
            entryById.set(row.id, created);
            group.members.set(row.id, created.store);
            bump(group);
            return;
        }
        if (entry.group !== group) {
            const left = entry.group;
            left.members.delete(row.id);
            entry.group = group;
            group.members.set(row.id, entry.store);
            bump(left);
        }
        entry.store.set({ ...row });
    };

    const windows = bindings.map(bound => {
        const group = groupFor(bound.group);
        const rows = computed(group.$version, () =>
            windowOfMembers(group.members, view.window)
        );
        return rows.subscribe(visible =>
            deliver(bound.consumer, visible, view.window)
        );
    });

    const pinnedIds: string[] = [];
    const pinnedStores: TRowStore[] = [];
    const cellStop: (() => void)[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };
    const labelConsumer = bindings[0].consumer;
    const noteConsumer = bindings[1].consumer;

    const pinnedTextOf = (
        column: 'label' | 'note'
    ): ReadableAtom<string[]> => {
        const cellStores: ReadableAtom<string>[] = [];
        for (let i = 0; i < pinnedStores.length; i++) {
            cellStores.push(computed(pinnedStores[i], row => row[column]));
        }
        return computed(cellStores, (...text: string[]) => text);
    };

    return {
        write: incoming => {
            batch(() => {
                for (let i = 0; i < incoming.length; i++) admit(incoming[i]);
            });
        },
        remove: ids => {
            batch(() => {
                for (let i = 0; i < ids.length; i++) {
                    const entry = entryById.get(ids[i]);
                    if (entry === undefined) continue;
                    entryById.delete(ids[i]);
                    entry.group.members.delete(ids[i]);
                    bump(entry.group);
                }
            });
        },
        patchLabel: (id, label) => entryById.get(id)?.store.setKey('label', label),
        patchNote: (id, note) => entryById.get(id)?.store.setKey('note', note),
        setGroup: (id, group) => {
            const entry = entryById.get(id);
            if (entry === undefined) return;
            const joined = groupFor(group);
            if (entry.group !== joined) {
                const left = entry.group;
                left.members.delete(id);
                entry.group = joined;
                joined.members.set(id, entry.store);
                bump(left);
            }
            entry.store.setKey('group', group);
        },
        setRank: (id, rank) => entryById.get(id)?.store.setKey('rank', rank),
        readAll: () => {
            const out: TRow[] = [];
            for (const entry of entryById.values()) out.push(entry.store.get());
            return out;
        },
        deliverableRows: () => undefined,
        groupOrder: group => {
            const named = groupByName.get(group);
            if (named === undefined) return [];
            const held: TRow[] = [];
            for (const store of named.members.values()) held.push(store.get());
            return orderedIdsOfRows(held);
        },
        pin: config => {
            for (const stop of windows) stop();
            windows.length = 0;
            cells = config;
            pinnedIds.length = 0;
            pinnedStores.length = 0;
            for (let i = 0; i < config.ids.length; i++) {
                const entry = entryById.get(config.ids[i]);
                if (entry === undefined) continue;
                pinnedIds.push(config.ids[i]);
                pinnedStores.push(entry.store);
            }
            cellStop.push(
                pinnedTextOf('label').subscribe(text =>
                    deliverCells(labelConsumer, cells, text)
                )
            );
            cellStop.push(
                pinnedTextOf('note').subscribe(text =>
                    deliverCells(noteConsumer, cells, text)
                )
            );
        },
        patchPinnedLabel: (at, label) =>
            entryById.get(pinnedIds[at])?.store.setKey('label', label),
        patchPinnedNote: (at, note) =>
            entryById.get(pinnedIds[at])?.store.setKey('note', note),
        frame,
        settle: () => undefined,
        dispose: () => {
            for (const stop of windows) stop();
            windows.length = 0;
            for (const stop of cellStop) stop();
            cellStop.length = 0;
            pinnedIds.length = 0;
            pinnedStores.length = 0;
            groupByName.clear();
            entryById.clear();
        },
    };
};

const bindReadStorePerRow = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const storeById = new Map<string, TRowStore>();
    const byGroup = new Map<string, Set<string>>();
    const $population = atom(0);
    let populationVersion = 0;
    const $cursor = atom({ group: view.groupA, offset: 0 });
    const found: TRow[] = [];

    const bumpPopulation = (): void => {
        $population.set(++populationVersion);
    };

    const bucketOf = (group: string): Set<string> => {
        let bucket = byGroup.get(group);
        if (bucket === undefined) {
            bucket = new Set<string>();
            byGroup.set(group, bucket);
        }
        return bucket;
    };

    const selectOf = (
        ids: ReadonlySet<string>,
        group: string,
        limit: number,
        axis: boolean
    ): TRow[] => {
        const out: TRow[] = [];
        let held = 0;
        for (const id of ids) {
            const row: TRow | undefined = storeById.get(id)?.get();
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

    const $paged = computed([$population, $cursor], (_version, cursor) => ({
        offset: cursor.offset,
        rows: selectOf(
            bucketOf(cursor.group),
            cursor.group,
            cursor.offset + view.window,
            false
        ),
    }));
    const $onAxis = computed($population, () =>
        selectOf(bucketOf(view.groupA), view.groupA, view.window, true)
    );

    const stop = [
        $paged.subscribe(held =>
            deliverPage(consumers.a, held.rows, held.offset, view.window)
        ),
        $onAxis.subscribe(rows =>
            deliverPage(consumers.b, rows, 0, view.window)
        ),
    ];

    return {
        write: incoming => {
            batch(() => {
                for (let i = 0; i < incoming.length; i++) {
                    const row = incoming[i];
                    const held = storeById.get(row.id);
                    if (held === undefined) {
                        const created = map<TRow>({ ...row });
                        created.listen(bumpPopulation);
                        storeById.set(row.id, created);
                        bucketOf(row.group).add(row.id);
                        bumpPopulation();
                        continue;
                    }
                    const stored = held.get();
                    if (stored.group !== row.group) {
                        bucketOf(stored.group).delete(row.id);
                        bucketOf(row.group).add(row.id);
                    }
                    held.set({ ...row });
                }
            });
        },
        remove: ids => {
            batch(() => {
                let removed = false;
                for (let i = 0; i < ids.length; i++) {
                    const id = ids[i];
                    const store = storeById.get(id);
                    if (store === undefined) continue;
                    bucketOf(store.get().group).delete(id);
                    storeById.delete(id);
                    removed = true;
                }
                if (removed) bumpPopulation();
            });
        },
        patchLabel: (id, label) => storeById.get(id)?.setKey('label', label),
        patchNote: (id, note) => storeById.get(id)?.setKey('note', note),
        setGroup: (id, group) => {
            const store = storeById.get(id);
            if (store === undefined) return;
            const held = store.get();
            if (held.group !== group) {
                bucketOf(held.group).delete(id);
                bucketOf(group).add(id);
            }
            store.setKey('group', group);
        },
        setRank: (id, rank) => storeById.get(id)?.setKey('rank', rank),
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const row: TRow | undefined = storeById
                    .get(keys[from + i])
                    ?.get();
                if (row !== undefined) found.push(row);
            }
            deliverPage(consumers.a, found, 0, count);
        },
        scrollTo: to => {
            $cursor.set({ group: $cursor.get().group, offset: to });
        },
        switchGroup: group => {
            $cursor.set({ group, offset: 0 });
        },
        settle: () => undefined,
        readAll: () => {
            const out: TRow[] = [];
            for (const store of storeById.values()) out.push(store.get());
            return out;
        },
        deliverableRows: () => undefined,
        groupOrder: group => {
            const ids = byGroup.get(group);
            if (ids === undefined) return [];
            const held: TRow[] = [];
            for (const id of ids) {
                const row: TRow | undefined = storeById.get(id)?.get();
                if (row !== undefined) held.push(row);
            }
            return orderedIdsOfRows(held);
        },
        dispose: () => {
            for (const release of stop) release();
            stop.length = 0;
            found.length = 0;
            byGroup.clear();
            storeById.clear();
        },
    };
};

export const nanostoresAdapter: TAdapter = {
    name: 'nanostores',
    version: '1.5.5',
    docs: 'https://github.com/nanostores/nanostores#readme — map stores, computed, subscribe',
    departure:
        '`frame` is the library\'s own synchronous `batch(fn)` (atom/index.js:43-57), which queues ' +
        'every listener and drains once when the outermost batch returns, so a frame of writes ' +
        'notifies each listener once. The load and every batched write are published as ONE ' +
        'whole-record map.set per touched store rather than the documented per-key setKey: setKey ' +
        'copies the whole record on every call, so per-key writes would make one call to write ' +
        'into ten thousand record copies, batched or not. ' +
        'THE POINT WRITES PAY A RECORD COPY, and nothing in the library avoids it: setKey is ' +
        "`{ ...value, [key]: value }` (map/index.js) and deepMap's setPath copies the top level as " +
        'well (deep-map/path.js). The window and cell wirings hold one map store PER GROUP, created ' +
        'at bind for the watched groups because computed fixes its dependency list at construction, ' +
        'so a point write spreads its own group\'s record and a move writes two stores. Each pinned ' +
        'cell is a computed over its row\'s group store down to one column\'s string, and each ' +
        'column a computed over its cells, so the atom\'s own Object.is keeps a label write away from ' +
        'the note consumer. The read wiring, whose two views are both over one group, keeps the ' +
        'population in ONE store and a point write there spreads all of it; the only timed writes ' +
        'there are the two-axis script\'s four moves. The churn and relation wirings, which subscribe after ' +
        'their rows are resolved, hold one store per row and copy that row alone. And a computed that loses its ' +
        'last listener is NOT detached from its sources inside this process: nanostores runs that ' +
        'teardown out of setTimeout(STORE_UNMOUNT_DELAY = 1000) (lifecycle/index.js) and no worker ' +
        'here yields to the event loop, so wherever a computed is involved — the wide, chain and ' +
        'diamond churn shapes, and the two window computeds of the cell row — an unmount splices a listener ' +
        'out and leaves the dependency edges standing. WHICH WAY THAT MOVES THESE NUMBERS IS NOT ' +
        'MEASURED: the unmount does less work, and every later write in the same sample notifies a ' +
        'computed nobody reads. Nothing here has priced either half. And in the read wiring a ' +
        'removal leaves the group index through one Set delete per id, where other rows splice or ' +
        'rebuild the group\'s array.',
    admission:
        'the row columns live in the records of nanostores map stores — one per group in the window ' +
        'wiring, beside an id -> store table that holds handles only, and one for the population in ' +
        'the read wiring, beside a group index that holds ids alone and no value; the change signal ' +
        "is the store's own notify — inline outside a frame, drained once at the end of `batch` " +
        'inside one — reaching the consumer through the subscribed ' +
        'computed built over it.',

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

export const nanostoresPerRowAdapter: TAdapter = {
    ...nanostoresAdapter,
    name: 'nanostores-per-row',
    departure:
        'The window, cell and read wirings hold one map store PER ROW and write with ' +
        '`setKey(column, value)`, so a point write copies that row alone and not the group or ' +
        'the population. A per-group atom carries a version counter that each row store\'s ' +
        'listener bumps, and the view computed over it reads the group\'s row stores; the load, ' +
        `removal and move run inside \`batch\` so a call notifies each view once. ${nanostoresAdapter.departure}`,
    admission:
        'the row columns live in one nanostores map store per row, beside id -> store tables ' +
        'and group membership tables that hold handles and ids only; the change signal is the ' +
        "row store's own notify, reaching the subscribed computed through a per-group version atom.",
    reads: readShapes((consumers, view, plan) =>
        bindReadStorePerRow(consumers, view, plan)
    ),
    bind: (consumers, view) =>
        bindViewsPerRow(
            [
                { group: view.groupA, consumer: consumers.a },
                { group: view.groupB, consumer: consumers.b },
            ],
            view
        ),
    bindPerGroup: (consumers, view) =>
        bindViewsPerRow(consumers.views, view),
};
