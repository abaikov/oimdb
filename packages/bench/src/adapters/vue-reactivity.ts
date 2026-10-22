import {
    computed,
    effect,
    shallowRef,
    stop,
    triggerRef,
} from '@vue/reactivity';
import type {
    ComputedRef,
    ReactiveEffectRunner,
    ShallowRef,
} from '@vue/reactivity';
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

type TRowRecord = {
    readonly id: string;
    readonly group: ShallowRef<string>;
    readonly rank: ShallowRef<number>;
    readonly label: ShallowRef<string>;
    readonly note: ShallowRef<string>;
};

type TBucketRef = ShallowRef<TRowRecord[]>;

const recordOf = (row: TRow): TRowRecord => ({
    id: row.id,
    group: shallowRef(row.group),
    rank: shallowRef(row.rank),
    label: shallowRef(row.label),
    note: shallowRef(row.note),
});

const assign = (record: TRowRecord, row: TRow): void => {
    record.group.value = row.group;
    record.rank.value = row.rank;
    record.label.value = row.label;
    record.note.value = row.note;
};

const rowOf = (record: TRowRecord): TRow => ({
    id: record.id,
    group: record.group.value,
    rank: record.rank.value,
    label: record.label.value,
    note: record.note.value,
});

const shownOf = (record: TRowRecord, rank: number): TRow => ({
    id: record.id,
    group: '',
    rank,
    label: record.label.value,
    note: '',
});

const shownRecords = (records: readonly TRowRecord[]): TRow[] => {
    const out: TRow[] = new Array(records.length);
    for (let i = 0; i < records.length; i++) {
        out[i] = shownOf(records[i], records[i].rank.value);
    }
    return out;
};

const positionOf = (
    records: readonly TRowRecord[],
    rank: number,
    id: string
): number => {
    let low = 0;
    let high = records.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        const other = records[middle];
        const otherRank = other.rank.value;
        if (otherRank < rank || (otherRank === rank && other.id < id)) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    return low;
};

const spliceIn = (records: TRowRecord[], held: TRowRecord, rank: number): void => {
    records.splice(positionOf(records, rank, held.id), 0, held);
};

const frame = (run: () => void): void => {
    run();
};

// No batch is exported, so effects queue through `effect`'s `scheduler` and `settle` drains them: `vue-reactivity.md`.
const createEffectQueue = () => {
    const queued = new Set<ReactiveEffectRunner>();
    return {
        effect: (fn: () => void): ReactiveEffectRunner => {
            const runner: ReactiveEffectRunner = effect(fn, {
                scheduler: () => {
                    queued.add(runner);
                },
            });
            return runner;
        },
        flush: (): void => {
            for (const runner of queued) {
                queued.delete(runner);
                if (runner.effect.dirty) runner();
            }
        },
        clear: (): void => {
            queued.clear();
        },
    };
};

const stopAll = (runners: ReactiveEffectRunner[]): void => {
    for (let i = 0; i < runners.length; i++) stop(runners[i]);
    runners.length = 0;
};

const bucketOfIn =
    (byGroup: Map<string, TBucketRef>) =>
    (group: string): TBucketRef => {
        let bucket = byGroup.get(group);
        if (bucket === undefined) {
            bucket = shallowRef<TRowRecord[]>([]);
            byGroup.set(group, bucket);
        }
        return bucket;
    };

const groupOrderIn = (
    byGroup: Map<string, TBucketRef>,
    group: string
): readonly string[] => {
    const bucket = byGroup.get(group);
    if (bucket === undefined) return [];
    const records = bucket.value;
    const held: TRow[] = new Array(records.length);
    for (let i = 0; i < records.length; i++) held[i] = rowOf(records[i]);
    return orderedIdsOfRows(held);
};

const SPLICE_REMOVAL_LIMIT = 8;

type TBucketOf = (group: string) => TBucketRef;

const spliceOut = (records: TRowRecord[], held: TRowRecord, rank: number): void => {
    const at = positionOf(records, rank, held.id);
    if (records[at] === held) records.splice(at, 1);
};

