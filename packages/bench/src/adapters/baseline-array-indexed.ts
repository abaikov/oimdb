import {
    deliver,
    deliverCells,
    deliverPage,
    orderedIdsOfRows,
    visibleInto,
    visibleOnAxisInto,
} from '../harness/render';
import type { TConsumers, TViewBinding } from '../harness/consumer';
import { noChurn, noRelations, noSingle, readShapes } from '../harness/types';
import type {
    TAdapter,
    TBinding,
    TCellConfig,
    TReadBinding,
    TViewConfig,
} from '../harness/types';
import { compareRows } from '../harness/dataset';
import type { TPlan, TRow } from '../harness/dataset';

// THE ANCHOR: no library, a group index, and no re-render a write cannot change. The rest:
// `baseline-array-indexed.md`.

const createBucketIndex = () => {
    const byGroup = new Map<string, TRow[]>();
    const positions = new Map<TRow, number>();
    const bucketOf = (group: string): TRow[] => {
        let held = byGroup.get(group);
        if (held === undefined) {
            held = [];
            byGroup.set(group, held);
        }
        return held;
    };
    return {
        bucketOf,
        join: (row: TRow): void => {
            const held = bucketOf(row.group);
            positions.set(row, held.length);
            held.push(row);
        },
        leave: (row: TRow): void => {
            const held = byGroup.get(row.group);
            const at = positions.get(row);
            if (held === undefined || at === undefined) return;
            const last = held.pop() as TRow;
            if (last !== row) {
                held[at] = last;
                positions.set(last, at);
            }
            positions.delete(row);
        },
        clear: (): void => {
            byGroup.clear();
            positions.clear();
        },
    };
};

