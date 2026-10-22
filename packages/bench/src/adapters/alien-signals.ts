import {
    computed,
    effect,
    endBatch,
    signal,
    startBatch,
    trigger,
} from 'alien-signals';
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

// Recipe: alien-signals 3.2 — a row is a signal per mutable field, one signal per group
// holding that group's row records, a computed and an effect per view. The rest:
// `alien-signals.md`.

type TField<T> = { (): T; (value: T): void };

type TRowSignal = {
    readonly id: string;
    readonly group: TField<string>;
    readonly rank: TField<number>;
    readonly label: TField<string>;
    readonly note: TField<string>;
};

// A group's contents over HANDLES: the type says what the index is allowed to be — row
// records of signals, never a row.
type TGroupSignal = {
    (): TRowSignal[];
    (value: TRowSignal[]): void;
};

const recordOf = (row: TRow): TRowSignal => ({
    id: row.id,
    group: signal(row.group),
    rank: signal(row.rank),
    label: signal(row.label),
    note: signal(row.note),
});

const assign = (record: TRowSignal, row: TRow): void => {
    record.group(row.group);
    record.rank(row.rank);
    record.label(row.label);
    record.note(row.note);
};

const rowOf = (record: TRowSignal): TRow => ({
    id: record.id,
    group: record.group(),
    rank: record.rank(),
    label: record.label(),
    note: record.note(),
});

const shownOf = (record: TRowSignal, rank: number): TRow => ({
    id: record.id,
    group: '',
    rank,
    label: record.label(),
    note: '',
});