const fileRows = (
    byId: Map<string, TRowRecord>,
    bucketOf: TBucketOf,
    incoming: readonly TRow[],
    axisBucketOf?: TBucketOf
): void => {
    let touched: Set<TBucketRef> | undefined;
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
            spliceIn(joined.value, created, row.rank);
            (touched ??= new Set()).add(joined);
            if (axisOf !== undefined) {
                const axisJoined = axisOf(row.group);
                spliceIn(axisJoined.value, created, row.rank);
                touched.add(axisJoined);
            }
            continue;
        }
        const storedGroup = held.group.value;
        const storedRank = held.rank.value;
        if (storedGroup === row.group && storedRank === row.rank) {
            assign(held, row);
            continue;
        }
        const left = bucketOf(storedGroup);
        spliceOut(left.value, held, storedRank);
        const joined = bucketOf(row.group);
        spliceIn(joined.value, held, row.rank);
        (touched ??= new Set()).add(left).add(joined);
        if (axisOf !== undefined) {
            const axisLeft = axisOf(storedGroup);
            spliceOut(axisLeft.value, held, storedRank);
            const axisJoined = axisOf(row.group);
            spliceIn(axisJoined.value, held, row.rank);
            touched.add(axisLeft).add(axisJoined);
        }
        assign(held, row);
    }
    if (touched === undefined) return;
    for (const bucket of touched) triggerRef(bucket);
};

const unfileFew = (
    byId: Map<string, TRowRecord>,
    bucketOf: TBucketOf,
    ids: readonly string[],
    axisBucketOf: TBucketOf | undefined
): void => {
    for (let i = 0; i < ids.length; i++) {
        const held = byId.get(ids[i]);
        if (held === undefined) continue;
        byId.delete(ids[i]);
        const group = held.group.value;
        const rank = held.rank.value;
        const left = bucketOf(group);
        spliceOut(left.value, held, rank);
        triggerRef(left);
        if (axisBucketOf !== undefined && onSecondAxis(held.id)) {
            const axisLeft = axisBucketOf(group);
            spliceOut(axisLeft.value, held, rank);
            triggerRef(axisLeft);
        }
    }
};

const unfileRows = (
    byId: Map<string, TRowRecord>,
    bucketOf: TBucketOf,
    ids: readonly string[],
    axisBucketOf?: TBucketOf
): void => {
    if (ids.length <= SPLICE_REMOVAL_LIMIT) {
        unfileFew(byId, bucketOf, ids, axisBucketOf);
        return;
    }
    const leaving = new Set<TRowRecord>();
    const touched = new Set<TBucketRef>();
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
        const records = bucket.value;
        let kept = 0;
        for (let i = 0; i < records.length; i++) {
            if (!leaving.has(records[i])) records[kept++] = records[i];
        }
        records.length = kept;
        triggerRef(bucket);
    }
};

const moveRow = (
    held: TRowRecord,
    bucketOf: TBucketOf,
    group: string,
    axisBucketOf?: TBucketOf
): void => {
    const from = held.group.value;
    const rank = held.rank.value;
    const left = bucketOf(from);
    held.group.value = group;
    spliceOut(left.value, held, rank);
    const joined = bucketOf(group);
    spliceIn(joined.value, held, rank);
    triggerRef(left);
    triggerRef(joined);
    if (axisBucketOf === undefined || !onSecondAxis(held.id)) return;
    const axisLeft = axisBucketOf(from);
    spliceOut(axisLeft.value, held, rank);
    const axisJoined = axisBucketOf(group);
    spliceIn(axisJoined.value, held, rank);
    triggerRef(axisLeft);
    triggerRef(axisJoined);
};

const rerankRow = (
    held: TRowRecord,
    bucketOf: TBucketOf,
    rank: number,
    axisBucketOf?: TBucketOf
): void => {
    const from = held.rank.value;
    if (from === rank) return;
    const group = held.group.value;
    const bucket = bucketOf(group);
    spliceOut(bucket.value, held, from);
    spliceIn(bucket.value, held, rank);
    triggerRef(bucket);
    if (axisBucketOf !== undefined && onSecondAxis(held.id)) {
        const axisBucket = axisBucketOf(group);
        spliceOut(axisBucket.value, held, from);
        spliceIn(axisBucket.value, held, rank);
        triggerRef(axisBucket);
    }
    held.rank.value = rank;
};

const writeRecords = (
    byId: Map<string, TRowRecord>,
    incoming: readonly TRow[]
): void => {
    for (let i = 0; i < incoming.length; i++) {
        const row = incoming[i];
        const held = byId.get(row.id);
        if (held === undefined) byId.set(row.id, recordOf(row));
        else assign(held, row);
    }
};