const bindViews = (
    views: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    const byId = new Map<string, TRow>();
    // THE VIEWS THIS BINDING IS DRIVING, as a list it can DROP — a mutable copy,
    // because `dispose` has to empty it. The rest: `baseline-array-indexed.md`.
    const live = views.map(bound => ({
        group: bound.group,
        consumer: bound.consumer,
        // One reused buffer per view — `baseline-array`'s `state.visible`, kept here
        // for the same reason: the selection writes into it, so a delivery allocates
        // nothing on either anchor.
        visible: [] as TRow[],
    }));
    // THE INDEX: the rows of each group, together, in no particular order. The rest:
    // `baseline-array-indexed.md`.
    const bucketIndex = createBucketIndex();
    const { bucketOf, leave } = bucketIndex;
    const viewsByGroup = new Map<string, typeof live>();
    for (const bound of live) {
        const sharing = viewsByGroup.get(bound.group);
        if (sharing === undefined) viewsByGroup.set(bound.group, [bound]);
        else sharing.push(bound);
    }

    // Identical to `baseline-array`'s: the cell wiring has no group in it.
    const pinned: TRow[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };
    const labelText: string[] = [];
    const noteText: string[] = [];

    // Part of having the index, not a second variable: `baseline-array-indexed.md`.
    const dirtyGroups = new Set<string>();

    // `baseline-array`'s `renderViews`, with the group's bucket where it passes
    // `byId.values()`, over the views a write marked.
    const renderViews = (): void => {
        for (const group of dirtyGroups) {
            const sharing = viewsByGroup.get(group);
            if (sharing === undefined) continue;
            for (let i = 0; i < sharing.length; i++) {
                const bound = sharing[i];
                deliver(
                    bound.consumer,
                    visibleInto(bound.visible, bucketOf(group), group, view.window),
                    view.window
                );
            }
        }
    };

    let labelDirty = true;
    let noteDirty = true;

    const renderCells = (): void => {
        if (labelDirty) {
            for (let i = 0; i < pinned.length; i++) labelText[i] = pinned[i].label;
            deliverCells(live[0].consumer, cells, labelText);
        }
        if (noteDirty) {
            for (let i = 0; i < pinned.length; i++) noteText[i] = pinned[i].note;
            deliverCells(live[1].consumer, cells, noteText);
        }
        labelDirty = false;
        noteDirty = false;
    };

    let render = renderViews;

    const isShown = (row: TRow): boolean => {
        const sharing = viewsByGroup.get(row.group);
        if (sharing === undefined) return false;
        for (let i = 0; i < sharing.length; i++) if (sharing[i].visible.includes(row)) return true;
        return false;
    };

    const isEntering = (row: TRow): boolean => {
        const sharing = viewsByGroup.get(row.group);
        if (sharing === undefined) return false;
        for (let i = 0; i < sharing.length; i++) {
            const visible = sharing[i].visible;
            if (visible.length < view.window || compareRows(row, visible[visible.length - 1]) < 0) return true;
        }
        return false;
    };

    const markIfRendered = (row: TRow, isRendered: boolean): void => {
        if (isRendered || render === renderCells) dirtyGroups.add(row.group);
    };

    return {
        write: rows => {
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const held = byId.get(row.id);
                if (held === undefined) {
                    byId.set(row.id, row);
                    bucketIndex.join(row);
                    dirtyGroups.add(row.group);
                    continue;
                }
                if (held.group !== row.group) {
                    leave(held);
                    dirtyGroups.add(held.group);
                    held.group = row.group;
                    bucketIndex.join(held);
                }
                held.rank = row.rank;
                held.label = row.label;
                held.note = row.note;
                dirtyGroups.add(held.group);
            }
            labelDirty = true;
            noteDirty = true;
        },
        remove: ids => {
            for (let i = 0; i < ids.length; i++) {
                const held = byId.get(ids[i]);
                if (held === undefined) continue;
                leave(held);
                byId.delete(ids[i]);
                dirtyGroups.add(held.group);
            }
            labelDirty = true;
            noteDirty = true;
        },
        patchLabel: (id, label) => {
            const row = byId.get(id);
            if (row === undefined) return;
            row.label = label;
            labelDirty = true;
            markIfRendered(row, isShown(row));
        },
        patchNote: (id, note) => {
            const row = byId.get(id);
            if (row === undefined) return;
            row.note = note;
            noteDirty = true;
            markIfRendered(row, false);
        },
        // THE ONE WRITE THAT REACHES THE INDEX, and the place this row pays for having
        // one. The rest: `baseline-array-indexed.md`.
        setGroup: (id, group) => {
            const row = byId.get(id);
            if (row === undefined) return;
            markIfRendered(row, isShown(row));
            if (row.group !== group) {
                leave(row);
                row.group = group;
                bucketIndex.join(row);
                markIfRendered(row, isEntering(row));
            }
        },
        setRank: (id, rank) => {
            const row = byId.get(id);
            if (row === undefined) return;
            const wasShown = isShown(row);
            row.rank = rank;
            markIfRendered(row, wasShown || isEntering(row));
        },
        pin: config => {
            cells = config;
            pinned.length = 0;
            for (let i = 0; i < config.ids.length; i++) {
                const row = byId.get(config.ids[i]);
                if (row !== undefined) pinned.push(row);
            }
            labelText.length = pinned.length;
            noteText.length = pinned.length;
            for (const bound of live) bound.visible.length = 0;
            labelDirty = true;
            noteDirty = true;
            render = renderCells;
            // Untimed: the state every sample starts from.
            renderCells();
        },
        patchPinnedLabel: (at, label) => {
            const row = pinned[at];
            row.label = label;
            labelDirty = true;
            dirtyGroups.add(row.group);
        },
        patchPinnedNote: (at, note) => {
            const row = pinned[at];
            row.note = note;
            noteDirty = true;
            dirtyGroups.add(row.group);
        },
        frame: run => run(),
        settle: () => {
            if (dirtyGroups.size === 0) return;
            render();
            dirtyGroups.clear();
        },
        readAll: () => Array.from(byId.values()),
        deliverableRows: () => undefined,
        // THE BUCKET ITSELF, which is what makes this participant's grouping audit bite
        // where the other anchor's cannot: a bucket that lost a row or gained one it
        // should not hold parts from the reference model HERE and nowhere else. The
        // rest: `baseline-array-indexed.md`.
        groupOrder: group => orderedIdsOfRows([...bucketOf(group)]),
        /** `live.length = 0` IS THE TEARDOWN. See the note on `live`. */
        dispose: () => {
            byId.clear();
            bucketIndex.clear();
            viewsByGroup.clear();
            dirtyGroups.clear();
            for (const bound of live) bound.visible.length = 0;
            live.length = 0;
            pinned.length = 0;
            labelText.length = 0;
            noteText.length = 0;
        },
    };
};

