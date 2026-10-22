import { createAtom, createStore, shallowEqual } from '@xstate/store';
import type { Readable, Subscription, TriggerObject } from '@xstate/store';
import type { BenchConsumer, TConsumers, TViewBinding } from '../harness/consumer';
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

const runDirectly = (run: () => void): void => {
    run();
};

type TRows = Record<string, TRow>;
type TGroupIds = Partial<Record<string, readonly string[]>>;
type TEntitiesContext = { rows: TRows };
type TRowsContext = TEntitiesContext & { idsByGroup: TGroupIds };
type TRowEvent =
    | { type: 'write'; rows: readonly TRow[] }
    | { type: 'remove'; ids: readonly string[] }
    | { type: 'patchLabel'; id: string; label: string }
    | { type: 'patchNote'; id: string; note: string }
    | { type: 'setGroup'; id: string; group: string }
    | { type: 'setRank'; id: string; rank: number };
type TFramedEvent = { type: 'framed'; events: readonly TRowEvent[] };
type TRowPayloads = {
    write: { rows: readonly TRow[] };
    remove: { ids: readonly string[] };
    patchLabel: { id: string; label: string };
    patchNote: { id: string; note: string };
    setGroup: { id: string; group: string };
    setRank: { id: string; rank: number };
    framed: { events: readonly TRowEvent[] };
};

const framed = (
    _context: unknown,
    event: { events: readonly TRowEvent[] },
    enqueue: { trigger: TriggerObject<TRowPayloads> }
): undefined => {
    const trigger = enqueue.trigger;
    for (let i = 0; i < event.events.length; i++) {
        const rowEvent = event.events[i];
        if (rowEvent.type === 'write') trigger.write(rowEvent);
        else if (rowEvent.type === 'remove') trigger.remove(rowEvent);
        else if (rowEvent.type === 'patchLabel') trigger.patchLabel(rowEvent);
        else if (rowEvent.type === 'patchNote') trigger.patchNote(rowEvent);
        else if (rowEvent.type === 'setGroup') trigger.setGroup(rowEvent);
        else trigger.setRank(rowEvent);
    }
    return undefined;
};

const held = (rows: TRows, id: string): TRow | undefined => rows[id];

const draftBucket = (
    drafts: Map<string, string[]>,
    idsByGroup: TGroupIds,
    group: string
): string[] => {
    let draft = drafts.get(group);
    if (draft === undefined) {
        draft = idsByGroup[group]?.slice() ?? [];
        drafts.set(group, draft);
    }
    return draft;
};

const takeOut = (bucket: string[], id: string): void => {
    const at = bucket.indexOf(id);
    if (at >= 0) bucket.splice(at, 1);
};

const withDrafts = (idsByGroup: TGroupIds, drafts: Map<string, string[]>): TGroupIds => {
    if (drafts.size === 0) return idsByGroup;
    const next: TGroupIds = { ...idsByGroup };
    for (const [group, ids] of drafts) next[group] = ids;
    return next;
};

const rowReplaced = <TContext extends TEntitiesContext>(
    context: TContext,
    id: string,
    patch: (stored: TRow) => TRow
): TContext | undefined => {
    const stored = held(context.rows, id);
    if (stored === undefined) return undefined;
    return { ...context, rows: { ...context.rows, [id]: patch(stored) } };
};