const bindViews = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    const byId = new Map<string, TRowRecord>();
    const byGroup = new Map<string, TBucketRef>();
    const bucketOf = bucketOfIn(byGroup);
    const effectQueue = createEffectQueue();

    const windows: ReactiveEffectRunner[] = bindings.map(bound => {
        const top = computed(() => bucketOf(bound.group).value.slice(0, view.window));
        return effectQueue.effect(() => {
            deliver(bound.consumer, shownRecords(top.value), view.window);
        });
    });

    const pinned: TRowRecord[] = [];
    const cellStop: ReactiveEffectRunner[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };
    const labelText: string[] = [];
    const noteText: string[] = [];
    const labelConsumer = bindings[0].consumer;
    const noteConsumer = bindings[1].consumer;

    return {
        write: incoming => fileRows(byId, bucketOf, incoming),
        remove: ids => unfileRows(byId, bucketOf, ids),
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
            if (held !== undefined) moveRow(held, bucketOf, group);
        },
        setRank: (id, rank) => {
            const held = byId.get(id);
            if (held !== undefined) rerankRow(held, bucketOf, rank);
        },
        pin: config => {
            stopAll(windows);
            cells = config;
            pinned.length = 0;
            for (let i = 0; i < config.ids.length; i++) {
                const held = byId.get(config.ids[i]);
                if (held !== undefined) pinned.push(held);
            }
            labelText.length = pinned.length;
            noteText.length = pinned.length;
            cellStop.push(
                effectQueue.effect(() => {
                    for (let i = 0; i < pinned.length; i++) {
                        labelText[i] = pinned[i].label.value;
                    }
                    deliverCells(labelConsumer, cells, labelText);
                })
            );
            cellStop.push(
                effectQueue.effect(() => {
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
        settle: effectQueue.flush,
        readAll: () => Array.from(byId.values(), rowOf),
        deliverableRows: () => undefined,
        groupOrder: group => groupOrderIn(byGroup, group),
        dispose: () => {
            stopAll(windows);
            stopAll(cellStop);
            effectQueue.clear();
            pinned.length = 0;
            byId.clear();
            byGroup.clear();
        },
    };
};

const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    const byId = new Map<string, TRowRecord>();
    const effectQueue = createEffectQueue();
    const churnRecords: TRowRecord[] = [];
    const churnRead: (string | undefined)[] = [];
    const runners: (ReactiveEffectRunner | undefined)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    const subscribe = (at: number, read: () => string): ReactiveEffectRunner => {
        let primed = false;
        return effectQueue.effect(() => {
            churnRead[at] = read();
            if (!primed) {
                primed = true;
                return;
            }
            churnWoke++;
        });
    };

    const labelOfWholeRow = (record: TRowRecord): string => {
        record.group.value;
        record.rank.value;
        record.note.value;
        return record.label.value;
    };

    const labelOfRange = (from: number, count: number): string => {
        let text = '';
        for (let i = from + count - 1; i >= from; i--) {
            text = labelOfWholeRow(churnRecords[i]);
        }
        return text;
    };

    const joinedLabelOfRange = (from: number, count: number): string => {
        let text = churnRecords[from].label.value;
        for (let i = from + 1; i < from + count; i++) {
            text = `${text},${churnRecords[i].label.value}`;
        }
        return text;
    };

    return {
        write: incoming => writeRecords(byId, incoming),
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
        settle: () => {
            effectQueue.flush();
            if (churnWoke === 0) return;
            deliverChurn(churnConsumer, churnId, churnRank, churnWoke, churnRead);
            churnWoke = 0;
        },
        readAll: () => Array.from(byId.values(), rowOf),
        deliverableRows: () => undefined,
        groupOrder: () => undefined,
        holdChurnRows: (ids, ranks) => {
            churnId = ids[0];
            churnRank = ranks[0];
            for (let i = 0; i < ids.length; i++) {
                const held = byId.get(ids[i]);
                if (held !== undefined) churnRecords.push(held);
                churnRead[i] = undefined;
            }
        },
        mountOnRows: (at, from, count) => {
            runners[at] =
                count === 1
                    ? subscribe(at, () => labelOfWholeRow(churnRecords[from]))
                    : subscribe(at, () => labelOfRange(from, count));
        },
        mountOnColumn: at => {
            runners[at] = subscribe(at, () => churnRecords[0].label.value);
        },
        mountOnChain: (at, from, count, depth) => {
            let below: ComputedRef<string> = computed(() =>
                chainLevelOf(joinedLabelOfRange(from, count), 1)
            );
            for (let level = 2; level <= depth; level++) {
                const under = below;
                below = computed(() => chainLevelOf(under.value, level));
            }
            const head = below;
            runners[at] = subscribe(at, () => head.value);
        },
        mountOnDiamond: (at, from) => {
            const root = churnRecords[from];
            const left = computed(() => diamondLeftOf(root.label.value));
            const right = computed(() => diamondRightOf(root.label.value));
            const join = computed(() => diamondJoinOf(left.value, right.value));
            runners[at] = subscribe(at, () => join.value);
        },
        unmount: at => {
            const runner = runners[at];
            if (runner === undefined) return;
            stop(runner);
            runners[at] = undefined;
            churnRead[at] = undefined;
        },
        dispose: () => {
            for (let i = 0; i < runners.length; i++) {
                const runner = runners[i];
                if (runner !== undefined) stop(runner);
            }
            runners.length = 0;
            effectQueue.clear();
            churnRecords.length = 0;
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
    const byId = new Map<string, TRowRecord>();
    const byGroup = new Map<string, TBucketRef>();
    const byAxisGroup = new Map<string, TBucketRef>();
    const bucketOf = bucketOfIn(byGroup);
    const axisBucketOf = bucketOfIn(byAxisGroup);
    const effectQueue = createEffectQueue();
    const $offset = shallowRef(0);
    const $group = shallowRef(view.groupA);
    const found: TRow[] = [];

    const paged = computed(() => {
        const offset = $offset.value;
        return bucketOf($group.value).value.slice(offset, offset + view.window);
    });
    const onAxis = computed(() => axisBucketOf(view.groupA).value.slice(0, view.window));

    const runners: ReactiveEffectRunner[] = [
        effectQueue.effect(() => {
            deliverPage(consumers.a, shownRecords(paged.value), 0, view.window);
        }),
        effectQueue.effect(() => {
            deliverPage(consumers.b, shownRecords(onAxis.value), 0, view.window);
        }),
    ];

    return {
        write: incoming => fileRows(byId, bucketOf, incoming, axisBucketOf),
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
            if (held !== undefined) moveRow(held, bucketOf, group, axisBucketOf);
        },
        setRank: (id, rank) => {
            const held = byId.get(id);
            if (held !== undefined) rerankRow(held, bucketOf, rank, axisBucketOf);
        },
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const held = byId.get(keys[from + i]);
                if (held !== undefined) found.push(shownOf(held, held.rank.value));
            }
            deliverPage(consumers.a, found, 0, count);
        },
        scrollTo: offset => {
            $offset.value = offset;
        },
        switchGroup: group => {
            $group.value = group;
            $offset.value = 0;
        },
        settle: effectQueue.flush,
        readAll: () => Array.from(byId.values(), rowOf),
        deliverableRows: () => undefined,
        groupOrder: group => groupOrderIn(byGroup, group),
        dispose: () => {
            stopAll(runners);
            effectQueue.clear();
            found.length = 0;
            byId.clear();
            byGroup.clear();
            byAxisGroup.clear();
        },
    };
};

