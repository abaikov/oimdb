import { batch, computed, effect, signal } from '@preact/signals-core';
import type { ReadonlySignal, Signal } from '@preact/signals-core';
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

/**
 * Recipe: @preact/signals-core 1.14 — a row is a signal per mutable field, one signal
 * per group holding that group's row records, a computed and an effect per view.
 * https://github.com/preactjs/signals/tree/main/packages/core#signalinitialvalue
 *
 * Why the two maps are admitted, how consumption is forced, what the views depend
 * on and the edge that moves a row in: `packages/bench/src/adapters/preact-signals.md`.
 */
type TRowSignal = {
    readonly id: string;
    readonly group: Signal<string>;
    readonly rank: Signal<number>;
    readonly label: Signal<string>;
    readonly note: Signal<string>;
};

const recordOf = (row: TRow): TRowSignal => ({
    id: row.id,
    group: signal(row.group),
    rank: signal(row.rank),
    label: signal(row.label),
    note: signal(row.note),
});

const assign = (record: TRowSignal, row: TRow): void => {
    record.group.value = row.group;
    record.rank.value = row.rank;
    record.label.value = row.label;
    record.note.value = row.note;
};

const rowOf = (record: TRowSignal): TRow => ({
    id: record.id,
    group: record.group.value,
    rank: record.rank.value,
    label: record.label.value,
    note: record.note.value,
});

const shownOf = (record: TRowSignal, rank: number): TRow => ({
    id: record.id,
    group: '',
    rank,
    label: record.label.value,
    note: '',
});

const shownRecords = (records: readonly TRowSignal[]): TRow[] => {
    const out: TRow[] = new Array(records.length);
    for (let i = 0; i < records.length; i++) {
        out[i] = shownOf(records[i], records[i].rank.value);
    }
    return out;
};

const positionOf = (
    rows: readonly TRowSignal[],
    rank: number,
    id: string
): number => {
    let low = 0;
    let high = rows.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        const other = rows[middle];
        const otherRank = other.rank.value;
        if (otherRank < rank || (otherRank === rank && other.id < id)) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    return low;
};

const spliceIn = (rows: TRowSignal[], held: TRowSignal, rank: number): void => {
    rows.splice(positionOf(rows, rank, held.id), 0, held);
};

// batch: node_modules/@preact/signals-core/src/index.ts:95
const frame = (run: () => void): void => {
    batch(run);
};

const SPLICE_REMOVAL_LIMIT = 8;

type TBucketSignal = Signal<readonly TRowSignal[]>;

type TBucketOf = (group: string) => TBucketSignal;

const without = (
    rows: readonly TRowSignal[],
    held: TRowSignal,
    rank: number
): readonly TRowSignal[] => {
    const at = positionOf(rows, rank, held.id);
    if (rows[at] !== held) return rows;
    const next = rows.slice();
    next.splice(at, 1);
    return next;
};

const including = (
    rows: readonly TRowSignal[],
    held: TRowSignal,
    rank: number
): readonly TRowSignal[] => {
    const next = rows.slice();
    spliceIn(next, held, rank);
    return next;
};

const spliceOut = (rows: TRowSignal[], held: TRowSignal, rank: number): void => {
    const at = positionOf(rows, rank, held.id);
    if (rows[at] === held) rows.splice(at, 1);
};

const reranked = (
    rows: readonly TRowSignal[],
    held: TRowSignal,
    from: number,
    rank: number
): readonly TRowSignal[] => {
    const next = rows.slice();
    spliceOut(next, held, from);
    spliceIn(next, held, rank);
    return next;
};

const rerankRow = (
    held: TRowSignal,
    bucketOf: TBucketOf,
    rank: number,
    axisBucketOf?: TBucketOf
): void => {
    const from = held.rank.value;
    if (from === rank) return;
    const group = held.group.value;
    batch(() => {
        const bucket = bucketOf(group);
        bucket.value = reranked(bucket.value, held, from, rank);
        if (axisBucketOf !== undefined && onSecondAxis(held.id)) {
            const axisBucket = axisBucketOf(group);
            axisBucket.value = reranked(axisBucket.value, held, from, rank);
        }
        held.rank.value = rank;
    });
};