const shownRecords = (records: readonly TRowSignal[]): TRow[] => {
    const out: TRow[] = new Array(records.length);
    for (let i = 0; i < records.length; i++) {
        out[i] = shownOf(records[i], records[i].rank());
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
        const otherRank = other.rank();
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

// startBatch/endBatch: node_modules/alien-signals/esm/index.mjs:67-74
const inBatch = (run: () => void): void => {
    startBatch();
    try {
        run();
    } finally {
        endBatch();
    }
};

const triggerBuckets = (buckets: Iterable<TGroupSignal>): void => {
    trigger(() => {
        for (const bucket of buckets) bucket();
    });
};

const SPLICE_REMOVAL_LIMIT = 8;

type TBucketOf = (group: string) => TGroupSignal;

const bucketOfIn =
    (byGroup: Map<string, TGroupSignal>): TBucketOf =>
    (group: string): TGroupSignal => {
        let bucket = byGroup.get(group);
        if (bucket === undefined) {
            bucket = signal<TRowSignal[]>([]);
            byGroup.set(group, bucket);
        }
        return bucket;
    };

const spliceOut = (rows: TRowSignal[], held: TRowSignal, rank: number): void => {
    const at = positionOf(rows, rank, held.id);
    if (rows[at] === held) rows.splice(at, 1);
};

const fileRows = (
    byId: Map<string, TRowSignal>,
    bucketOf: TBucketOf,
    incoming: readonly TRow[],
    axisBucketOf?: TBucketOf
): void => {
    inBatch(() => {
        let touched: Set<TGroupSignal> | undefined;
        for (let i = 0; i < incoming.length; i++) {
            const row = incoming[i];
            const held = byId.get(row.id);
            const axisOf =
                axisBucketOf !== undefined && onSecondAxis(row.id)
                    ? axisBucketOf
                    : undefined;
            if (held === undefined) {
                const created = recordOf(row);
                byId.set(row.id, created);
                const joined = bucketOf(row.group);
                spliceIn(joined(), created, row.rank);
                (touched ??= new Set()).add(joined);
                if (axisOf !== undefined) {
                    const axisJoined = axisOf(row.group);
                    spliceIn(axisJoined(), created, row.rank);
                    touched.add(axisJoined);
                }
                continue;
            }
            const storedGroup = held.group();
            const storedRank = held.rank();
            if (storedGroup === row.group && storedRank === row.rank) {
                assign(held, row);
                continue;
            }
            const left = bucketOf(storedGroup);
            spliceOut(left(), held, storedRank);
            const joined = bucketOf(row.group);
            spliceIn(joined(), held, row.rank);
            (touched ??= new Set()).add(left).add(joined);
            if (axisOf !== undefined) {
                const axisLeft = axisOf(storedGroup);
                spliceOut(axisLeft(), held, storedRank);
                const axisJoined = axisOf(row.group);
                spliceIn(axisJoined(), held, row.rank);
                touched.add(axisLeft).add(axisJoined);
            }
            assign(held, row);
        }
        if (touched !== undefined) triggerBuckets(touched);
    });
};

const unfileFew = (
    byId: Map<string, TRowSignal>,
    bucketOf: TBucketOf,
    ids: readonly string[],
    axisBucketOf: TBucketOf | undefined
): void => {
    inBatch(() => {
        for (let i = 0; i < ids.length; i++) {
            const held = byId.get(ids[i]);
            if (held === undefined) continue;
            byId.delete(ids[i]);
            const group = held.group();
            const rank = held.rank();
            const left = bucketOf(group);
            spliceOut(left(), held, rank);
            trigger(left);
            if (axisBucketOf !== undefined && onSecondAxis(held.id)) {
                const axisLeft = axisBucketOf(group);
                spliceOut(axisLeft(), held, rank);
                trigger(axisLeft);
            }
        }
    });
};

const unfileRows = (
    byId: Map<string, TRowSignal>,
    bucketOf: TBucketOf,
    ids: readonly string[],
    axisBucketOf?: TBucketOf
): void => {
    if (ids.length <= SPLICE_REMOVAL_LIMIT) {
        unfileFew(byId, bucketOf, ids, axisBucketOf);
        return;
    }
    inBatch(() => {
        const leaving = new Set<TRowSignal>();
        const touched = new Set<TGroupSignal>();
        for (let i = 0; i < ids.length; i++) {
            const held = byId.get(ids[i]);
            if (held === undefined) continue;
            byId.delete(ids[i]);
            leaving.add(held);
            const group = held.group();
            touched.add(bucketOf(group));
            if (axisBucketOf !== undefined && onSecondAxis(held.id)) {
                touched.add(axisBucketOf(group));
            }
        }
        if (leaving.size === 0) return;
        for (const bucket of touched) {
            const rows = bucket();
            let kept = 0;
            for (let i = 0; i < rows.length; i++) {
                if (!leaving.has(rows[i])) rows[kept++] = rows[i];
            }
            rows.length = kept;
        }
        triggerBuckets(touched);
    });
};

const moveRow = (
    held: TRowSignal,
    bucketOf: TBucketOf,
    group: string,
    axisBucketOf?: TBucketOf
): void => {
    const from = held.group();
    const rank = held.rank();
    inBatch(() => {
        held.group(group);
        const left = bucketOf(from);
        spliceOut(left(), held, rank);
        const joined = bucketOf(group);
        spliceIn(joined(), held, rank);
        if (axisBucketOf !== undefined && onSecondAxis(held.id)) {
            const axisLeft = axisBucketOf(from);
            spliceOut(axisLeft(), held, rank);
            const axisJoined = axisBucketOf(group);
            spliceIn(axisJoined(), held, rank);
            triggerBuckets([left, joined, axisLeft, axisJoined]);
            return;
        }
        triggerBuckets([left, joined]);
    });
};

const rerankRow = (
    held: TRowSignal,
    bucketOf: TBucketOf,
    rank: number,
    axisBucketOf?: TBucketOf
): void => {
    const from = held.rank();
    if (from === rank) return;
    const group = held.group();
    inBatch(() => {
        const bucket = bucketOf(group);
        spliceOut(bucket(), held, from);
        spliceIn(bucket(), held, rank);
        if (axisBucketOf !== undefined && onSecondAxis(held.id)) {
            const axisBucket = axisBucketOf(group);
            spliceOut(axisBucket(), held, from);
            spliceIn(axisBucket(), held, rank);
            held.rank(rank);
            triggerBuckets([bucket, axisBucket]);
            return;
        }
        held.rank(rank);
        trigger(bucket);
    });
};

const bindViews = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    // id → signal: A TABLE OF HANDLES, never of values. Admitted because A KEY LOOKUP
    // IS NOT STORAGE — every value lives in a signal the library owns and every read
    // goes through the library's own accessor. `packages/bench/PARTICIPANTS.md`.
    const byId = new Map<string, TRowSignal>();
    // A group's contents have to be reactive: a row moving into a group is not a write
    // to anything the destination view already reads, so the bucket itself is what must
    // propagate. The rest: `alien-signals.md`.
    const byGroup = new Map<string, TGroupSignal>();

    // CREATED empty the first time anyone asks — this is also called from inside the
    // view computeds, and a view's first recompute happens before any row has named its
    // group. The rest: `alien-signals.md`.
    const bucketOf = (group: string): TGroupSignal => {
        let bucket = byGroup.get(group);
        if (bucket === undefined) {
            bucket = signal<TRowSignal[]>([]);
            byGroup.set(group, bucket);
        }
        return bucket;
    };

    // ONE COMPUTED AND ONE EFFECT PER VIEW — two, or fifty. The computed reads only its
    // bucket, which is kept in rank order; the effect reads the rank and label of what
    // the computed selected. The rest: `alien-signals.md`.
    const windows = bindings.map(bound => {
        const top = computed(() => bucketOf(bound.group)().slice(0, view.window));
        return effect(() => {
            deliver(bound.consumer, shownRecords(top()), view.window);
        });
    });

    // `pinned` holds the ROW SIGNALS: what the pin hoists out of the clock is the map
    // read that opens all four point writes above. The rest: `alien-signals.md`.
    const pinned: TRowSignal[] = [];
    const cellStop: (() => void)[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };
    const labelText: string[] = [];
    const noteText: string[] = [];
    /** The targeted-delivery script is a two-view script and is never bound per group. */
    const labelConsumer = bindings[0].consumer;
    const noteConsumer = bindings[1].consumer;

    // Reads on the write path are untracked for free: alien only records a
    // dependency when there is an active subscriber, and the harness calls these
    // methods from outside every effect and computed.
    return {
        // NO HAND-ROLLED VALUE DIFF — see `TBinding.write`. The rest:
        // `alien-signals.md`.
        write: incoming => fileRows(byId, bucketOf, incoming),
        // The row signals that left stop being read, which is what drops them from
        // every computed's dependencies. The rest: `alien-signals.md`.
        remove: ids => unfileRows(byId, bucketOf, ids),
        patchLabel: (id, label) => {
            byId.get(id)?.label(label);
        },
        patchNote: (id, note) => {
            byId.get(id)?.note(note);
        },
        // Three signals, one batch: the row's group field, the bucket it leaves, the
        // bucket it joins. The rest: `alien-signals.md`.
        setGroup: (id, group) => {
            const held = byId.get(id);
            if (held === undefined) return;
            moveRow(held, bucketOf, group);
        },
        setRank: (id, rank) => {
            const held = byId.get(id);
            if (held === undefined) return;
            rerankRow(held, bucketOf, rank);
        },
        // THE RECORDS, RESOLVED ONCE — `byId.get(id)` is the map read every point write
        // above opens with, hoisted out of the clock here. The rest:
        // `alien-signals.md`.
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
                        labelText[i] = pinned[i].label();
                    }
                    deliverCells(labelConsumer, cells, labelText);
                })
            );
            cellStop.push(
                effect(() => {
                    for (let i = 0; i < pinned.length; i++) {
                        noteText[i] = pinned[i].note();
                    }
                    deliverCells(noteConsumer, cells, noteText);
                })
            );
        },
        patchPinnedLabel: (at, label) => {
            pinned[at].label(label);
        },
        patchPinnedNote: (at, note) => {
            pinned[at].note(note);
        },
        frame: inBatch,
        // A no-op, and it has to be: alien flushes the effect queue synchronously
        // at the outermost `endBatch` or after an unbatched write, so both consumers
        // have already run. Nothing here may render on the graph's behalf.
        settle: () => undefined,
        readAll: () => Array.from(byId.values(), rowOf),
        deliverableRows: () => undefined,
        // The arm of the audit that bites here: `readAll` says nothing about `byGroup`,
        // and `byGroup` is what a view is derived from. The rest: `alien-signals.md`.
        groupOrder: group => {
            const bucket = byGroup.get(group);
            if (bucket === undefined) return [];
            const records = bucket();
            const held: TRow[] = new Array(records.length);
            for (let i = 0; i < records.length; i++) held[i] = rowOf(records[i]);
            return orderedIdsOfRows(held);
        },
        dispose: () => {
            for (const stop of windows) stop();
            windows.length = 0;
            // The cell effects, if `pin` installed any. An effect left standing
            // keeps every pinned signal subscribed.
            for (const stop of cellStop) stop();
            cellStop.length = 0;
            pinned.length = 0;
            byId.clear();
            byGroup.clear();
        },
    };
};

