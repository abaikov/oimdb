import {
    BasicIndex,
    BTreeIndex,
    createCollection,
    createLiveQueryCollection,
    eq,
    inArray,
} from '@tanstack/db';
import type { ChangeMessageOrDeleteKeyMessage } from '@tanstack/db';
import type {
    BenchConsumer,
    TConsumers,
    TViewBinding,
} from '../harness/consumer';
import { onSecondAxis } from '../harness/dataset';
import {
    chainLevelOf,
    diamondJoinOf,
    diamondLeftOf,
    diamondRightOf,
} from '../harness/derivations';
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

// Recipe: a collection fed through the SYNC interface (`begin`/`write`/`commit`, the
// collection-options-creator contract), and one `createLiveQueryCollection` per view,
// subscribed with `subscribeChanges`.
//
// INDEXING IS MEASURED THREE WAYS, WHICH IS WHY THIS FILE EXPORTS THREE ROWS.
// `autoIndex: 'off'` is the library default (db/src/types.ts:562-571); with it the
// library prints one warning PER LIVE QUERY — "orderBy with limit requires an index
// on 'rank' for efficient lazy loading. Falling back to loading all data." — and
// offers two remedies, an explicit `createIndex` on rank or `autoIndex: 'eager'`
// (db/src/query/compiler/order-by.ts:200-206). The first is `tanstack-db-indexed`,
// the second `tanstack-db-eager`. NONE IS DESCRIBED AS THE COST OF ANOTHER.
//
// What the sync interface settles, why the window is a real window, and the rest of
// the recipe: `tanstack-db.md`.
/** The one thing the three registered rows differ by. */
type TIndexing = 'off' | 'eager' | 'explicit';

const autoIndexOf = (indexing: TIndexing): 'off' | 'eager' =>
    indexing === 'eager' ? 'eager' : 'off';

const PARTICIPANT_OF: Readonly<Record<TIndexing, string>> = {
    off: 'tanstack-db',
    eager: 'tanstack-db-eager',
    explicit: 'tanstack-db-indexed',
};

type TSyncPush<TDoc extends object> = {
    begin: () => void;
    write: (message: ChangeMessageOrDeleteKeyMessage<TDoc, string>) => void;
    commit: () => void;
};

const createSyncFrame = () => {
    let framing = false;
    const opened: { commit: () => void }[] = [];
    return {
        within: <TDoc extends object>(
            push: TSyncPush<TDoc>,
            send: (push: TSyncPush<TDoc>) => void
        ): void => {
            if (!framing) {
                push.begin();
                send(push);
                push.commit();
                return;
            }
            if (!opened.includes(push)) {
                push.begin();
                opened.push(push);
            }
            send(push);
        },
        // commit takes the LAST pending sync transaction (db/src/collection/sync.ts:285-290), so a frame's writes join the one it opened.
        frame: (run: () => void): void => {
            framing = true;
            run();
            framing = false;
            for (let i = 0; i < opened.length; i++) opened[i].commit();
            opened.length = 0;
        },
    };
};

type TSyncFrame = ReturnType<typeof createSyncFrame>;

const syncedCollectionOf = <TDoc extends object>(
    indexing: TIndexing,
    getKey: (doc: TDoc) => string
) => {
    let push!: TSyncPush<TDoc>;
    const collection = createCollection<TDoc, string>({
        getKey,
        // Start now: the views are derived below and the load arrives after.
        startSync: true,
        gcTime: 0,
        // On the BACKING collection, because that is where the columns the
        // live queries filter and order on live.
        autoIndex: autoIndexOf(indexing),
        defaultIndexType: BTreeIndex<string>,
        sync: {
            // The default, and what lets a one-column patch be written as one
            // column: an `update` message is merged onto the stored row.
            rowUpdateMode: 'partial',
            sync: ({ begin, write, commit, markReady }) => {
                push = { begin, write, commit };
                // Nothing to load from: this collection's backend is `write`.
                markReady();
            },
        },
    });
    return { collection, push };
};

type TRowWrites = Pick<
    TBinding,
    'write' | 'remove' | 'patchLabel' | 'patchNote' | 'setGroup' | 'setRank' | 'readAll'
>;