const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    const byId = new Map<string, TRowRecord>();
    const effectQueue = createEffectQueue();
    const $ownerPopulation = shallowRef<readonly ShallowRef<TOwner>[]>([]);
    const ownerById = new Map<string, ShallowRef<TOwner>>();
    const pairByKey = new Map<string, ShallowRef<TPairRow>>();
    const $pairPopulation = shallowRef<readonly ShallowRef<TPairRow>[]>([]);

    let config: TRelationConfig = {
        ids: [],
        ranks: [],
        owners: [],
        touched: [],
        names: [],
        seeds: [],
    };
    const touchedRefs: ShallowRef<TOwner>[] = [];
    const rowOwnerRefs: ShallowRef<TOwner>[] = [];
    const pairRefs: ShallowRef<TPairRow>[] = [];
    const runners: ReactiveEffectRunner[] = [];
    const nameText: string[] = [];
    const markText: string[] = [];

    const pairKey = (owner: string, row: string): string => `${owner} ${row}`;

    return {
        write: incoming => writeRecords(byId, incoming),
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
            const grown = $ownerPopulation.value.slice();
            for (let i = 0; i < incoming.length; i++) {
                const owner = incoming[i];
                const created = shallowRef<TOwner>({
                    id: owner.id,
                    name: owner.name,
                });
                ownerById.set(owner.id, created);
                grown.push(created);
            }
            $ownerPopulation.value = grown;
        },
        holdRelation: given => {
            config = given;
            nameText.length = given.ids.length;
            markText.length = given.ids.length;
            for (let at = 0; at < given.touched.length; at++) {
                const held = ownerById.get(given.touched[at]);
                if (held !== undefined) touchedRefs.push(held);
            }
            const grown = $pairPopulation.value.slice();
            for (let i = 0; i < given.ids.length; i++) {
                const owner = given.owners[i];
                const row = given.ids[i];
                const ownerRef = ownerById.get(owner);
                if (ownerRef !== undefined) rowOwnerRefs.push(ownerRef);
                const created = shallowRef<TPairRow>({
                    owner,
                    row,
                    mark: given.seeds[i],
                });
                pairByKey.set(pairKey(owner, row), created);
                pairRefs.push(created);
                grown.push(created);
            }
            $pairPopulation.value = grown;
            runners.push(
                effectQueue.effect(() => {
                    for (let i = 0; i < rowOwnerRefs.length; i++) {
                        nameText[i] = rowOwnerRefs[i].value.name;
                    }
                    deliverRelation(consumers.a, config, nameText);
                })
            );
            runners.push(
                effectQueue.effect(() => {
                    for (let i = 0; i < pairRefs.length; i++) {
                        markText[i] = pairRefs[i].value.mark;
                    }
                    deliverRelation(consumers.b, config, markText);
                })
            );
        },
        patchOwnerName: (at, name) => {
            const held = touchedRefs[at];
            held.value.name = name;
            triggerRef(held);
        },
        writePair: (at, mark) => {
            const held = pairByKey.get(pairKey(config.owners[at], config.ids[at]));
            if (held === undefined) return;
            held.value.mark = mark;
            triggerRef(held);
        },
        settle: effectQueue.flush,
        readAll: () => Array.from(byId.values(), rowOf),
        deliverableRows: () => undefined,
        groupOrder: () => undefined,
        readOwners: () => {
            const population = $ownerPopulation.value;
            const out: TOwner[] = [];
            for (let i = 0; i < population.length; i++) out.push(population[i].value);
            return out;
        },
        readPairs: () => {
            const population = $pairPopulation.value;
            const out: TPairRow[] = [];
            for (let i = 0; i < population.length; i++) out.push(population[i].value);
            return out;
        },
        dispose: () => {
            stopAll(runners);
            effectQueue.clear();
            touchedRefs.length = 0;
            rowOwnerRefs.length = 0;
            pairRefs.length = 0;
            nameText.length = 0;
            markText.length = 0;
            byId.clear();
            ownerById.clear();
            pairByKey.clear();
        },
    };
};