const unfileRows = (
    byId: Map<string, TRowSignal>,
    bucketOf: TBucketOf,
    ids: readonly string[],
    axisBucketOf?: TBucketOf
): void => {
    batch(() => {
        if (ids.length <= SPLICE_REMOVAL_LIMIT) {
            for (let i = 0; i < ids.length; i++) {
                const held = byId.get(ids[i]);
                if (held === undefined) continue;
                byId.delete(ids[i]);
                const group = held.group.value;
                const rank = held.rank.value;
                const bucket = bucketOf(group);
                bucket.value = without(bucket.value, held, rank);
                if (axisBucketOf !== undefined && onSecondAxis(held.id)) {
                    const axisBucket = axisBucketOf(group);
                    axisBucket.value = without(axisBucket.value, held, rank);
                }
            }
            return;
        }
        const leaving = new Set<TRowSignal>();
        const touched = new Set<TBucketSignal>();
        for (let i = 0; i < ids.length; i++) {
            const held = byId.get(ids[i]);
            if (held === undefined) continue;
            byId.delete(ids[i]);
            leaving.add(held);
            const group = held.group.value;
            touched.add(bucketOf(group));
            if (axisBucketOf !== undefined && onSecondAxis(held.id)) {
                touched.add(axisBucketOf(group));
            }
        }
        for (const bucket of touched) {
            bucket.value = bucket.value.filter(rowSignal => !leaving.has(rowSignal));
        }
    });
};