const createRowsStore = () =>
    createStore({
        context: { rows: {}, idsByGroup: {} } as TRowsContext,
        on: {
            write: (context: TRowsContext, event: { rows: readonly TRow[] }) => {
                const rows: TRows = { ...context.rows };
                const drafts = new Map<string, string[]>();
                const incoming = event.rows;
                for (let i = 0; i < incoming.length; i++) {
                    const row = incoming[i];
                    const stored = held(rows, row.id);
                    rows[row.id] = { ...row };
                    if (stored === undefined) {
                        draftBucket(drafts, context.idsByGroup, row.group).push(row.id);
                    } else if (stored.group !== row.group) {
                        takeOut(draftBucket(drafts, context.idsByGroup, stored.group), row.id);
                        draftBucket(drafts, context.idsByGroup, row.group).push(row.id);
                    }
                }
                return { rows, idsByGroup: withDrafts(context.idsByGroup, drafts) };
            },
            remove: (context: TRowsContext, event: { ids: readonly string[] }) => {
                let rows: TRows | undefined;
                const drafts = new Map<string, string[]>();
                const ids = event.ids;
                for (let i = 0; i < ids.length; i++) {
                    const id = ids[i];
                    const stored = held(rows ?? context.rows, id);
                    if (stored === undefined) continue;
                    rows ??= { ...context.rows };
                    delete rows[id];
                    takeOut(draftBucket(drafts, context.idsByGroup, stored.group), id);
                }
                if (rows === undefined) return undefined;
                return { rows, idsByGroup: withDrafts(context.idsByGroup, drafts) };
            },
            patchLabel: (context: TRowsContext, event: { id: string; label: string }) =>
                rowReplaced(context, event.id, stored => ({ ...stored, label: event.label })),
            patchNote: (context: TRowsContext, event: { id: string; note: string }) =>
                rowReplaced(context, event.id, stored => ({ ...stored, note: event.note })),
            setGroup: (context: TRowsContext, event: { id: string; group: string }) => {
                const stored = held(context.rows, event.id);
                if (stored === undefined) return undefined;
                const rows = { ...context.rows, [event.id]: { ...stored, group: event.group } };
                if (stored.group === event.group) return { ...context, rows };
                const drafts = new Map<string, string[]>();
                takeOut(draftBucket(drafts, context.idsByGroup, stored.group), event.id);
                draftBucket(drafts, context.idsByGroup, event.group).push(event.id);
                return { rows, idsByGroup: withDrafts(context.idsByGroup, drafts) };
            },
            setRank: (context: TRowsContext, event: { id: string; rank: number }) =>
                rowReplaced(context, event.id, stored => ({ ...stored, rank: event.rank })),
            framed,
        },
    });

const createEntitiesStore = () =>
    createStore({
        context: { rows: {} } as TEntitiesContext,
        on: {
            write: (context: TEntitiesContext, event: { rows: readonly TRow[] }) => {
                const rows: TRows = { ...context.rows };
                for (let i = 0; i < event.rows.length; i++) rows[event.rows[i].id] = { ...event.rows[i] };
                return { rows };
            },
            remove: (context: TEntitiesContext, event: { ids: readonly string[] }) => {
                let rows: TRows | undefined;
                for (let i = 0; i < event.ids.length; i++) {
                    if (held(rows ?? context.rows, event.ids[i]) === undefined) continue;
                    rows ??= { ...context.rows };
                    delete rows[event.ids[i]];
                }
                return rows === undefined ? undefined : { rows };
            },
            patchLabel: (context: TEntitiesContext, event: { id: string; label: string }) =>
                rowReplaced(context, event.id, stored => ({ ...stored, label: event.label })),
            patchNote: (context: TEntitiesContext, event: { id: string; note: string }) =>
                rowReplaced(context, event.id, stored => ({ ...stored, note: event.note })),
            setGroup: (context: TEntitiesContext, event: { id: string; group: string }) =>
                rowReplaced(context, event.id, stored => ({ ...stored, group: event.group })),
            setRank: (context: TEntitiesContext, event: { id: string; rank: number }) =>
                rowReplaced(context, event.id, stored => ({ ...stored, rank: event.rank })),
            framed,
        },
    });