const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
    const single = shallowRef('');
    const bystander = shallowRef('');
    const effectQueue = createEffectQueue();
    const runners: ReactiveEffectRunner[] = [];
    let name = '';
    let bystanderName = '';
    let read = '';
    let readBystander = '';
    let woke = false;
    let wokeBystander = false;

    return {
        ...noRowStore('vue-reactivity'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            single.value = config.seeds[0];
            bystander.value = config.seeds[1];
            let primed = false;
            runners.push(
                effectQueue.effect(() => {
                    read = single.value;
                    if (!primed) {
                        primed = true;
                        return;
                    }
                    woke = true;
                })
            );
            let primedBystander = false;
            runners.push(
                effectQueue.effect(() => {
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
            single.value = next;
        },
        readSingle: () => single.value,
        readBystander: () => bystander.value,
        frame,
        settle: () => {
            effectQueue.flush();
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
            stopAll(runners);
            effectQueue.clear();
        },
    };
};

export const vueReactivityAdapter: TAdapter = {
    name: 'vue-reactivity',
    version: '3.5.43',
    docs: 'https://vuejs.org/api/reactivity-advanced.html#shallowref',
    departure:
        '@vue/reactivity 3.5.43 exports no batch — startBatch/endBatch exist in the build but are not ' +
        'exported — so every `effect` is created with the `scheduler` option its declarations ' +
        '(`ReactiveEffectOptions.scheduler`) expose: a trigger only queues the effect, and `settle` ' +
        "runs each queued effect whose `dirty` is set, which is the queue @vue/runtime-core's scheduler " +
        'keeps and this package does not ship. `frame` therefore calls its function directly. A bucket ' +
        'is mutated in place and announced with the documented `triggerRef`; a removal of up to eight ' +
        'ids splices each out of its bucket, and a larger one compacts each touched bucket once for ' +
        'the whole call rather than per removed row.',
    admission:
        'every row is a @vue/reactivity `shallowRef` per mutable field (group, rank, label, note), and ' +
        'the id and group maps beside them hold handles to those refs rather than any value; the ' +
        "change signal is the ref's own dep trigger, which queues each subscribed effect through its " +
        '`scheduler` for `settle` to run.',

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