const bindViews = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    // id → signal: a TABLE OF HANDLES, never of values. Admitted because a key
    // lookup is not storage — every value lives in a signal the library owns.
    const byId = new Map<string, TRowSignal>();
    // group → a SIGNAL of the row signals filed there. Reactive and copy-on-write:
    // a row moving in is no write to anything the destination view already reads,
    // and preact compares by `!==`. Kept for EVERY group, not the watched two.
    const byGroup = new Map<string, Signal<readonly TRowSignal[]>>();

    // Created empty on first ask: it is also called from inside the view effects,
    // and an effect that read nothing would have no dependency and never wake.
    const bucketOf = (group: string): Signal<readonly TRowSignal[]> => {
        let bucket = byGroup.get(group);
        if (bucket === undefined) {
            bucket = signal<readonly TRowSignal[]>([]);
            byGroup.set(group, bucket);
        }
        return bucket;
    };

    // Two views, or fifty — the dependency sets are disjoint and preact routes. The
    // computed reads its bucket only, which is kept in rank order, and returns a fresh
    // array, or preact's `!==` would tell the effect nothing changed; the effect reads
    // the rank and label of what was selected. Every effect runs once on the empty
    // store; that delivery the harness resets.
    const windows = bindings.map(bound => {
        const top = computed(() => bucketOf(bound.group).value.slice(0, view.window));
        return effect(() => {
            deliver(bound.consumer, shownRecords(top.value), view.window);
        });
    });

    const pinned: TRowSignal[] = [];
    const cellStop: (() => void)[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };
    const labelText: string[] = [];
    const noteText: string[] = [];
    const labelConsumer = bindings[0].consumer;
    const noteConsumer = bindings[1].consumer;

    return {
        // NO HAND-ROLLED VALUE DIFF — `TBinding.write`. The one comparison here
        // decides the BUCKET and the position in it, and is read before the row signals
        // are written.
        write: incoming => {
            batch(() => {
                // Each touched bucket drafted ONCE: copy-on-write per row would
                // make the load quadratic and split the delivery.
                let drafts: Map<string, TRowSignal[]> | undefined;
                const draftOf = (group: string): TRowSignal[] => {
                    if (drafts === undefined) drafts = new Map();
                    let draft = drafts.get(group);
                    if (draft === undefined) {
                        draft = bucketOf(group).value.slice();
                        drafts.set(group, draft);
                    }
                    return draft;
                };
                for (let i = 0; i < incoming.length; i++) {
                    const row = incoming[i];
                    const held = byId.get(row.id);
                    if (held === undefined) {
                        const created = recordOf(row);
                        byId.set(row.id, created);
                        spliceIn(draftOf(row.group), created, row.rank);
                    } else {
                        const storedGroup = held.group.value;
                        const storedRank = held.rank.value;
                        if (storedGroup !== row.group || storedRank !== row.rank) {
                            spliceOut(draftOf(storedGroup), held, storedRank);
                            spliceIn(draftOf(row.group), held, row.rank);
                        }
                        assign(held, row);
                    }
                }
                if (drafts !== undefined) {
                    for (const [group, draft] of drafts) {
                        bucketOf(group).value = draft;
                    }
                }
            });
        },
        // A bucket the removal did not touch is not written, so a view over another
        // group is not woken. The buckets are filtered by HANDLE IDENTITY.
        remove: ids => unfileRows(byId, bucketOf, ids),
        patchLabel: (id, label) => {
            const held = byId.get(id);
            if (held !== undefined) held.label.value = label;
        },
        patchNote: (id, note) => {
            const held = byId.get(id);
            if (held !== undefined) held.note.value = note;
        },
        // THE MOVE. Three signals, one batch: the row's group field, the bucket it
        // leaves, the bucket it joins. The bucket writes are what wake the destination
        // view, whose computed has never read this row's group signal before.
        setGroup: (id, group) => {
            const held = byId.get(id);
            if (held === undefined) return;
            const fromGroup = held.group.value;
            const rank = held.rank.value;
            batch(() => {
                held.group.value = group;
                const from = bucketOf(fromGroup);
                from.value = without(from.value, held, rank);
                const to = bucketOf(group);
                to.value = including(to.value, held, rank);
            });
        },
        setRank: (id, rank) => {
            const held = byId.get(id);
            if (held !== undefined) rerankRow(held, bucketOf, rank);
        },
        // THE RECORDS, RESOLVED ONCE. The window effects go down and TWO CELL EFFECTS
        // replace them, one per column, each reading that column's signal of every
        // pinned row, so a write to the other column never reaches it.
        pin: config => {
            for (const stop of windows) stop();
            windows.length = 0;
            cells = config;
            pinned.length = 0;
            for (let i = 0; i < config.ids.length; i++) {
                const held = byId.get(config.ids[i]);
                if (held === undefined) continue;
                pinned.push(held);
            }
            labelText.length = pinned.length;
            noteText.length = pinned.length;
            cellStop.push(
                effect(() => {
                    for (let i = 0; i < pinned.length; i++) {
                        labelText[i] = pinned[i].label.value;
                    }
                    deliverCells(labelConsumer, cells, labelText);
                })
            );
            cellStop.push(
                effect(() => {
                    for (let i = 0; i < pinned.length; i++) {
                        noteText[i] = pinned[i].note.value;
                    }
                    deliverCells(noteConsumer, cells, noteText);
                })
            );
        },
        patchPinnedLabel: (at, label) => {
            pinned[at].label.value = label;
        },
        patchPinnedNote: (at, note) => {
            pinned[at].note.value = note;
        },
        frame,
        // A no-op, and it has to be: preact flushes effects when the outermost
        // `batch` returns. Nothing here may render on the graph's behalf.
        settle: () => undefined,
        readAll: () => Array.from(byId.values(), rowOf),
        deliverableRows: () => undefined,
        // `byGroup.get` and NOT `bucketOf`, which CREATES: the audit must not mint
        // a bucket for a group the store never saw. The rows go into an array of
        // this method's own — sorting the signal's would repair the drift in place.
        groupOrder: group => {
            const bucket = byGroup.get(group);
            if (bucket === undefined) return [];
            const records = bucket.value;
            const held: TRow[] = [];
            for (let i = 0; i < records.length; i++) {
                held.push(rowOf(records[i]));
            }
            return orderedIdsOfRows(held);
        },
        dispose: () => {
            for (const stop of windows) stop();
            windows.length = 0;
            for (const stop of cellStop) stop();
            cellStop.length = 0;
            pinned.length = 0;
            byId.clear();
            byGroup.clear();
        },
    };
};

/**
 * THE SAME STORE WITH NOTHING SUBSCRIBED TO IT, and the four ways a preact
 * consumer mounts one.
 * https://github.com/preactjs/signals/tree/main/packages/core#effectfn
 *
 * What each shape is wired as, and why an effect's first run is a MOUNT and not a
 * wake-up: `packages/bench/src/adapters/preact-signals.md`.
 */