const rowWritesOf = (
    send: (event: TRowEvent | TFramedEvent) => void
): Pick<TBinding, 'write' | 'remove' | 'patchLabel' | 'patchNote' | 'setGroup' | 'setRank' | 'frame'> => {
    let framedEvents: TRowEvent[] | undefined;
    const emit = (event: TRowEvent): void => {
        if (framedEvents === undefined) send(event);
        else framedEvents.push(event);
    };
    return {
        write: rows => emit({ type: 'write', rows }),
        remove: ids => emit({ type: 'remove', ids }),
        patchLabel: (id, label) => emit({ type: 'patchLabel', id, label }),
        patchNote: (id, note) => emit({ type: 'patchNote', id, note }),
        setGroup: (id, group) => emit({ type: 'setGroup', id, group }),
        setRank: (id, rank) => emit({ type: 'setRank', id, rank }),
        frame: run => {
            if (framedEvents !== undefined) {
                run();
                return;
            }
            const events: TRowEvent[] = [];
            framedEvents = events;
            run();
            framedEvents = undefined;
            if (events.length > 0) send({ type: 'framed', events });
        },
    };
};

const groupOrderOf = (context: TRowsContext, group: string): readonly string[] =>
    orderedIdsOfRows((context.idsByGroup[group] ?? []).map(id => context.rows[id]));

const selectionOf = (
    rows: TRows,
    ids: readonly string[] | undefined,
    limit: number,
    axis: boolean
): TRow[] => {
    const out: TRow[] = [];
    if (ids === undefined) return out;
    let count = 0;
    for (let i = 0; i < ids.length; i++) {
        const row = rows[ids[i]];
        if (axis && !onSecondAxis(row.id)) continue;
        if (count >= limit) {
            if (compareRows(row, out[count - 1]) >= 0) continue;
        } else count++;
        let at = count - 1;
        while (at > 0 && compareRows(out[at - 1], row) > 0) {
            out[at] = out[at - 1];
            at--;
        }
        out[at] = row;
    }
    return out;
};

const bindViews = (bindings: readonly TViewBinding[], view: TViewConfig): TBinding => {
    const store = createRowsStore();
    const windows: Subscription[] = bindings.map(bound =>
        store
            .select(
                context =>
                    selectionOf(context.rows, context.idsByGroup[bound.group], view.window, false),
                shallowEqual
            )
            .subscribe(visible => deliver(bound.consumer, visible, view.window))
    );

    let cells: TCellConfig = { ids: [], ranks: [] };
    const cellStop: Subscription[] = [];

    return {
        ...rowWritesOf(event => store.send(event)),
        readAll: () => Object.values(store.getSnapshot().context.rows),
        deliverableRows: () => undefined,
        groupOrder: group => groupOrderOf(store.getSnapshot().context, group),
        pin: config => {
            for (let i = 0; i < windows.length; i++) windows[i].unsubscribe();
            windows.length = 0;
            cells = config;
            const labels = store.select(
                context => cells.ids.map(id => context.rows[id].label),
                shallowEqual
            );
            const notes = store.select(
                context => cells.ids.map(id => context.rows[id].note),
                shallowEqual
            );
            cellStop.push(labels.subscribe(text => deliverCells(bindings[0].consumer, cells, text)));
            cellStop.push(notes.subscribe(text => deliverCells(bindings[1].consumer, cells, text)));
            deliverCells(bindings[0].consumer, cells, labels.get());
            deliverCells(bindings[1].consumer, cells, notes.get());
        },
        patchPinnedLabel: (at, label) => store.send({ type: 'patchLabel', id: cells.ids[at], label }),
        patchPinnedNote: (at, note) => store.send({ type: 'patchNote', id: cells.ids[at], note }),
        settle: () => undefined,
        dispose: () => {
            for (let i = 0; i < windows.length; i++) windows[i].unsubscribe();
            for (let i = 0; i < cellStop.length; i++) cellStop[i].unsubscribe();
        },
    };
};

const labelOf = (row: TRow | undefined): string => (row === undefined ? '' : row.label);

const asText = (text: string): string => text;

const joinedComposedOf = (rows: TRows, ids: readonly string[], from: number, count: number): string => {
    let text = held(rows, ids[from])?.label ?? '';
    for (let i = from + 1; i < from + count; i++) {
        text = `${text},${held(rows, ids[i])?.label ?? ''}`;
    }
    return text;
};

const firstLabelOf =(rows: readonly (TRow | undefined)[]): string => {
    let text = '';
    for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        if (row !== undefined) text = row.label;
    }
    return text;
};