const rowsStoreOf = (indexing: TIndexing, sync: TSyncFrame) => {
    const { collection: rows, push } = syncedCollectionOf<TRow>(indexing, row => row.id);
    // One column, written as one column: `rowUpdateMode: 'partial'` merges the
    // message onto the stored row. The rest: `tanstack-db.md`.
    const update = (value: Partial<TRow> & { id: string }): void =>
        sync.within(push, open => open.write({ type: 'update', value: value as TRow }));
    const writes: TRowWrites = {
        // Upsert. The sync interface rejects an insert over an existing row, so the
        // update/insert distinction is the library's. The rest: `tanstack-db.md`.
        write: incoming =>
            sync.within(push, open => {
                for (let i = 0; i < incoming.length; i++) {
                    const row = incoming[i];
                    if (rows.has(row.id)) open.write({ type: 'update', value: row });
                    else open.write({ type: 'insert', value: { ...row } });
                }
            }),
        // A delete drains the top-K — it is maintained incrementally, so removing
        // the window's rows pulls in the ones just outside it — and the live query
        // emits one change set for the lot.
        remove: ids =>
            sync.within(push, open => {
                for (let i = 0; i < ids.length; i++) open.write({ type: 'delete', key: ids[i] });
            }),
        patchLabel: (id, label) => update({ id, label }),
        patchNote: (id, note) => update({ id, note }),
        setGroup: (id, group) => update({ id, group }),
        setRank: (id, rank) => update({ id, rank }),
        // The BACKING collection, not the live queries: a live query is
        // `where(group) … limit(32)`, so it would answer for 32 rows of one group.
        readAll: () => rows.toArray,
    };
    return { rows, writes };
};

type TRowsCollection = ReturnType<typeof rowsStoreOf>['rows'];

type TChangeSource = {
    subscribeChanges(
        callback: (changes: readonly unknown[]) => void,
        options: { includeInitialState: boolean }
    ): { unsubscribe(): void };
};

// `markReady` broadcasts an EMPTY change list so a view can tell "loaded and empty"
// from "still loading".
const watchChanges = (source: TChangeSource, includeInitialState: boolean) => {
    const watched = { pending: false, subscription: { unsubscribe: (): void => undefined } };
    watched.subscription = source.subscribeChanges(changes => {
        if (changes.length > 0) watched.pending = true;
    }, { includeInitialState });
    return watched;
};

// A genuine second witness (see `TBinding.groupOrder`): a pipeline whose `where`
// dropped a row on a group move, kept one it should have expelled, or (on the eager
// row) maintained an auto-built index wrongly parts from the model here. The rest:
// `tanstack-db.md`.
const groupOrderOf = (rows: TRowsCollection, group: string): readonly string[] => {
    const audit = createLiveQueryCollection({
        startSync: true,
        gcTime: 0,
        query: q => q.from({ row: rows }).where(({ row }) => eq(row.group, group)),
    });
    const ids = orderedIdsOfRows([...(audit.toArray as unknown as readonly TRow[])]);
    audit.cleanup().catch(() => undefined);
    return ids;
};