const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    // id → signal: a table of HANDLES. Admitted for `bindViews`' reason.
    const byId = new Map<string, TRowSignal>();

    const churnSignals: TRowSignal[] = [];
    const churnRead: (string | undefined)[] = [];
    const stop: ((() => void) | undefined)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    const subscribe = (at: number, read: () => string): (() => void) => {
        let primed = false;
        return effect(() => {
            const text = read();
            churnRead[at] = text;
            if (!primed) {
                primed = true;
                return;
            }
            churnWoke++;
        });
    };

    const labelOfWholeRow = (record: TRowSignal): string => {
        record.group.value;
        record.rank.value;
        record.note.value;
        return record.label.value;
    };

    return {
        write: incoming => {
            batch(() => {
                for (let i = 0; i < incoming.length; i++) {
                    const row = incoming[i];
                    const held = byId.get(row.id);
                    if (held === undefined) {
                        byId.set(row.id, recordOf(row));
                    } else {
                        assign(held, row);
                    }
                }
            });
        },
        remove: ids => {
            for (let i = 0; i < ids.length; i++) byId.delete(ids[i]);
        },
        patchLabel: (id, label) => {
            const held = byId.get(id);
            if (held !== undefined) held.label.value = label;
        },
        patchNote: (id, note) => {
            const held = byId.get(id);
            if (held !== undefined) held.note.value = note;
        },
        setGroup: (id, group) => {
            const held = byId.get(id);
            if (held !== undefined) held.group.value = group;
        },
        setRank: (id, rank) => {
            const held = byId.get(id);
            if (held !== undefined) held.rank.value = rank;
        },
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        // Every effect has already run; what is left is the frame boundary.
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
        readAll: () => Array.from(byId.values(), rowOf),
        deliverableRows: () => undefined,
        groupOrder: () => undefined,
        // Untimed, for the reason on `TChurnBinding`.
        holdChurnRows: (ids, ranks) => {
            churnId = ids[0];
            churnRank = ranks[0];
            for (let i = 0; i < ids.length; i++) {
                const held = byId.get(ids[i]);
                if (held !== undefined) churnSignals.push(held);
                churnRead[i] = undefined;
            }
        },
        mountOnRows: (at, from, count) => {
            if (count === 1) {
                stop[at] = subscribe(at, () => labelOfWholeRow(churnSignals[from]));
                return;
            }
            stop[at] = subscribe(at, () => {
                let text = '';
                for (let i = from + count - 1; i >= from; i--) {
                    text = labelOfWholeRow(churnSignals[i]);
                }
                return text;
            });
        },
        mountOnColumn: at => {
            stop[at] = subscribe(at, () => churnSignals[0].label.value);
        },
        mountOnChain: (at, from, count, depth) => {
            let below: ReadonlySignal<string> = computed(() => {
                let text = churnSignals[from].label.value;
                for (let i = from + 1; i < from + count; i++) {
                    text = `${text},${churnSignals[i].label.value}`;
                }
                return chainLevelOf(text, 1);
            });
            for (let level = 2; level <= depth; level++) {
                const under = below;
                below = computed(() => chainLevelOf(under.value, level));
            }
            stop[at] = subscribe(at, () => below.value);
        },
        mountOnDiamond: (at, from) => {
            const root = churnSignals[from];
            const left = computed(() => diamondLeftOf(root.label.value));
            const right = computed(() => diamondRightOf(root.label.value));
            const join = computed(() => diamondJoinOf(left.value, right.value));
            stop[at] = subscribe(at, () => join.value);
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
            churnSignals.length = 0;
            churnRead.length = 0;
            byId.clear();
        },
    };
};

/**
 * THE SAME STORE, ASKED TO READ — the window wiring's shape with THE OFFSET IN A
 * SIGNAL, a second view carrying a second predicate, and a keyed pull that
 * resolves nothing in advance.
 *
 * Why the offset is a signal and not a field: `preact-signals.md`.
 */