// THE READ WIRING, and the index is the whole of what it changes. `baseline-array`'s
// read binding walks the POPULATION for top-(offset + window) and takes the page off
// the end. The rest: `baseline-array-indexed.md`.
const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const byId = new Map<string, TRow>();
    const bucketIndex = createBucketIndex();
    const { bucketOf, leave } = bucketIndex;
    // Reused buffers, so a delivery allocates nothing — the other anchor's three,
    // `paged` included: the page is selected into it rather than sliced out of the
    // bucket.
    const paged: TRow[] = [];
    const onAxis: TRow[] = [];
    const found: TRow[] = [];
    let offset = 0;
    let pagedGroup = view.groupA;
    let dirtyA = false;
    let dirtyB = false;

    const touch = (group: string): void => {
        if (group === pagedGroup) dirtyA = true;
        if (group === view.groupA) dirtyB = true;
    };

    const render = (): void => {
        if (dirtyA) {
            deliverPage(
                consumers.a,
                visibleInto(paged, bucketOf(pagedGroup), pagedGroup, offset + view.window),
                offset,
                view.window
            );
        }
        if (dirtyB) {
            deliverPage(
                consumers.b,
                visibleOnAxisInto(onAxis, bucketOf(view.groupA), view.groupA, view.window),
                0,
                view.window
            );
        }
    };

    return {
        write: rows => {
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const held = byId.get(row.id);
                if (held === undefined) {
                    byId.set(row.id, row);
                    bucketIndex.join(row);
                    touch(row.group);
                    continue;
                }
                if (held.group !== row.group) {
                    leave(held);
                    touch(held.group);
                    held.group = row.group;
                    bucketIndex.join(held);
                }
                held.rank = row.rank;
                held.label = row.label;
                held.note = row.note;
                touch(held.group);
            }
        },
        remove: ids => {
            for (let i = 0; i < ids.length; i++) {
                const held = byId.get(ids[i]);
                if (held === undefined) continue;
                leave(held);
                byId.delete(ids[i]);
                touch(held.group);
            }
        },
        patchLabel: (id, label) => {
            const row = byId.get(id);
            if (row === undefined) return;
            row.label = label;
            touch(row.group);
        },
        patchNote: (id, note) => {
            const row = byId.get(id);
            if (row === undefined) return;
            row.note = note;
            touch(row.group);
        },
        setGroup: (id, group) => {
            const row = byId.get(id);
            if (row === undefined) return;
            touch(row.group);
            if (row.group !== group) {
                leave(row);
                row.group = group;
                bucketIndex.join(row);
                touch(group);
            }
        },
        setRank: (id, rank) => {
            const row = byId.get(id);
            if (row === undefined) return;
            row.rank = rank;
            touch(row.group);
        },
        // No read script pins anything: the cell wiring belongs to the
        // targeted-delivery script, which is a two-view script bound by `bind`.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame: run => run(),
        // ONE MAP PROBE PER KEY — identical to the other anchor's, because a read by
        // key does not touch a group index. The rest: `baseline-array-indexed.md`.
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const row = byId.get(keys[from + i]);
                if (row !== undefined) found.push(row);
            }
            deliverPage(consumers.a, found, 0, count);
        },
        // One number, and only view A is marked: view B does not read the offset.
        scrollTo: to => {
            offset = to;
            dirtyA = true;
        },
        // The other group's bucket is already kept: a switch is a key and an offset.
        switchGroup: group => {
            pagedGroup = group;
            offset = 0;
            dirtyA = true;
        },
        settle: () => {
            if (!dirtyA && !dirtyB) return;
            render();
            dirtyA = false;
            dirtyB = false;
        },
        readAll: () => Array.from(byId.values()),
        deliverableRows: () => undefined,
        groupOrder: group => orderedIdsOfRows([...bucketOf(group)]),
        dispose: () => {
            byId.clear();
            bucketIndex.clear();
            paged.length = 0;
            onAxis.length = 0;
            found.length = 0;
        },
    };
};