const bindWith =
    (indexing: TIndexing) =>
    (bindings: readonly TViewBinding[], view: TViewConfig): TBinding => {
        const sync = createSyncFrame();
        const { rows, writes } = rowsStoreOf(indexing, sync);
        if (indexing === 'explicit') {
            rows.createIndex(row => row.group, { indexType: BasicIndex<string> });
            rows.createIndex(row => row.rank, { indexType: BTreeIndex<string> });
        }

        // ONE LIVE QUERY PER VIEW — two, or fifty. The rest: `tanstack-db.md`.
        const views = bindings.map(bound => {
            const live = createLiveQueryCollection({
                startSync: true,
                gcTime: 0,
                query: q =>
                    q
                        .from({ row: rows })
                        .where(({ row }) => eq(row.group, bound.group))
                        .orderBy(({ row }) => row.rank)
                        .orderBy(({ row }) => row.id)
                        .limit(view.window)
                        .select(({ row }) => ({
                            id: row.id,
                            rank: row.rank,
                            label: row.label,
                        })),
            });
            return { live, consumer: bound.consumer, watched: watchChanges(live, false) };
        });

        // `pin` HOISTS NOTHING HERE: the sync interface is addressed by KEY and there
        // is no row handle a caller may hold. THE READ SIDE IS ONE PROJECTED LIVE QUERY
        // PER CELL COLUMN over the pinned set. The rest: `tanstack-db.md`.
        let pinnedIds: string[] = [];
        let cells: TCellConfig = { ids: [], ranks: [] };

        const cellOf = (column: 'label' | 'note', consumer: BenchConsumer) => {
            const live = createLiveQueryCollection({
                startSync: true,
                gcTime: 0,
                query: q =>
                    q
                        .from({ row: rows })
                        .where(({ row }) => inArray(row.id, pinnedIds))
                        .select(({ row }) => ({
                            id: row.id,
                            text: column === 'label' ? row.label : row.note,
                        })),
            });
            return { live, consumer, text: new Array<string>(pinnedIds.length), watched: watchChanges(live, false) };
        };
        const cellViews: ReturnType<typeof cellOf>[] = [];

        const renderCell = (cell: ReturnType<typeof cellOf>): void => {
            for (let i = 0; i < cell.text.length; i++) cell.text[i] = cell.live.get(pinnedIds[i])?.text ?? '';
            deliverCells(cell.consumer, cells, cell.text);
        };

        return {
            ...writes,
            frame: sync.frame,
            // The window live queries go and two projected live queries over the pinned
            // ids take their place, one per column, so a write wakes only its column.
            pin: config => {
                for (const state of views) {
                    state.watched.subscription.unsubscribe();
                    state.live.cleanup().catch(() => undefined);
                }
                views.length = 0;
                cells = config;
                pinnedIds = [...config.ids];
                if (indexing === 'explicit') rows.createIndex(row => row.id, { indexType: BTreeIndex<string> });
                cellViews.push(cellOf('label', bindings[0].consumer), cellOf('note', bindings[1].consumer));
                // Untimed: the state every sample starts from.
                for (const cell of cellViews) renderCell(cell);
            },
            // The same one-column sync message `patchLabel` sends; TanStack DB
            // has no cheaper address to offer.
            patchPinnedLabel: (at, label) => writes.patchLabel(pinnedIds[at], label),
            patchPinnedNote: (at, note) => writes.patchNote(pinnedIds[at], note),
            // The batch boundary; no flush exists and none is needed. The rest:
            // `tanstack-db.md`.
            settle: () => {
                for (const cell of cellViews) {
                    if (!cell.watched.pending) continue;
                    cell.watched.pending = false;
                    renderCell(cell);
                }
                for (const state of views) {
                    if (!state.watched.pending) continue;
                    state.watched.pending = false;
                    // Widening away the virtual properties the read adds.
                    deliver(state.consumer, state.live.toArray as unknown as readonly TRow[], view.window);
                }
            },
            deliverableRows: () => undefined,
            groupOrder: group => groupOrderOf(rows, group),
            // `cleanup` is async; the `.catch` is the library's own idiom
            // (`directOpTransaction.commit()` in `collection/mutations.ts`) and
            // keeps a teardown failure from becoming an unhandled rejection that
            // kills the worker.
            dispose: () => {
                for (const state of [...views, ...cellViews]) {
                    state.watched.subscription.unsubscribe();
                    state.live.cleanup().catch(() => undefined);
                }
                rows.cleanup().catch(() => undefined);
            },
        };
    };