const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const byId = new Map<string, TRowSignal>();
    const byGroup = new Map<string, TBucketSignal>();
    const byAxisGroup = new Map<string, TBucketSignal>();
    const $offset = signal(0);
    const $group = signal(view.groupA);
    const found: TRow[] = [];

    const bucketOfIn =
        (buckets: Map<string, TBucketSignal>): TBucketOf =>
        (group: string): TBucketSignal => {
            let bucket = buckets.get(group);
            if (bucket === undefined) {
                bucket = signal<readonly TRowSignal[]>([]);
                buckets.set(group, bucket);
            }
            return bucket;
        };
    const bucketOf = bucketOfIn(byGroup);
    const axisBucketOf = bucketOfIn(byAxisGroup);

    const $paged = computed(() => {
        const offset = $offset.value;
        return bucketOf($group.value).value.slice(offset, offset + view.window);
    });
    const $onAxis = computed(() =>
        axisBucketOf(view.groupA).value.slice(0, view.window)
    );

    const stop = [
        effect(() => {
            deliverPage(consumers.a, shownRecords($paged.value), 0, view.window);
        }),
        effect(() => {
            deliverPage(consumers.b, shownRecords($onAxis.value), 0, view.window);
        }),
    ];

    return {
        write: incoming => {
            batch(() => {
                let drafts: Map<TBucketSignal, TRowSignal[]> | undefined;
                const draftOf = (bucket: TBucketSignal): TRowSignal[] => {
                    if (drafts === undefined) drafts = new Map();
                    let draft = drafts.get(bucket);
                    if (draft === undefined) {
                        draft = bucket.value.slice();
                        drafts.set(bucket, draft);
                    }
                    return draft;
                };
                for (let i = 0; i < incoming.length; i++) {
                    const row = incoming[i];
                    const held = byId.get(row.id);
                    const onAxis = onSecondAxis(row.id);
                    if (held === undefined) {
                        const created = recordOf(row);
                        byId.set(row.id, created);
                        spliceIn(draftOf(bucketOf(row.group)), created, row.rank);
                        if (onAxis) {
                            spliceIn(draftOf(axisBucketOf(row.group)), created, row.rank);
                        }
                    } else {
                        const storedGroup = held.group.value;
                        const storedRank = held.rank.value;
                        if (storedGroup !== row.group || storedRank !== row.rank) {
                            spliceOut(draftOf(bucketOf(storedGroup)), held, storedRank);
                            spliceIn(draftOf(bucketOf(row.group)), held, row.rank);
                            if (onAxis) {
                                spliceOut(
                                    draftOf(axisBucketOf(storedGroup)),
                                    held,
                                    storedRank
                                );
                                spliceIn(draftOf(axisBucketOf(row.group)), held, row.rank);
                            }
                        }
                        assign(held, row);
                    }
                }
                if (drafts !== undefined) {
                    for (const [bucket, draft] of drafts) bucket.value = draft;
                }
            });
        },
        remove: ids => unfileRows(byId, bucketOf, ids, axisBucketOf),
        patchLabel: (id, label) => {
            const held = byId.get(id);
            if (held !== undefined) held.label.value = label;
        },
        patchNote: (id, note) => {
            const held = byId.get(id);
            if (held !== undefined) held.note.value = note;
        },
        setGroup: (id, group) => {
            const held = byId.get(id);
            if (held === undefined) return;
            const fromGroup = held.group.value;
            const rank = held.rank.value;
            batch(() => {
                held.group.value = group;
                const from = bucketOf(fromGroup);
                from.value = without(from.value, held, rank);
                const to = bucketOf(group);
                to.value = including(to.value, held, rank);
                if (!onSecondAxis(held.id)) return;
                const axisFrom = axisBucketOf(fromGroup);
                axisFrom.value = without(axisFrom.value, held, rank);
                const axisTo = axisBucketOf(group);
                axisTo.value = including(axisTo.value, held, rank);
            });
        },
        setRank: (id, rank) => {
            const held = byId.get(id);
            if (held !== undefined) rerankRow(held, bucketOf, rank, axisBucketOf);
        },
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        // ONE MAP PROBE AND ONE `.value` PER KEY. Nothing resolved in advance,
        // nothing remembered between pages, and the read is untracked.
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const held = byId.get(keys[from + i]);
                if (held !== undefined) {
                    found.push(shownOf(held, held.rank.value));
                }
            }
            deliverPage(consumers.a, found, 0, count);
        },
        // ONE SIGNAL WRITE. No row is touched; the paged computed is what reads it.
        scrollTo: to => {
            $offset.value = to;
        },
        switchGroup: group => {
            batch(() => {
                $group.value = group;
                $offset.value = 0;
            });
        },
        settle: () => undefined,
        readAll: () => Array.from(byId.values(), rowOf),
        deliverableRows: () => undefined,
        groupOrder: group => {
            const bucket = byGroup.get(group);
            if (bucket === undefined) return [];
            const records = bucket.value;
            const held: TRow[] = [];
            for (let i = 0; i < records.length; i++) {
                held.push(rowOf(records[i]));
            }
            return orderedIdsOfRows(held);
        },
        dispose: () => {
            for (const release of stop) release();
            stop.length = 0;
            found.length = 0;
            byId.clear();
            byGroup.clear();
            byAxisGroup.clear();
        },
    };
};