export const baselineArrayIndexedAdapter: TAdapter = {
    name: 'baseline-indexed',
    version: '0',
    docs: 'no library — a Map, a per-group bucket, and a re-derive per settle of each bucket whose window a write can change',
    departure:
        'no library and no documented recipe: this row\'s storage model is the suite\'s own invention ' +
        '— a row bucket per group, kept up to date on write, ORDER MAINTAINED NOWHERE: a render ' +
        'selects its window out of the bucket with the same top-k the other anchor runs over the ' +
        'population. A point write marks a bucket only when its window can change — a note write never ' +
        '(no window renders it), a label write only for an entity on screen, a rank or group write only ' +
        'for an entity on screen or entering it — and a settle re-derives those buckets alone; the read binding marks view A and view B separately ' +
        '(a scroll or a switch marks A alone). A bucket is left in O(1) by swapping its last row into the ' +
        'vacated position. Nothing here is cited from anywhere.',
    admission:
        'no library, and it is not a library claim: the harness owns the Map, the buckets and the ' +
        'change signal. It is the ANCHOR every ratio is divided by wherever it takes part — the ' +
        'competent hand-written arm — and its gap to `baseline-array` is the price of a group index ' +
        'plus the re-renders it skips for writes nothing on screen depends on.',

    bind: (consumers, view) =>
        bindViews(
            [
                { group: view.groupA, consumer: consumers.a },
                { group: view.groupB, consumer: consumers.b },
            ],
            view
        ),
    // THE SAME BODY, HANDED FIFTY VIEWS INSTEAD OF TWO — and this is the row where the
    // two anchors are furthest apart: the other one selects its window out of the whole
    // population once per view, so fifty times, and this one runs the same selection
    // over the bucket of each view a write touched — one, for a single-row rank move.
    bindPerGroup: (consumers, view) => bindViews(consumers.views, view),
    churn: noChurn(
        'a churn binding derives NO VIEW — nothing is subscribed until a script says so, and there ' +
        'is no window and no group in it anywhere. The group index this participant exists to price ' +
        'therefore does not exist in that wiring, and a churn row here would be `baseline-array`\'s ' +
        'code registered under a second name: the same Map, the same subscriber arrays, the same ' +
        'indexOf and splice. Two identical rows read as two answers, so there is one.'
    ),
    // SUPPLIED rather than declined because a read binding DOES derive views — a window
    // at a moving offset and a window through two predicates — so the index is exactly
    // what is in question there.
    reads: readShapes((consumers, view, plan) =>
        bindReadStore(consumers, view, plan)
    ),
    relations: noRelations(
        'a relation binding derives NO VIEW — there is no window, no group and no sort in it ' +
        'anywhere, because what those two rows measure is a JOIN and a COMPOSITE KEY and a window ' +
        'derivation in front of either would be a constant sitting on both. The group index this ' +
        'participant exists to price therefore does not exist in that wiring, and a relation row ' +
        'here would be `baseline-array`\'s code registered under a second name: the same maps, the ' +
        'same joined-string pair key, the same dirty flag. Two identical rows read as two answers, ' +
        'so there is one.'
    ),
    single: noSingle(
        'a single-value binding holds ONE VALUE and a second beside it — no rows, no keys, no ' +
        'groups and no window anywhere in it. The group index this participant exists to price is ' +
        'not merely unused there, it is not expressible: there is nothing to group. A single-value ' +
        'row here would be `baseline-array`\'s code registered under a second name — the same two ' +
        'variables, the same two callbacks, the same dirty flag — and the `indexed − lean` line ' +
        'the report prints under a table both anchors appear in would be a reading of process ' +
        'noise presented as the price of an index. Two identical rows read as two answers, so ' +
        'there is one.'
    ),
};