// The same collection and sync interface, with no live queries until a script mounts
// one. The rest: `tanstack-db.md`.
const bindChurnWith =
    (indexing: TIndexing) =>
    (churnConsumer: BenchConsumer): TChurnBinding => {
        const sync = createSyncFrame();
        const { rows, writes } = rowsStoreOf(indexing, sync);
        if (indexing === 'explicit') {
            rows.createIndex(row => row.id, { indexType: BTreeIndex<string> });
        }

        let churnIds: readonly string[] = [];
        const churnRead: (string | undefined)[] = [];
        /** Per subscriber: its subscription, and any pipelines it built. */
        const mounted: ({ subscription: { unsubscribe(): void }; built: { cleanup: () => Promise<unknown> }[] } | undefined)[] = [];
        let churnWoke = 0;
        let churnId = '';
        let churnRank = 0;

        const labelAt = (at: number): string => rows.get(churnIds[at])?.label ?? '';

        // The subscription goes AND every pipeline it built is cleaned up: a live
        // query left alive is fed by every later write, so unsubscribing alone
        // would price an unmount at a listener removal and leave the work standing.
        const unmount = (at: number): void => {
            const held = mounted[at];
            if (held === undefined) return;
            held.subscription.unsubscribe();
            for (const live of held.built) live.cleanup().catch(() => undefined);
            mounted[at] = undefined;
            churnRead[at] = undefined;
        };

        return {
            ...writes,
            frame: sync.frame,
            pin: () => undefined,
            patchPinnedLabel: () => undefined,
            patchPinnedNote: () => undefined,
            // Every subscriber has already run: `commit()` ends in `emitEvents` before
            // the write returns. What is left is the frame boundary — one delivery if
            // anything woke, none if nothing did.
            settle: () => {
                if (churnWoke === 0) return;
                deliverChurn(churnConsumer, churnId, churnRank, churnWoke, churnRead);
                churnWoke = 0;
            },
            deliverableRows: () => undefined,
            groupOrder: () => undefined,
            /** NOTHING TO HOIST: the sync interface is addressed by KEY. */
            holdChurnRows: (ids, ranks) => {
                churnIds = ids;
                churnId = ids[0];
                churnRank = ranks[0];
                for (let i = 0; i < ids.length; i++) churnRead[i] = undefined;
            },
            mountOnRows: (at, from, count) => {
                const subscription = rows.subscribeChanges(
                    changes => {
                        if (changes.length === 0) return;
                        churnWoke++;
                        churnRead[at] = labelAt(from);
                    },
                    {
                        includeInitialState: false,
                        where:
                            count === 1
                                ? row => eq(row.id, churnIds[from])
                                : row => inArray(row.id, churnIds.slice(from, from + count)),
                    }
                );
                mounted[at] = { subscription, built: [] };
                churnRead[at] = labelAt(from);
            },
            mountOnColumn: at => {
                const id = churnIds[0];
                const live = createLiveQueryCollection({
                    startSync: true,
                    gcTime: 0,
                    query: q =>
                        q
                            .from({ row: rows })
                            .where(({ row }) => eq(row.id, id))
                            .select(({ row }) => ({ id: row.id, label: row.label })),
                });
                const subscription = live.subscribeChanges(
                    changes => {
                        if (changes.length === 0) return;
                        churnWoke++;
                        churnRead[at] = labelAt(0);
                    },
                    { includeInitialState: false }
                );
                mounted[at] = { subscription, built: [live] };
                churnRead[at] = labelAt(0);
            },
            mountOnChain: (at, from, count, depth) => {
                const id = churnIds[from];
                const ids = churnIds.slice(from, from + count);
                const firstLevel = () =>
                    createLiveQueryCollection({
                        startSync: true,
                        gcTime: 0,
                        query: q =>
                            q
                                .from({ row: rows })
                                .where(({ row }) => inArray(row.id, ids))
                                .fn.select(({ row }) => ({
                                    id: row.id,
                                    text: chainLevelOf(row.label, 1),
                                })),
                    });
                let head = firstLevel();
                const built: { cleanup: () => Promise<unknown> }[] = [head];
                for (let level = 2; level <= depth; level++) {
                    const under = head;
                    // THE ONE CAST: a live query over a live query has the same
                    // ROW SHAPE as the level below it, and the library's inferred
                    // context type is not written down anywhere a loop can name.
                    head = createLiveQueryCollection({
                        startSync: true,
                        gcTime: 0,
                        query: q =>
                            q.from({ below: under }).fn.select(({ below }) => ({
                                id: below.id,
                                text: chainLevelOf(below.text, level),
                            })),
                    }) as unknown as ReturnType<typeof firstLevel>;
                    built.push(head);
                }
                const top = head;
                const subscription = top.subscribeChanges(
                    changes => {
                        if (changes.length === 0) return;
                        churnWoke++;
                        churnRead[at] = top.get(id)?.text ?? '';
                    },
                    { includeInitialState: false }
                );
                mounted[at] = { subscription, built };
                churnRead[at] = top.get(id)?.text ?? '';
            },
            mountOnDiamond: (at, from) => {
                const id = churnIds[from];
                const branchOver = (derive: (label: string) => string) =>
                    createLiveQueryCollection({
                        startSync: true,
                        gcTime: 0,
                        query: q =>
                            q
                                .from({ row: rows })
                                .where(({ row }) => eq(row.id, id))
                                .fn.select(({ row }) => ({ id: row.id, text: derive(row.label) })),
                    });
                const left = branchOver(diamondLeftOf);
                const right = branchOver(diamondRightOf);
                const join = createLiveQueryCollection({
                    startSync: true,
                    gcTime: 0,
                    query: q =>
                        q
                            .from({ left })
                            .innerJoin({ right }, ({ left: l, right: r }) => eq(l.id, r.id))
                            .fn.select(({ left: l, right: r }) => ({
                                text: diamondJoinOf(l.text, r.text),
                            })),
                });
                const subscription = join.subscribeChanges(
                    changes => {
                        if (changes.length === 0) return;
                        churnWoke++;
                        churnRead[at] = join.toArray[0]?.text ?? '';
                    },
                    { includeInitialState: false }
                );
                mounted[at] = { subscription, built: [join, left, right] };
                churnRead[at] = join.toArray[0]?.text ?? '';
            },
            unmount,
            dispose: () => {
                for (let at = 0; at < mounted.length; at++) unmount(at);
                rows.cleanup().catch(() => undefined);
            },
        };
    };

