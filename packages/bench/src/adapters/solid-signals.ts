// @ts-expect-error solid-js ships no declarations beside dist/solid.js; its index.d.ts types it below
import * as solidReactiveBuild from 'solid-js/dist/solid.js';
import type * as SolidApi from 'solid-js';
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

// Why the build is imported by path, and every other choice here: `solid-signals.md`.
const solid: typeof SolidApi = solidReactiveBuild;
const { batch, createEffect, createMemo, createRoot, createSignal } = solid;

type TRowSignal = {
    readonly id: string;
    readonly group: SolidApi.Signal<string>;
    readonly rank: SolidApi.Signal<number>;
    readonly label: SolidApi.Signal<string>;
    readonly note: SolidApi.Signal<string>;
};
type TBucketSignal = SolidApi.Signal<TRowSignal[]>;

const recordOf = (row: TRow): TRowSignal => ({
    id: row.id,
    group: createSignal(row.group),
    rank: createSignal(row.rank),
    label: createSignal(row.label),
    note: createSignal(row.note),
});

const assign = (record: TRowSignal, row: TRow): void => {
    record.group[1](row.group);
    record.rank[1](row.rank);
    record.label[1](row.label);
    record.note[1](row.note);
};

const rowOf = (record: TRowSignal): TRow => ({
    id: record.id,
    group: record.group[0](),
    rank: record.rank[0](),
    label: record.label[0](),
    note: record.note[0](),
});

const shownOf = (record: TRowSignal, rank: number): TRow => ({
    id: record.id,
    group: '',
    rank,
    label: record.label[0](),
    note: '',
});

const shownRecords = (records: readonly TRowSignal[]): TRow[] => {
    const out: TRow[] = new Array(records.length);
    for (let i = 0; i < records.length; i++) {
        out[i] = shownOf(records[i], records[i].rank[0]());
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
        const otherRank = other.rank[0]();
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

const frame = (run: () => void): void => {
    batch(run);
};

const bucketOfIn =
    (byGroup: Map<string, TBucketSignal>) =>
    (group: string): TBucketSignal => {
        let bucket = byGroup.get(group);
        if (bucket === undefined) {
            bucket = createSignal<TRowSignal[]>([], { equals: false });
            byGroup.set(group, bucket);
        }
        return bucket;
    };

const announce = (bucket: TBucketSignal): void => {
    bucket[1](bucket[0]());
};

const groupOrderIn = (
    byGroup: Map<string, TBucketSignal>,
    group: string
): readonly string[] => {
    const bucket = byGroup.get(group);
    if (bucket === undefined) return [];
    const records = bucket[0]();
    const held: TRow[] = new Array(records.length);
    for (let i = 0; i < records.length; i++) held[i] = rowOf(records[i]);
    return orderedIdsOfRows(held);
};

const SPLICE_REMOVAL_LIMIT = 8;

type TBucketOf = (group: string) => TBucketSignal;

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
    batch(() => {
        let touched: Set<TBucketSignal> | undefined;
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
                spliceIn(joined[0](), created, row.rank);
                (touched ??= new Set()).add(joined);
                if (axisOf !== undefined) {
                    const axisJoined = axisOf(row.group);
                    spliceIn(axisJoined[0](), created, row.rank);
                    touched.add(axisJoined);
                }
                continue;
            }
            const storedGroup = held.group[0]();
            const storedRank = held.rank[0]();
            if (storedGroup === row.group && storedRank === row.rank) {
                assign(held, row);
                continue;
            }
            const left = bucketOf(storedGroup);
            spliceOut(left[0](), held, storedRank);
            const joined = bucketOf(row.group);
            spliceIn(joined[0](), held, row.rank);
            (touched ??= new Set()).add(left).add(joined);
            if (axisOf !== undefined) {
                const axisLeft = axisOf(storedGroup);
                spliceOut(axisLeft[0](), held, storedRank);
                const axisJoined = axisOf(row.group);
                spliceIn(axisJoined[0](), held, row.rank);
                touched.add(axisLeft).add(axisJoined);
            }
            assign(held, row);
        }
        if (touched !== undefined) touched.forEach(announce);
    });
};