const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    const store = createEntitiesStore();
    let churnIds: readonly string[] = [];
    const churnRead: (string | undefined)[] = [];
    const stop: (Subscription | undefined)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    const watch = <T>(at: number, source: Readable<T>, textOf: (value: T) => string): void => {
        stop[at] = source.subscribe(value => {
            churnWoke++;
            churnRead[at] = textOf(value);
        });
        churnRead[at] = textOf(source.get());
    };

    return {
        ...rowWritesOf(event => store.send(event)),
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        settle: () => {
            if (churnWoke === 0) return;
            deliverChurn(churnConsumer, churnId, churnRank, churnWoke, churnRead);
            churnWoke = 0;
        },
        readAll: () => Object.values(store.getSnapshot().context.rows),
        deliverableRows: () => undefined,
        groupOrder: () => undefined,
        holdChurnRows: (ids, ranks) => {
            churnIds = ids;
            churnId = ids[0];
            churnRank = ranks[0];
            for (let i = 0; i < ids.length; i++) churnRead[i] = undefined;
        },
        mountOnRows: (at, from, count) => {
            if (count === 1) {
                const id = churnIds[from];
                watch(at, store.select(context => held(context.rows, id)), labelOf);
                return;
            }
            const ids = churnIds.slice(from, from + count);
            watch(
                at,
                store.select(context => ids.map(id => held(context.rows, id)), shallowEqual),
                firstLabelOf
            );
        },
        mountOnColumn: at => {
            const id = churnIds[0];
            watch(at, store.select(context => labelOf(held(context.rows, id))), asText);
        },
        mountOnChain: (at, from, count, depth) => {
            const ids = churnIds;
            let head: Readable<string> = store.select(context =>
                chainLevelOf(joinedComposedOf(context.rows, ids, from, count), 1)
            );
            for (let level = 2; level <= depth; level++) {
                const below = head;
                head = createAtom(() => chainLevelOf(below.get(), level));
            }
            watch(at, head, asText);
        },
        mountOnDiamond: (at, from) => {
            const id = churnIds[from];
            const label = store.select(context => labelOf(held(context.rows, id)));
            const left = createAtom(() => diamondLeftOf(label.get()));
            const right = createAtom(() => diamondRightOf(label.get()));
            const join = createAtom(() => diamondJoinOf(left.get(), right.get()));
            watch(at, join, asText);
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
            churnRead.length = 0;
        },
    };
};

type TCursorContext = { group: string; offset: number };

const bindReadStore = (consumers: TConsumers, view: TViewConfig, plan: TPlan): TReadBinding => {
    const store = createRowsStore();
    const cursorStore = createStore({
        context: { group: view.groupA, offset: 0 },
        on: {
            scrolled: (context: TCursorContext, event: { offset: number }) => ({
                ...context,
                offset: event.offset,
            }),
            switched: (_context: TCursorContext, event: { group: string }) => ({
                group: event.group,
                offset: 0,
            }),
        },
    });

    const paged = createAtom(() => {
        const cursor = cursorStore.get().context;
        const context = store.get().context;
        return {
            offset: cursor.offset,
            rows: selectionOf(
                context.rows,
                context.idsByGroup[cursor.group],
                cursor.offset + view.window,
                false
            ),
        };
    }, { compare: (prev, next) => prev.offset === next.offset && shallowEqual(prev.rows, next.rows) });
    const onAxis = store.select(
        context => selectionOf(context.rows, context.idsByGroup[view.groupA], view.window, true),
        shallowEqual
    );
    const stop: Subscription[] = [
        paged.subscribe(page => deliverPage(consumers.a, page.rows, page.offset, view.window)),
        onAxis.subscribe(rows => deliverPage(consumers.b, rows, 0, view.window)),
    ];
    const found: TRow[] = [];

    return {
        ...rowWritesOf(event => store.send(event)),
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            const rows = store.getSnapshot().context.rows;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const row = held(rows, keys[from + i]);
                if (row !== undefined) found.push(row);
            }
            deliverPage(consumers.a, found, 0, count);
        },
        scrollTo: offset => cursorStore.send({ type: 'scrolled', offset }),
        switchGroup: group => cursorStore.send({ type: 'switched', group }),
        settle: () => undefined,
        readAll: () => Object.values(store.getSnapshot().context.rows),
        deliverableRows: () => undefined,
        groupOrder: group => groupOrderOf(store.getSnapshot().context, group),
        dispose: () => {
            for (let i = 0; i < stop.length; i++) stop[i].unsubscribe();
            found.length = 0;
        },
    };
};