// THE SECOND PREDICATE IS `q.fn.where`, the library's own functional filter, so the
// axis — a fact about the key — is evaluated inside the pipeline rather than over its
// result. The rest: `tanstack-db.md`.
const bindReadWith =
    (indexing: TIndexing) =>
    (consumers: TConsumers, view: TViewConfig, plan: TPlan): TReadBinding => {
        const sync = createSyncFrame();
        const { rows, writes } = rowsStoreOf(indexing, sync);
        if (indexing === 'explicit') {
            rows.createIndex(row => row.group, { indexType: BasicIndex<string> });
            rows.createIndex(row => row.rank, { indexType: BTreeIndex<string> });
        }

        const pagedOver = (group: string, offset: number) =>
            createLiveQueryCollection({
                startSync: true,
                gcTime: 0,
                query: q =>
                    q
                        .from({ row: rows })
                        .where(({ row }) => eq(row.group, group))
                        .orderBy(({ row }) => row.rank)
                        .orderBy(({ row }) => row.id)
                        .offset(offset)
                        .limit(view.window),
            });
        let pagedGroup = view.groupA;
        let paged = pagedOver(pagedGroup, 0);
        let pagedWatch = watchChanges(paged, false);

        const onAxis = createLiveQueryCollection({
            startSync: true,
            gcTime: 0,
            query: q =>
                q
                    .from({ row: rows })
                    .where(({ row }) => eq(row.group, view.groupA))
                    // The axis, inside the pipeline: a fact about the key.
                    .fn.where(({ row }) => onSecondAxis(row.id))
                    .orderBy(({ row }) => row.rank)
                    .orderBy(({ row }) => row.id)
                    .limit(view.window),
        });
        const axisWatch = watchChanges(onAxis, false);

        /** Reused only by the pull. */
        const found: TRow[] = [];

        return {
            ...writes,
            frame: sync.frame,
            pin: () => undefined,
            patchPinnedLabel: () => undefined,
            patchPinnedNote: () => undefined,
            // ONE `collection.get` PER KEY — the library's own keyed read, against the
            // BACKING collection and not a live query. Nothing is hoisted.
            readKeys: (from, count) => {
                const keys = plan.readKeys;
                found.length = 0;
                for (let i = 0; i < count; i++) {
                    const row = rows.get(keys[from + i]);
                    if (row !== undefined) found.push(row);
                }
                deliverPage(consumers.a, found, 0, count);
            },
            scrollTo:
                indexing === 'off'
                    ? to => {
                          pagedWatch.subscription.unsubscribe();
                          paged.cleanup().catch(() => undefined);
                          paged = pagedOver(pagedGroup, to);
                          pagedWatch = watchChanges(paged, true);
                      }
                    : to => {
                          const moved = paged.utils.setWindow({ offset: to, limit: view.window });
                          if (moved !== true) {
                              throw new Error(
                                  'tanstack-db: setWindow started a subset load and returned a promise. This ' +
                                      'harness never yields, so the moved window would never be delivered.'
                              );
                          }
                      },
            // A live query's `where` is fixed at construction, so the switch builds the new one, as `useLiveQuery` does on a changed dependency; its initial state is the mark.
            switchGroup: group => {
                pagedWatch.subscription.unsubscribe();
                paged.cleanup().catch(() => undefined);
                pagedGroup = group;
                paged = pagedOver(group, 0);
                pagedWatch = watchChanges(paged, true);
            },
            settle: () => {
                if (pagedWatch.pending) {
                    pagedWatch.pending = false;
                    deliverPage(consumers.a, paged.toArray as unknown as readonly TRow[], 0, view.window);
                }
                if (axisWatch.pending) {
                    axisWatch.pending = false;
                    deliverPage(consumers.b, onAxis.toArray as unknown as readonly TRow[], 0, view.window);
                }
            },
            deliverableRows: () => undefined,
            groupOrder: group => groupOrderOf(rows, group),
            dispose: () => {
                pagedWatch.subscription.unsubscribe();
                paged.cleanup().catch(() => undefined);
                axisWatch.subscription.unsubscribe();
                onAxis.cleanup().catch(() => undefined);
                rows.cleanup().catch(() => undefined);
            },
        };
    };