/**
 * THE SAME STORE HOLDING TWO ENTITY TYPES — a second id → signal map for the
 * owners, and a third keyed by a JOINED PAIR OF IDS.
 *
 * Why the join is preact's own tracking rather than a lookup, and why the pair
 * address is a string: `packages/bench/src/adapters/preact-signals.md`.
 */
const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    // id → signal for both types: a table of HANDLES, not storage.
    const byId = new Map<string, TRowSignal>();
    type TOwnerSignals = { id: string; name: Signal<string> };
    type TPairSignals = { owner: string; row: string; mark: Signal<string> };
    const $ownerPopulation = signal<readonly TOwnerSignals[]>([]);
    const ownerById = new Map<string, TOwnerSignals>();
    // The pair address → the signals holding that record. A joined string, because
    // a signal library has nothing else to key on.
    const pairByKey = new Map<string, TPairSignals>();
    const $pairPopulation = signal<readonly TPairSignals[]>([]);

    let config: TRelationConfig = {
        ids: [],
        ranks: [],
        owners: [],
        touched: [],
        names: [],
        seeds: [],
    };
    const touchedSignals: TOwnerSignals[] = [];
    const rowOwnerSignals: TOwnerSignals[] = [];
    const pairSignals: TPairSignals[] = [];
    const relationStop: (() => void)[] = [];
    const nameText: string[] = [];
    const markText: string[] = [];

    const pairKey = (owner: string, row: string): string => `${owner} ${row}`;

    return {
        write: incoming => {
            batch(() => {
                for (let i = 0; i < incoming.length; i++) {
                    const row = incoming[i];
                    const held = byId.get(row.id);
                    if (held === undefined) {
                        byId.set(row.id, recordOf(row));
                    } else {
                        assign(held, row);
                    }
                }
            });
        },
        remove: ids => {
            for (let i = 0; i < ids.length; i++) byId.delete(ids[i]);
        },
        patchLabel: (id, label) => {
            const held = byId.get(id);
            if (held !== undefined) held.label.value = label;
        },
        patchNote: (id, note) => {
            const held = byId.get(id);
            if (held !== undefined) held.note.value = note;
        },
        setGroup: (id, group) => {
            const held = byId.get(id);
            if (held !== undefined) held.group.value = group;
        },
        setRank: (id, rank) => {
            const held = byId.get(id);
            if (held !== undefined) held.rank.value = rank;
        },
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        writeOwners: incoming => {
            batch(() => {
                const grown = $ownerPopulation.value.slice();
                for (let i = 0; i < incoming.length; i++) {
                    const owner = incoming[i];
                    const created: TOwnerSignals = {
                        id: owner.id,
                        name: signal(owner.name),
                    };
                    ownerById.set(owner.id, created);
                    grown.push(created);
                }
                $ownerPopulation.value = grown;
            });
        },
        // Resolved once, and the pair records minted at their seeds — outside the
        // clock. THE TWO EFFECTS ARE THE SUBSCRIPTION: creating one runs its body,
        // which is both how preact learns what it reads and the delivery owed here.
        holdRelation: given => {
            config = given;
            nameText.length = given.ids.length;
            markText.length = given.ids.length;
            for (let at = 0; at < given.touched.length; at++) {
                const held = ownerById.get(given.touched[at]);
                if (held !== undefined) touchedSignals.push(held);
            }
            batch(() => {
                const grown = $pairPopulation.value.slice();
                for (let i = 0; i < given.ids.length; i++) {
                    const owner = given.owners[i];
                    const row = given.ids[i];
                    const ownerSignal = ownerById.get(owner);
                    if (ownerSignal !== undefined) {
                        rowOwnerSignals.push(ownerSignal);
                    }
                    const created: TPairSignals = {
                        owner,
                        row,
                        mark: signal(given.seeds[i]),
                    };
                    pairByKey.set(pairKey(owner, row), created);
                    pairSignals.push(created);
                    grown.push(created);
                }
                $pairPopulation.value = grown;
            });
            relationStop.push(
                effect(() => {
                    for (let i = 0; i < rowOwnerSignals.length; i++) {
                        nameText[i] = rowOwnerSignals[i].name.value;
                    }
                    deliverRelation(consumers.a, config, nameText);
                })
            );
            relationStop.push(
                effect(() => {
                    for (let i = 0; i < pairSignals.length; i++) {
                        markText[i] = pairSignals[i].mark.value;
                    }
                    deliverRelation(consumers.b, config, markText);
                })
            );
        },
        // ONE SIGNAL WRITE, at a POSITION — no map read. It cannot reach view B,
        // whose effect never read an owner.
        patchOwnerName: (at, name) => {
            touchedSignals[at].name.value = name;
        },
        // The string is built fresh every call: caching eight of them would make
        // the row a measurement of an array read.
        writePair: (at, mark) => {
            const held = pairByKey.get(pairKey(config.owners[at], config.ids[at]));
            if (held === undefined) return;
            held.mark.value = mark;
        },
        settle: () => undefined,
        readAll: () => Array.from(byId.values(), rowOf),
        deliverableRows: () => undefined,
        groupOrder: () => undefined,
        readOwners: () => {
            const population = $ownerPopulation.value;
            const out: TOwner[] = [];
            for (let i = 0; i < population.length; i++) {
                out.push({ id: population[i].id, name: population[i].name.value });
            }
            return out;
        },
        // The address is read OUT OF THE RECORD and not out of `pairByKey`, whose
        // keys are this file's own composition.
        readPairs: () => {
            const population = $pairPopulation.value;
            const out: TPairRow[] = [];
            for (let i = 0; i < population.length; i++) {
                const pair = population[i];
                out.push({ owner: pair.owner, row: pair.row, mark: pair.mark.value });
            }
            return out;
        },
        dispose: () => {
            for (const stop of relationStop) stop();
            relationStop.length = 0;
            touchedSignals.length = 0;
            rowOwnerSignals.length = 0;
            pairSignals.length = 0;
            nameText.length = 0;
            markText.length = 0;
            byId.clear();
            ownerById.clear();
            pairByKey.clear();
        },
    };
};