type TOwnersContext = { owners: Record<string, TOwner> };
type TPairsContext = { pairs: Record<string, TPairRow> };

const pairKeyOf = (owner: string, row: string): string => `${owner} ${row}`;

const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    const store = createEntitiesStore();
    const ownersStore = createStore({
        context: { owners: {} } as TOwnersContext,
        on: {
            writeOwners: (context: TOwnersContext, event: { owners: readonly TOwner[] }) => {
                const owners = { ...context.owners };
                const incoming = event.owners;
                for (let i = 0; i < incoming.length; i++) {
                    const owner = incoming[i];
                    owners[owner.id] = { id: owner.id, name: owner.name };
                }
                return { owners };
            },
            patchOwnerName: (context: TOwnersContext, event: { id: string; name: string }) => {
                const stored: TOwner | undefined = context.owners[event.id];
                if (stored === undefined) return undefined;
                return { owners: { ...context.owners, [event.id]: { ...stored, name: event.name } } };
            },
        },
    });
    const pairsStore = createStore({
        context: { pairs: {} } as TPairsContext,
        on: {
            seedPairs: (context: TPairsContext, event: { config: TRelationConfig }) => {
                const pairs = { ...context.pairs };
                const given = event.config;
                for (let i = 0; i < given.ids.length; i++) {
                    const owner = given.owners[i];
                    const row = given.ids[i];
                    pairs[pairKeyOf(owner, row)] = { owner, row, mark: given.seeds[i] };
                }
                return { pairs };
            },
            writePair: (context: TPairsContext, event: { key: string; mark: string }) => {
                const stored: TPairRow | undefined = context.pairs[event.key];
                if (stored === undefined) return undefined;
                return { pairs: { ...context.pairs, [event.key]: { ...stored, mark: event.mark } } };
            },
        },
    });

    let config: TRelationConfig = { ids: [], ranks: [], owners: [], touched: [], names: [], seeds: [] };
    const stop: Subscription[] = [];

    return {
        ...rowWritesOf(event => store.send(event)),
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        writeOwners: owners => ownersStore.send({ type: 'writeOwners', owners }),
        holdRelation: given => {
            config = given;
            pairsStore.send({ type: 'seedPairs', config: given });
            const names = ownersStore.select(
                context => given.owners.map(owner => context.owners[owner]?.name ?? ''),
                shallowEqual
            );
            const marks = pairsStore.select(
                context => given.ids.map((row, i) => context.pairs[pairKeyOf(given.owners[i], row)]?.mark ?? ''),
                shallowEqual
            );
            stop.push(names.subscribe(text => deliverRelation(consumers.a, config, text)));
            stop.push(marks.subscribe(text => deliverRelation(consumers.b, config, text)));
            deliverRelation(consumers.a, config, names.get());
            deliverRelation(consumers.b, config, marks.get());
        },
        patchOwnerName: (at, name) =>
            ownersStore.send({ type: 'patchOwnerName', id: config.touched[at], name }),
        writePair: (at, mark) =>
            pairsStore.send({ type: 'writePair', key: pairKeyOf(config.owners[at], config.ids[at]), mark }),
        settle: () => undefined,
        readAll: () => Object.values(store.getSnapshot().context.rows),
        deliverableRows: () => undefined,
        groupOrder: () => undefined,
        readOwners: () => Object.values(ownersStore.getSnapshot().context.owners),
        readPairs: () => Object.values(pairsStore.getSnapshot().context.pairs),
        dispose: () => {
            for (let i = 0; i < stop.length; i++) stop[i].unsubscribe();
        },
    };
};