// ONE PAIR RECORD. The rest: `tanstack-db.md`.
type TPairDoc = TPairRow & { key: string };

// THREE COLLECTIONS fed through the same sync interface, one live query per view. The
// rest: `tanstack-db.md`.
const bindRelationWith =
    (indexing: TIndexing) =>
    (consumers: TConsumers): TRelationBinding => {
        const sync = createSyncFrame();
        const { rows, writes } = rowsStoreOf(indexing, sync);
        const { collection: owners, push: ownerPush } = syncedCollectionOf<TOwner>(indexing, owner => owner.id);
        const { collection: pairs, push: pairPush } = syncedCollectionOf<TPairDoc>(indexing, pair => pair.key);
        if (indexing === 'explicit') {
            owners.createIndex(owner => owner.id, { indexType: BTreeIndex<string> });
            pairs.createIndex(pair => pair.key, { indexType: BTreeIndex<string> });
        }

        let config: TRelationConfig = { ids: [], ranks: [], owners: [], touched: [], names: [], seeds: [] };
        /** The owner ids the join script writes, in `config.touched` order. */
        const touchedIds: string[] = [];
        /** The pair records' composed addresses, in `ids` order. */
        const pairIds: string[] = [];
        const nameText: string[] = [];
        const markText: string[] = [];

        const pairKey = (owner: string, row: string): string => `${owner} ${row}`;

        // Factories, so each query's type is a concrete instantiation rather than a
        // generic function's return. The rest: `tanstack-db.md`.
        const relationViewsOf = () => {
            const ownerLive = createLiveQueryCollection({
                startSync: true,
                gcTime: 0,
                query: q => q.from({ owner: owners }).where(({ owner }) => inArray(owner.id, touchedIds)),
            });
            const pairLive = createLiveQueryCollection({
                startSync: true,
                gcTime: 0,
                query: q => q.from({ pair: pairs }).where(({ pair }) => inArray(pair.key, pairIds)),
            });
            return { ownerLive, pairLive, names: watchChanges(ownerLive, false), marks: watchChanges(pairLive, false) };
        };
        let relationViews: ReturnType<typeof relationViewsOf> | undefined;

        const renderNames = (live: ReturnType<typeof relationViewsOf>['ownerLive']): void => {
            for (let i = 0; i < nameText.length; i++) nameText[i] = live.get(config.owners[i])?.name ?? '';
            deliverRelation(consumers.a, config, nameText);
        };
        const renderMarks = (live: ReturnType<typeof relationViewsOf>['pairLive']): void => {
            for (let i = 0; i < markText.length; i++) markText[i] = live.get(pairIds[i])?.mark ?? '';
            deliverRelation(consumers.b, config, markText);
        };

        return {
            ...writes,
            frame: sync.frame,
            pin: () => undefined,
            patchPinnedLabel: () => undefined,
            patchPinnedNote: () => undefined,
            writeOwners: incoming =>
                sync.within(ownerPush, open => {
                    for (let i = 0; i < incoming.length; i++) {
                        open.write({ type: 'insert', value: { id: incoming[i].id, name: incoming[i].name } });
                    }
                }),
            // The pair records are committed BEFORE either query exists, so the mint
            // reaches nobody and every timed step is an update on a record the pipeline
            // already holds. The rest: `tanstack-db.md`.
            holdRelation: given => {
                config = given;
                nameText.length = given.ids.length;
                markText.length = given.ids.length;
                touchedIds.push(...given.touched);
                sync.within(pairPush, open => {
                    for (let i = 0; i < given.ids.length; i++) {
                        const key = pairKey(given.owners[i], given.ids[i]);
                        pairIds.push(key);
                        open.write({
                            type: 'insert',
                            value: { key, owner: given.owners[i], row: given.ids[i], mark: given.seeds[i] },
                        });
                    }
                });
                relationViews = relationViewsOf();
                // Untimed: the state every sample starts from.
                renderNames(relationViews.ownerLive);
                renderMarks(relationViews.pairLive);
            },
            // Feeds the owners collection alone, so the pair query's pipeline is not
            // run.
            patchOwnerName: (at, name) =>
                sync.within(ownerPush, open =>
                    open.write({ type: 'update', value: { id: config.touched[at], name } })
                ),
            // The address string is built fresh every call: caching eight of them would
            // make the row a measurement of an array read.
            writePair: (at, mark) =>
                sync.within(pairPush, open =>
                    open.write({
                        type: 'update',
                        value: { key: pairKey(config.owners[at], config.ids[at]), mark } as TPairDoc,
                    })
                ),
            // The frame boundary; no flush exists and none is needed. Each view
            // renders only when ITS OWN live query reported a change.
            settle: () => {
                if (relationViews === undefined) return;
                if (relationViews.names.pending) {
                    relationViews.names.pending = false;
                    renderNames(relationViews.ownerLive);
                }
                if (relationViews.marks.pending) {
                    relationViews.marks.pending = false;
                    renderMarks(relationViews.pairLive);
                }
            },
            deliverableRows: () => undefined,
            groupOrder: () => undefined,
            /** The BACKING collection, not the query: the query covers four owners. */
            readOwners: () => owners.toArray,
            // THE ADDRESS IS READ OUT OF THE RECORD'S OWN FIELDS and not out of `key` —
            // that field is this file's own composition, so answering from it would
            // make the audit agree with whatever the composition did.
            readPairs: () => pairs.toArray,
            dispose: () => {
                if (relationViews !== undefined) {
                    relationViews.names.subscription.unsubscribe();
                    relationViews.marks.subscription.unsubscribe();
                    relationViews.ownerLive.cleanup().catch(() => undefined);
                    relationViews.pairLive.cleanup().catch(() => undefined);
                }
                rows.cleanup().catch(() => undefined);
                owners.cleanup().catch(() => undefined);
                pairs.cleanup().catch(() => undefined);
            },
        };
    };