// The four ways an alien consumer mounts. `effect(fn)` hands back a stop function and
// is the only primitive here that pulls — a computed nobody calls never runs. The rest:
// `alien-signals.md`.
const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    // id → signal: a table of HANDLES. Admitted for `bindViews`' reason.
    const byId = new Map<string, TRowSignal>();

    /** Resolved once by `holdChurnRows`, so no timed step pays a map read. */
    const churnSignals: TRowSignal[] = [];
    /** What each subscriber last read. */
    const churnRead: (string | undefined)[] = [];
    const stop: ((() => void) | undefined)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    /** `read` is the tracked call that decides which signals this effect depends on. */
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
        record.group();
        record.rank();
        record.note();
        return record.label();
    };

    return {
        write: incoming => {
            inBatch(() => {
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
            byId.get(id)?.label(label);
        },
        patchNote: (id, note) => {
            byId.get(id)?.note(note);
        },
        setGroup: (id, group) => {
            byId.get(id)?.group(group);
        },
        setRank: (id, rank) => {
            byId.get(id)?.rank(rank);
        },
        // A churn binding derives no view and no churn script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame: inBatch,
        // Every effect has already run when the write or the frame returned. What is
        // left is the frame boundary — one delivery if anything woke, none if nothing did.
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
        /** NOTHING TO READ: no view is derived and there are no buckets at all. */
        groupOrder: () => undefined,
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
            stop[at] = subscribe(at, () => churnSignals[0].label());
        },
        mountOnChain: (at, from, count, depth) => {
            let below: () => string = computed(() => {
                let text = churnSignals[from].label();
                for (let i = from + 1; i < from + count; i++) {
                    text = `${text},${churnSignals[i].label()}`;
                }
                return chainLevelOf(text, 1);
            });
            for (let level = 2; level <= depth; level++) {
                const under = below;
                below = computed(() => chainLevelOf(under(), level));
            }
            stop[at] = subscribe(at, () => below());
        },
        mountOnDiamond: (at, from) => {
            const root = churnSignals[from];
            const left = computed(() => diamondLeftOf(root.label()));
            const right = computed(() => diamondRightOf(root.label()));
            const join = computed(() => diamondJoinOf(left(), right()));
            stop[at] = subscribe(at, () => join());
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

// The preact adapter's read wiring, except that buckets are mutated in place and announced with `trigger`: `alien-signals.md`.
const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    // id → signal: a table of HANDLES. Admitted for `bindViews`' reason.
    const byId = new Map<string, TRowSignal>();
    const byGroup = new Map<string, TGroupSignal>();
    const byAxisGroup = new Map<string, TGroupSignal>();
    /** Where view A's window starts. Written by `scrollTo` and `switchGroup` only. */
    const $offset = signal(0);
    const $group = signal(view.groupA);
    /** Reused only by the pull; both views hand back fresh arrays. */
    const found: TRow[] = [];

    const bucketOf = bucketOfIn(byGroup);
    const axisBucketOf = bucketOfIn(byAxisGroup);

    const paged = computed(() => {
        const offset = $offset();
        return bucketOf($group())().slice(offset, offset + view.window);
    });
    const onAxis = computed(() =>
        axisBucketOf(view.groupA)().slice(0, view.window)
    );

    const stop = [
        effect(() => {
            deliverPage(consumers.a, shownRecords(paged()), 0, view.window);
        }),
        effect(() => {
            deliverPage(consumers.b, shownRecords(onAxis()), 0, view.window);
        }),
    ];

    return {
        write: incoming => fileRows(byId, bucketOf, incoming, axisBucketOf),
        remove: ids => unfileRows(byId, bucketOf, ids, axisBucketOf),
        patchLabel: (id, label) => {
            byId.get(id)?.label(label);
        },
        patchNote: (id, note) => {
            byId.get(id)?.note(note);
        },
        setGroup: (id, group) => {
            const held = byId.get(id);
            if (held === undefined) return;
            moveRow(held, bucketOf, group, axisBucketOf);
        },
        setRank: (id, rank) => {
            const held = byId.get(id);
            if (held === undefined) return;
            rerankRow(held, bucketOf, rank, axisBucketOf);
        },
        // No read script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame: inBatch,
        /** ONE MAP PROBE AND ONE SIGNAL CALL PER KEY. Nothing is resolved in advance. */
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const held = byId.get(keys[from + i]);
                if (held !== undefined) found.push(shownOf(held, held.rank()));
            }
            deliverPage(consumers.a, found, 0, count);
        },
        // ONE SIGNAL WRITE. Nothing is re-ordered and no row is touched.
        scrollTo: to => {
            $offset(to);
        },
        switchGroup: group => {
            inBatch(() => {
                $group(group);
                $offset(0);
            });
        },
        // A no-op: alien has already run its effect queue.
        settle: () => undefined,
        readAll: () => Array.from(byId.values(), rowOf),
        deliverableRows: () => undefined,
        groupOrder: group => {
            const bucket = byGroup.get(group);
            if (bucket === undefined) return [];
            const records = bucket();
            const held: TRow[] = [];
            for (let i = 0; i < records.length; i++) held.push(rowOf(records[i]));
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

type TOwnerSignal = { (): TOwner; (value: TOwner): void };
type TPairSignal = { (): TPairRow; (value: TPairRow): void };

// The preact adapter's relation wiring in alien's surface: `alien-signals.md`.
const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    // id → signal for both types: a table of HANDLES, not storage.
    const byId = new Map<string, TRowSignal>();
    const $ownerPopulation = signal<readonly TOwnerSignal[]>([]);
    const ownerById = new Map<string, TOwnerSignal>();
    // The pair address → the signal holding that record. A joined string, because a
    // signal library has nothing else to key on.
    const pairByKey = new Map<string, TPairSignal>();
    const $pairPopulation = signal<readonly TPairSignal[]>([]);

    let config: TRelationConfig = {
        ids: [],
        ranks: [],
        owners: [],
        touched: [],
        names: [],
        seeds: [],
    };
    /** The owners the join script writes, by POSITION in `config.touched`. */
    const touchedSignals: TOwnerSignal[] = [];
    /** The owner signal each rendered line's name comes from, in `ids` order. */
    const rowOwnerSignals: TOwnerSignal[] = [];
    /** The pair signal each rendered line's mark comes from, in `ids` order. */
    const pairSignals: TPairSignal[] = [];
    const relationStop: (() => void)[] = [];
    const nameText: string[] = [];
    const markText: string[] = [];

    const pairKey = (owner: string, row: string): string => `${owner} ${row}`;

    return {
        write: incoming => {
            inBatch(() => {
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
            byId.get(id)?.label(label);
        },
        patchNote: (id, note) => {
            byId.get(id)?.note(note);
        },
        setGroup: (id, group) => {
            byId.get(id)?.group(group);
        },
        setRank: (id, rank) => {
            byId.get(id)?.rank(rank);
        },
        // No relation script pins: the targeted-delivery script is a two-view
        // script and is bound by `bind`.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame: inBatch,
        writeOwners: incoming => {
            inBatch(() => {
                const grown = $ownerPopulation().slice();
                for (let i = 0; i < incoming.length; i++) {
                    const owner = incoming[i];
                    const created = signal<TOwner>({
                        id: owner.id,
                        name: owner.name,
                    });
                    ownerById.set(owner.id, created);
                    grown.push(created);
                }
                $ownerPopulation(grown);
            });
        },
        // THE SIGNALS BOTH SCRIPTS WORK THROUGH, RESOLVED ONCE, and the pair records
        // minted at their seeds — the mint is outside the clock, so no timed step pays
        // it. The rest: `alien-signals.md`.
        holdRelation: given => {
            config = given;
            nameText.length = given.ids.length;
            markText.length = given.ids.length;
            for (let at = 0; at < given.touched.length; at++) {
                const held = ownerById.get(given.touched[at]);
                if (held !== undefined) touchedSignals.push(held);
            }
            inBatch(() => {
                const grown = $pairPopulation().slice();
                for (let i = 0; i < given.ids.length; i++) {
                    const owner = given.owners[i];
                    const row = given.ids[i];
                    const ownerSignal = ownerById.get(owner);
                    if (ownerSignal !== undefined) {
                        rowOwnerSignals.push(ownerSignal);
                    }
                    const created = signal<TPairRow>({
                        owner,
                        row,
                        mark: given.seeds[i],
                    });
                    pairByKey.set(pairKey(owner, row), created);
                    pairSignals.push(created);
                    grown.push(created);
                }
                $pairPopulation(grown);
            });
            relationStop.push(
                effect(() => {
                    for (let i = 0; i < rowOwnerSignals.length; i++) {
                        nameText[i] = rowOwnerSignals[i]().name;
                    }
                    deliverRelation(consumers.a, config, nameText);
                })
            );
            relationStop.push(
                effect(() => {
                    for (let i = 0; i < pairSignals.length; i++) {
                        markText[i] = pairSignals[i]().mark;
                    }
                    deliverRelation(consumers.b, config, markText);
                })
            );
        },
        // At a POSITION — no map read. It reaches view A because view A's effect called
        // this signal, and it cannot reach view B, whose effect never called an owner.
        patchOwnerName: (at, name) => {
            const held = touchedSignals[at];
            held().name = name;
            trigger(held);
        },
        // The address string is built fresh every call: caching eight of them would
        // make the row a measurement of an array read.
        writePair: (at, mark) => {
            const held = pairByKey.get(pairKey(config.owners[at], config.ids[at]));
            if (held === undefined) return;
            held().mark = mark;
            trigger(held);
        },
        // A no-op: alien has already flushed its effect queue.
        settle: () => undefined,
        readAll: () => Array.from(byId.values(), rowOf),
        deliverableRows: () => undefined,
        /** NOTHING TO READ: no window, no group, no sort, and no buckets at all. */
        groupOrder: () => undefined,
        readOwners: () => {
            const population = $ownerPopulation();
            const out: TOwner[] = [];
            for (let i = 0; i < population.length; i++) out.push(population[i]());
            return out;
        },
        // THE ADDRESS IS READ OUT OF THE RECORD ITSELF and not out of `pairByKey` — the
        // map's keys are this file's own composition, so answering from them would make
        // the audit agree with whatever the composition did.
        readPairs: () => {
            const population = $pairPopulation();
            const out: TPairRow[] = [];
            for (let i = 0; i < population.length; i++) out.push(population[i]());
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


/* ── one value, one subscriber, and a second value beside it ───────────── */

// `preact-signals`'s shape in alien's spelling. No `startBatch`/`endBatch` outside
// `frame`. The rest: `alien-signals.md`.
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
        ...noRowStore('alien-signals'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            value(config.seeds[0]);
            bystander(config.seeds[1]);
            let primed = false;
            stop.push(
                effect(() => {
                    read = value();
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
                    readBystander = bystander();
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
            value(next);
        },
        readSingle: () => value(),
        readBystander: () => bystander(),
        frame: inBatch,
        // Every effect has already run: alien flushes its queue as an unbatched write
        // or the outermost `endBatch` returns. What is left is the frame boundary.
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

export const alienSignalsAdapter: TAdapter = {
    name: 'alien-signals',
    version: '3.2.1',
    docs: 'https://github.com/stackblitz/alien-signals#basic-apis (batching: node_modules/alien-signals/types/index.d.ts — startBatch/endBatch)',
    departure:
        'batched with startBatch()/endBatch(), which the cited README does not document — the pair ' +
        'was read out of the installed type declarations and implementation, because alien-signals ' +
        'ships no batch(fn) wrapper and un-batched writes would flush an effect per row. A bucket ' +
        'is mutated in place and announced with the documented trigger(); a removal of up to eight ids ' +
        'splices each out of its bucket, and a larger one compacts each touched bucket once for the ' +
        'whole batch rather than per removed row.',
    admission:
        'every column lives in an alien-signals `signal` — a row is a signal per mutable field (group, ' +
        'rank, label, note), read by calling it — and each consumer is driven by alien\'s own `effect`, queued by the graph and run synchronously by ' +
        '`endBatch` or by the unbatched write itself. The id -> signal and group -> signal maps this ' +
        'adapter keeps hold handles only, never a value.',

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