/**
 * ONE SIGNAL, ONE EFFECT, AND A SECOND SIGNAL BESIDE IT. No collection, no key
 * and no map, because the task has none and the library needs none for it.
 *
 * Why the priming flag is not a value check, and why there is no `batch` here:
 * `packages/bench/src/adapters/preact-signals.md`.
 */
const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
    const value = signal('');
    const bystander = signal('');
    const stop: (() => void)[] = [];
    let name = '';
    let bystanderName = '';
    let read = '';
    let readBystander = '';
    let woke = false;
    let wokeBystander = false;

    return {
        ...noRowStore('preact-signals'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            value.value = config.seeds[0];
            bystander.value = config.seeds[1];
            let primed = false;
            stop.push(
                effect(() => {
                    read = value.value;
                    if (!primed) {
                        primed = true;
                        return;
                    }
                    woke = true;
                })
            );
            let primedBystander = false;
            stop.push(
                effect(() => {
                    readBystander = bystander.value;
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
            value.value = next;
        },
        readSingle: () => value.value,
        readBystander: () => bystander.value,
        frame,
        // Every effect has already run; what is left is the frame boundary.
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

export const preactSignalsAdapter: TAdapter = {
    name: 'preact-signals',
    version: '1.14.4',
    docs: 'https://github.com/preactjs/signals/tree/main/packages/core#batchfn',
    departure:
        'a removal of up to eight ids copies each touched bucket without that row, and a larger one ' +
        'rebuilds each touched bucket signal once for the whole batch rather than per removed row.',
    admission:
        'every row is a @preact/signals-core signal per mutable field (group, rank, label, note), and ' +
        'the id and group maps ' +
        'beside them hold handles to those signals rather than any value; the change signal is ' +
        "preact's own effect, run when the outermost batch returns.",

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
    // THE SAME BODY, HANDED FIFTY VIEWS INSTEAD OF TWO.
    bindPerGroup: (consumers, view) => bindViews(consumers.views, view),
};