/* ── one value, one subscriber, and a second value beside it ───────────── */

// TANSTACK DB HAS NO SCALAR: its export surface is collections, live queries,
// transactions and indexes, so the smallest thing that can hold a value here is a ROW,
// and the smallest subscriber is a change subscription narrowed to the one row that
// holds it. The rest: `tanstack-db.md`.
const bindSingleWith =
    (indexing: TIndexing) =>
    (consumers: TConsumers): TSingleBinding => {
        type TValueRow = { id: string; value: string };
        const sync = createSyncFrame();
        const { collection: values, push } = syncedCollectionOf<TValueRow>(indexing, row => row.id);

        const stop: { unsubscribe(): void }[] = [];
        let name = '';
        let bystanderName = '';
        let read = '';
        let readBystander = '';
        let woke = false;
        let wokeBystander = false;

        const valueOf = (id: string): string => values.get(id)?.value ?? '';

        const put = (type: 'insert' | 'update', row: TValueRow): void =>
            sync.within(push, open => open.write({ type, value: row }));

        return {
            // THE ROW THAT REFUSED, AND NOT THE FILE. The rest: `tanstack-db.md`.
            ...noRowStore(PARTICIPANT_OF[indexing]),
            holdSingle: config => {
                name = config.name;
                bystanderName = config.bystander;
                put('insert', { id: name, value: config.seeds[0] });
                put('insert', { id: bystanderName, value: config.seeds[1] });
                read = config.seeds[0];
                readBystander = config.seeds[1];
                stop.push(
                    values.subscribeChanges(
                        changes => {
                            if (changes.length === 0) return;
                            read = valueOf(name);
                            woke = true;
                        },
                        { includeInitialState: false, where: row => eq(row.id, name) }
                    ),
                    values.subscribeChanges(
                        changes => {
                            if (changes.length === 0) return;
                            readBystander = valueOf(bystanderName);
                            wokeBystander = true;
                        },
                        { includeInitialState: false, where: row => eq(row.id, bystanderName) }
                    )
                );
                deliverSingle(consumers.a, name, read);
                deliverSingle(consumers.b, bystanderName, readBystander);
            },
            writeSingle: next => put('update', { id: name, value: next }),
            readSingle: () => valueOf(name),
            readBystander: () => valueOf(bystanderName),
            frame: sync.frame,
            // Every subscriber has already run: `commit()` ends in `emitEvents` before
            // the write returns. What is left is the frame boundary.
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
                stop.length = 0;
            },
        };
    };