type TSingleContext = { value: string; bystander: string };

const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
    const store = createStore({
        context: { value: '', bystander: '' } as TSingleContext,
        on: {
            seedSingle: (_context: TSingleContext, event: { value: string; bystander: string }) => ({
                value: event.value,
                bystander: event.bystander,
            }),
            writeSingle: (context: TSingleContext, event: { value: string }) => ({
                ...context,
                value: event.value,
            }),
        },
    });
    const stop: Subscription[] = [];
    let name = '';
    let bystanderName = '';
    let read = '';
    let readBystander = '';
    let woke = false;
    let wokeBystander = false;

    return {
        ...noRowStore('xstate-store'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            store.send({ type: 'seedSingle', value: config.seeds[0], bystander: config.seeds[1] });
            const value = store.select(context => context.value);
            const bystander = store.select(context => context.bystander);
            stop.push(
                value.subscribe(next => {
                    read = next;
                    woke = true;
                })
            );
            stop.push(
                bystander.subscribe(next => {
                    readBystander = next;
                    wokeBystander = true;
                })
            );
            read = value.get();
            readBystander = bystander.get();
            deliverSingle(consumers.a, name, read);
            deliverSingle(consumers.b, bystanderName, readBystander);
        },
        writeSingle: next => store.send({ type: 'writeSingle', value: next }),
        readSingle: () => store.getSnapshot().context.value,
        readBystander: () => store.getSnapshot().context.bystander,
        frame: runDirectly,
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
            for (let i = 0; i < stop.length; i++) stop[i].unsubscribe();
        },
    };
};

export const xstateStoreAdapter: TAdapter = {
    name: 'xstate-store',
    version: '4.2.3',
    docs: 'https://stately.ai/docs/xstate-store — createStore, store.send, store.select, createAtom',
    departure:
        '@xstate/store 4.2.3 exports no batch or transaction (xstate-store.js:2, :90); its ' +
        'coalescing is `enqueue.trigger`, whose events run inside the SAME transition and commit ' +
        'with one `atom.set` (store-55b22bbd.js:847-875, :646-649). So `frame` buffers the row ' +
        'events issued inside it and sends ONE `framed` event whose handler re-triggers each of ' +
        'them through `enqueue.trigger`: a frame is one transition and one notification. Each ' +
        'triggered event is still its own handler, so a frame of k point writes spreads the rows ' +
        'record k times. Outside a frame each write is its own `send`. Events are sent as ' +
        '`store.send({ type, ... })` objects rather ' +
        'than through `store.trigger`, which the README calls equivalent and which spreads the ' +
        'payload into a fresh event object per call (store-55b22bbd.js:543-549, :590-598). Every ' +
        'window, cell, read and relation view passes the package\'s own exported `shallowEqual` ' +
        '(xstate-store.js:13-27) as the `select`/`createAtom` comparator — view A\'s paged atom ' +
        'compares its offset and then its rows with it — so a recomputed view whose rows are the ' +
        'same objects is not delivered; the row, column and single subscribers keep ' +
        'the default `Object.is`. The rows record is updated immutably by spread, the README\'s ' +
        'pattern (README.md:28-45), so a point event copies the whole population\'s record once. ' +
        'The read wiring keeps view A\'s cursor in a second store and the relation wiring keeps ' +
        'owners and pairs in a store each, beside the rows store. A removal splices each id out of ' +
        'its group bucket one row at a time.',
    admission:
        'the row values live in the context of an @xstate/store store — its `rows` record, replaced ' +
        'only by the store\'s own transitions — and the change signal is the store\'s atom, which ' +
        '`send` sets and which pushes through the `select`/`createAtom` computeds subscribed over ' +
        'it; under the window and read wirings the `idsByGroup` index beside the rows is context ' +
        'written by the same transitions and holds ids, never values.',

    reads: readShapes((consumers, view, plan) => bindReadStore(consumers, view, plan)),
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