const unfileFew = (
    byId: Map<string, TRowSignal>,
    bucketOf: TBucketOf,
    ids: readonly string[],
    axisBucketOf: TBucketOf | undefined
): void => {
    batch(() => {
        for (let i = 0; i < ids.length; i++) {
            const held = byId.get(ids[i]);
            if (held === undefined) continue;
            byId.delete(ids[i]);
            const group = held.group[0]();
            const rank = held.rank[0]();
            const left = bucketOf(group);
            spliceOut(left[0](), held, rank);
            announce(left);
            if (axisBucketOf !== undefined && onSecondAxis(held.id)) {
                const axisLeft = axisBucketOf(group);
                spliceOut(axisLeft[0](), held, rank);
                announce(axisLeft);
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
    batch(() => {
        const leaving = new Set<TRowSignal>();
        const touched = new Set<TBucketSignal>();
        for (let i = 0; i < ids.length; i++) {
            const held = byId.get(ids[i]);
            if (held === undefined) continue;
            byId.delete(ids[i]);
            leaving.add(held);
            const group = held.group[0]();
            touched.add(bucketOf(group));
            if (axisBucketOf !== undefined && onSecondAxis(held.id)) {
                touched.add(axisBucketOf(group));
            }
        }
        for (const bucket of touched) {
            const rows = bucket[0]();
            let kept = 0;
            for (let i = 0; i < rows.length; i++) {
                if (!leaving.has(rows[i])) rows[kept++] = rows[i];
            }
            rows.length = kept;
            announce(bucket);
        }
    });
};

const moveRow = (
    held: TRowSignal,
    bucketOf: TBucketOf,
    group: string,
    axisBucketOf?: TBucketOf
): void => {
    const from = held.group[0]();
    const rank = held.rank[0]();
    const left = bucketOf(from);
    batch(() => {
        held.group[1](group);
        spliceOut(left[0](), held, rank);
        const joined = bucketOf(group);
        spliceIn(joined[0](), held, rank);
        announce(left);
        announce(joined);
        if (axisBucketOf === undefined || !onSecondAxis(held.id)) return;
        const axisLeft = axisBucketOf(from);
        spliceOut(axisLeft[0](), held, rank);
        const axisJoined = axisBucketOf(group);
        spliceIn(axisJoined[0](), held, rank);
        announce(axisLeft);
        announce(axisJoined);
    });
};

const rerankRow = (
    held: TRowSignal,
    bucketOf: TBucketOf,
    rank: number,
    axisBucketOf?: TBucketOf
): void => {
    const from = held.rank[0]();
    if (from === rank) return;
    const group = held.group[0]();
    const bucket = bucketOf(group);
    batch(() => {
        spliceOut(bucket[0](), held, from);
        spliceIn(bucket[0](), held, rank);
        announce(bucket);
        if (axisBucketOf !== undefined && onSecondAxis(held.id)) {
            const axisBucket = axisBucketOf(group);
            spliceOut(axisBucket[0](), held, from);
            spliceIn(axisBucket[0](), held, rank);
            announce(axisBucket);
        }
        held.rank[1](rank);
    });
};

const bindViews = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    const byId = new Map<string, TRowSignal>();
    const byGroup = new Map<string, TBucketSignal>();
    const bucketOf = bucketOfIn(byGroup);

    let disposeWindows: (() => void) | undefined = createRoot(dispose => {
        for (const bound of bindings) {
            const top = createMemo(() => bucketOf(bound.group)[0]().slice(0, view.window));
            createEffect(() => {
                deliver(bound.consumer, shownRecords(top()), view.window);
            });
        }
        return dispose;
    });

    const pinned: TRowSignal[] = [];
    let disposeCells: (() => void) | undefined;
    let cells: TCellConfig = { ids: [], ranks: [] };
    const labelText: string[] = [];
    const noteText: string[] = [];
    const labelConsumer = bindings[0].consumer;
    const noteConsumer = bindings[1].consumer;

    return {
        write: incoming => fileRows(byId, bucketOf, incoming),
        remove: ids => unfileRows(byId, bucketOf, ids),
        patchLabel: (id, label) => {
            byId.get(id)?.label[1](label);
        },
        patchNote: (id, note) => {
            byId.get(id)?.note[1](note);
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
            disposeWindows?.();
            disposeWindows = undefined;
            disposeCells?.();
            cells = config;
            pinned.length = 0;
            disposeCells = createRoot(dispose => {
                for (let i = 0; i < config.ids.length; i++) {
                    const held = byId.get(config.ids[i]);
                    if (held === undefined) continue;
                    pinned.push(held);
                }
                labelText.length = pinned.length;
                noteText.length = pinned.length;
                createEffect(() => {
                    for (let i = 0; i < pinned.length; i++) {
                        labelText[i] = pinned[i].label[0]();
                    }
                    deliverCells(labelConsumer, cells, labelText);
                });
                createEffect(() => {
                    for (let i = 0; i < pinned.length; i++) {
                        noteText[i] = pinned[i].note[0]();
                    }
                    deliverCells(noteConsumer, cells, noteText);
                });
                return dispose;
            });
        },
        patchPinnedLabel: (at, label) => {
            pinned[at].label[1](label);
        },
        patchPinnedNote: (at, note) => {
            pinned[at].note[1](note);
        },
        frame,
        settle: () => undefined,
        readAll: () => Array.from(byId.values(), rowOf),
        deliverableRows: () => undefined,
        groupOrder: group => groupOrderIn(byGroup, group),
        dispose: () => {
            disposeWindows?.();
            disposeWindows = undefined;
            disposeCells?.();
            disposeCells = undefined;
            pinned.length = 0;
            byId.clear();
            byGroup.clear();
        },
    };
};

const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    const byId = new Map<string, TRowSignal>();

    const churnSignals: TRowSignal[] = [];
    const churnRead: (string | undefined)[] = [];
    const stop: ((() => void) | undefined)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    const subscribe = (
        at: number,
        derive: () => SolidApi.Accessor<string>
    ): (() => void) =>
        createRoot(dispose => {
            const read = derive();
            let primed = false;
            createEffect(() => {
                churnRead[at] = read();
                if (!primed) {
                    primed = true;
                    return;
                }
                churnWoke++;
            });
            return dispose;
        });

    const labelOfWholeRow = (record: TRowSignal): string => {
        record.group[0]();
        record.rank[0]();
        record.note[0]();
        return record.label[0]();
    };

    const labelOfRange = (from: number, count: number): string => {
        let text = '';
        for (let i = from + count - 1; i >= from; i--) {
            text = labelOfWholeRow(churnSignals[i]);
        }
        return text;
    };

    const joinedLabelOfRange = (from: number, count: number): string => {
        let text = churnSignals[from].label[0]();
        for (let i = from + 1; i < from + count; i++) {
            text = `${text},${churnSignals[i].label[0]()}`;
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
            byId.get(id)?.label[1](label);
        },
        patchNote: (id, note) => {
            byId.get(id)?.note[1](note);
        },
        setGroup: (id, group) => {
            byId.get(id)?.group[1](group);
        },
        setRank: (id, rank) => {
            byId.get(id)?.rank[1](rank);
        },
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
        readAll: () => Array.from(byId.values(), rowOf),
        deliverableRows: () => undefined,
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
            stop[at] =
                count === 1
                    ? subscribe(at, () => () => labelOfWholeRow(churnSignals[from]))
                    : subscribe(at, () => () => labelOfRange(from, count));
        },
        mountOnColumn: at => {
            stop[at] = subscribe(at, () => churnSignals[0].label[0]);
        },
        mountOnChain: (at, from, count, depth) => {
            stop[at] = subscribe(at, () => {
                let below = createMemo(() =>
                    chainLevelOf(joinedLabelOfRange(from, count), 1)
                );
                for (let level = 2; level <= depth; level++) {
                    const under = below;
                    below = createMemo(() => chainLevelOf(under(), level));
                }
                return below;
            });
        },
        mountOnDiamond: (at, from) => {
            const [rootLabel] = churnSignals[from].label;
            stop[at] = subscribe(at, () => {
                const left = createMemo(() => diamondLeftOf(rootLabel()));
                const right = createMemo(() => diamondRightOf(rootLabel()));
                return createMemo(() => diamondJoinOf(left(), right()));
            });
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

const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const byId = new Map<string, TRowSignal>();
    const byGroup = new Map<string, TBucketSignal>();
    const byAxisGroup = new Map<string, TBucketSignal>();
    const [viewOffset, setViewOffset] = createSignal(0);
    const [viewGroup, setViewGroup] = createSignal(view.groupA);
    const found: TRow[] = [];
    const bucketOf = bucketOfIn(byGroup);
    const axisBucketOf = bucketOfIn(byAxisGroup);

    const disposeViews = createRoot(dispose => {
        const paged = createMemo(() => {
            const offset = viewOffset();
            return bucketOf(viewGroup())[0]().slice(offset, offset + view.window);
        });
        const onAxis = createMemo(() =>
            axisBucketOf(view.groupA)[0]().slice(0, view.window)
        );
        createEffect(() => {
            deliverPage(consumers.a, shownRecords(paged()), 0, view.window);
        });
        createEffect(() => {
            deliverPage(consumers.b, shownRecords(onAxis()), 0, view.window);
        });
        return dispose;
    });

    return {
        write: incoming => fileRows(byId, bucketOf, incoming, axisBucketOf),
        remove: ids => unfileRows(byId, bucketOf, ids, axisBucketOf),
        patchLabel: (id, label) => {
            byId.get(id)?.label[1](label);
        },
        patchNote: (id, note) => {
            byId.get(id)?.note[1](note);
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
                if (held !== undefined) found.push(shownOf(held, held.rank[0]()));
            }
            deliverPage(consumers.a, found, 0, count);
        },
        scrollTo: to => {
            setViewOffset(to);
        },
        switchGroup: group => {
            batch(() => {
                setViewGroup(group);
                setViewOffset(0);
            });
        },
        settle: () => undefined,
        readAll: () => Array.from(byId.values(), rowOf),
        deliverableRows: () => undefined,
        groupOrder: group => groupOrderIn(byGroup, group),
        dispose: () => {
            disposeViews();
            found.length = 0;
            byId.clear();
            byGroup.clear();
            byAxisGroup.clear();
        },
    };
};

const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    const byId = new Map<string, TRowSignal>();
    const [ownerPopulation, setOwnerPopulation] = createSignal<
        readonly SolidApi.Signal<TOwner>[]
    >([]);
    const ownerById = new Map<string, SolidApi.Signal<TOwner>>();
    const pairByKey = new Map<string, SolidApi.Signal<TPairRow>>();
    const [pairPopulation, setPairPopulation] = createSignal<
        readonly SolidApi.Signal<TPairRow>[]
    >([]);

    let config: TRelationConfig = {
        ids: [],
        ranks: [],
        owners: [],
        touched: [],
        names: [],
        seeds: [],
    };
    const touchedSignals: SolidApi.Signal<TOwner>[] = [];
    const rowOwnerSignals: SolidApi.Signal<TOwner>[] = [];
    const pairSignals: SolidApi.Signal<TPairRow>[] = [];
    let disposeViews: (() => void) | undefined;
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
            byId.get(id)?.label[1](label);
        },
        patchNote: (id, note) => {
            byId.get(id)?.note[1](note);
        },
        setGroup: (id, group) => {
            byId.get(id)?.group[1](group);
        },
        setRank: (id, rank) => {
            byId.get(id)?.rank[1](rank);
        },
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame,
        writeOwners: incoming => {
            const grown = ownerPopulation().slice();
            for (let i = 0; i < incoming.length; i++) {
                const owner = incoming[i];
                const created = createSignal<TOwner>(
                    {
                        id: owner.id,
                        name: owner.name,
                    },
                    { equals: false },
                );
                ownerById.set(owner.id, created);
                grown.push(created);
            }
            setOwnerPopulation(grown);
        },
        holdRelation: given => {
            config = given;
            nameText.length = given.ids.length;
            markText.length = given.ids.length;
            for (let at = 0; at < given.touched.length; at++) {
                const held = ownerById.get(given.touched[at]);
                if (held !== undefined) touchedSignals.push(held);
            }
            const grown = pairPopulation().slice();
            for (let i = 0; i < given.ids.length; i++) {
                const owner = given.owners[i];
                const row = given.ids[i];
                const ownerSignal = ownerById.get(owner);
                if (ownerSignal !== undefined) rowOwnerSignals.push(ownerSignal);
                const created = createSignal<TPairRow>(
                    {
                        owner,
                        row,
                        mark: given.seeds[i],
                    },
                    { equals: false },
                );
                pairByKey.set(pairKey(owner, row), created);
                pairSignals.push(created);
                grown.push(created);
            }
            setPairPopulation(grown);
            disposeViews = createRoot(dispose => {
                createEffect(() => {
                    for (let i = 0; i < rowOwnerSignals.length; i++) {
                        nameText[i] = rowOwnerSignals[i][0]().name;
                    }
                    deliverRelation(consumers.a, config, nameText);
                });
                createEffect(() => {
                    for (let i = 0; i < pairSignals.length; i++) {
                        markText[i] = pairSignals[i][0]().mark;
                    }
                    deliverRelation(consumers.b, config, markText);
                });
                return dispose;
            });
        },
        patchOwnerName: (at, name) => {
            const held = touchedSignals[at];
            const owner = held[0]();
            owner.name = name;
            held[1](owner);
        },
        writePair: (at, mark) => {
            const held = pairByKey.get(pairKey(config.owners[at], config.ids[at]));
            if (held === undefined) return;
            const pair = held[0]();
            pair.mark = mark;
            held[1](pair);
        },
        settle: () => undefined,
        readAll: () => Array.from(byId.values(), rowOf),
        deliverableRows: () => undefined,
        groupOrder: () => undefined,
        readOwners: () => ownerPopulation().map(([owner]) => owner()),
        readPairs: () => pairPopulation().map(([pair]) => pair()),
        dispose: () => {
            disposeViews?.();
            disposeViews = undefined;
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

const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
    const [value, setValue] = createSignal('');
    const [bystander, setBystander] = createSignal('');
    let disposeEffects: (() => void) | undefined;
    let name = '';
    let bystanderName = '';
    let read = '';
    let readBystander = '';
    let woke = false;
    let wokeBystander = false;

    return {
        ...noRowStore('solid-js'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            setValue(config.seeds[0]);
            setBystander(config.seeds[1]);
            disposeEffects = createRoot(dispose => {
                let primed = false;
                createEffect(() => {
                    read = value();
                    if (!primed) {
                        primed = true;
                        return;
                    }
                    woke = true;
                });
                let primedBystander = false;
                createEffect(() => {
                    readBystander = bystander();
                    if (!primedBystander) {
                        primedBystander = true;
                        return;
                    }
                    wokeBystander = true;
                });
                return dispose;
            });
            woke = false;
            wokeBystander = false;
            deliverSingle(consumers.a, name, read);
            deliverSingle(consumers.b, bystanderName, readBystander);
        },
        writeSingle: next => {
            setValue(next);
        },
        readSingle: () => value(),
        readBystander: () => bystander(),
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
            disposeEffects?.();
            disposeEffects = undefined;
        },
    };
};

export const solidSignalsAdapter: TAdapter = {
    name: 'solid-js',
    version: '1.9.15',
    docs: 'https://docs.solidjs.com/reference/reactive-utilities/batch',
    departure:
        'the reactive core is imported as `solid-js/dist/solid.js` and not as `solid-js`: the worker ' +
        'runs under node without the "browser" condition, where `solid-js` resolves to dist/server.js, ' +
        'whose createEffect is an empty function and whose signals track nothing. `solid-js/store` is not ' +
        "used for the same reason: store/dist/store.js imports the bare `solid-js` (line 1), so under node " +
        "its proxies would read the server build's untracked signals. A bucket signal is created " +
        'with `equals: false`, mutated in place and set to the same array to notify; a removal of up ' +
        'to eight ids splices each out of its bucket, and a larger one compacts each touched bucket ' +
        'once for the whole batch rather than per removed row.',
    admission:
        'every row is a solid-js `createSignal` per mutable field (group, rank, label, note), and the ' +
        'id and group maps beside them ' +
        'hold the [get, set] pairs of those signals rather than any value; the change signal is ' +
        "solid's own `createEffect`, run when the outermost update returns.",

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