const SYNC_PATH_DEPARTURE =
    'WRITES DO NOT GO THROUGH collection.insert/update/delete, the API an application calls: they ' +
    'are pushed through the sync handles (begin/write/commit) a collection-options creator gets, ' +
    'so the optimistic mutation path (transactions, optimistic state, rollback) is never entered ' +
    'and no figure here prices it; that path settles on a microtask and this harness never ' +
    'yields. A frame is one sync transaction per collection (begin … commit), and a write ' +
    'outside a frame is its own begin/write/commit. ' +
    'The diamond join is a live query over the two branch live queries; in 0.15 a committed ' +
    'batch is published in one scheduling context with the branches as its dependencies, and ' +
    'churnDiamond verifies it runs once per write. A ' +
    'view switch builds a new live query, since a where is fixed at construction; so does a scroll ' +
    'on the unindexed row, whose setWindow would return a promise. On the wide ' +
    'mount shape one subscription filters on every churn row it is asked for and its body reads ' +
    'the first of them alone.';

const adapterWith = (
    indexing: TIndexing,
    departure: string,
    admission: string
): TAdapter => ({
    name: PARTICIPANT_OF[indexing],
    version: '0.15.0',
    docs: 'https://tanstack.com/db/latest/docs/guides/collection-options-creator',
    departure: `${SYNC_PATH_DEPARTURE} ${departure}`,
    admission,
    reads: readShapes((consumers, view, plan) => bindReadWith(indexing)(consumers, view, plan)),
    churn: churnShapes(consumers => bindChurnWith(indexing)(consumers.a)),
    relations: {
        build: consumers => bindRelationWith(indexing)(consumers),
        absent: '',
    },
    single: {
        build: consumers => bindSingleWith(indexing)(consumers),
        absent: '',
    },
    bind: (consumers, view) =>
        bindWith(indexing)(
            [
                { group: view.groupA, consumer: consumers.a },
                { group: view.groupB, consumer: consumers.b },
            ],
            view
        ),
    // The same body, handed fifty views instead of two — same collection, query
    // shape and indexing setting.
    bindPerGroup: (consumers, view) => bindWith(indexing)(consumers.views, view),
});

export const tanstackDbAdapter: TAdapter = adapterWith(
    'off',
    'autoIndex is left at its default, off, which the library warns about once per ordered live ' +
        "query; the warning's two remedies are an explicit createIndex on rank (tanstack-db-indexed) " +
        'and autoIndex: eager (tanstack-db-eager).',
    'the row values live in a TanStack DB collection, written through its own sync interface ' +
        "(begin/write/commit), and the change signal is the library's own subscribeChanges on a " +
        'live query collection, fired from commit() before the write returns; the adapter keeps no ' +
        'values of its own.'
);

export const tanstackDbEagerAdapter: TAdapter = adapterWith(
    'eager',
    "autoIndex is eager, one of the two remedies the library's orderBy warning offers, with " +
        'defaultIndexType BTreeIndex, which BasicIndex\'s own doc names for write-heavy large ' +
        'collections; eager builds every auto index with that one type. Eager also ' +
        'indexes the where of every subscribeChanges, so the churn and single wirings build an index ' +
        'on id that no script reads (no subscription asks for initial state), and on churn that build ' +
        'lands in the first timed mount of the process.',
    'the row values live in a TanStack DB collection, written through its own sync interface ' +
        '(begin/write/commit) and indexed by the library under autoIndex: eager, and the change ' +
        'signal is its own subscribeChanges on a live query collection, fired from commit() before ' +
        'the write returns; the adapter keeps no values of its own.'
);

export const tanstackDbIndexedAdapter: TAdapter = adapterWith(
    'explicit',
    "autoIndex is off and every index is explicit, the other remedy the library's orderBy warning " +
        'offers and what the type docs recommend: collection.createIndex on the columns each wiring\'s ' +
        'live queries filter on and on the first sort key — group (BasicIndex) and rank (BTreeIndex) ' +
        'under the window and read wirings, plus id (BTreeIndex), built in pin, for the pinned-cell ' +
        'queries only the cell scripts run; id ' +
        'under churn; owner id and pair key under the relation wiring; none under single, whose ' +
        'subscriptions read no initial state.',
    'the row values live in a TanStack DB collection, written through its own sync interface ' +
        '(begin/write/commit) and indexed by collection.createIndex, and the change signal is the ' +
        "library's own subscribeChanges on a live query collection, fired from commit() before the " +
        'write returns; the adapter keeps no values of its own.'
);
