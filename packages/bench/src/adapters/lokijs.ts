import Loki from 'lokijs';
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
import { churnShapes, declinedMount, noRowStore, readShapes } from '../harness/types';
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

/** LokiJS ships no types; these cover exactly what this adapter calls. */
type TLokiDoc = TRow & { $loki?: number };
type TLokiOwnerDoc = TOwner & { $loki?: number };
type TLokiPairDoc = TPairRow & { key: string; $loki?: number };

type TLokiView = {
    applyFind(query: Record<string, string>, uid?: string): TLokiView;
    /** The documented predicate filter — a function per document. */
    applyWhere(fun: (doc: TLokiDoc) => boolean): TLokiView;
    applySortCriteria(criteria: [string, boolean][]): TLokiView;
    data(): TLokiDoc[];
    performSortPhase(): void;
    on(event: 'rebuild', listener: () => void): void;
};

/** The collection emitter hands its listener the document that moved. */
type TLokiListener = (doc?: TLokiDoc) => void;

// A collection over one document shape. The rest: `lokijs.md`.
type TLokiCollection<TDoc = TLokiDoc> = {
    addDynamicView(name: string, options?: { persistent?: boolean }): TLokiView;
    removeDynamicView(name: string): void;
    by(field: string, value: string): TDoc | undefined;
    find(query: Record<string, unknown>): TDoc[];
    insert(docs: TDoc[]): unknown;
    update(docs: TDoc | TDoc[]): unknown;
    remove(docs: TDoc[]): unknown;
    on(event: string, listener: (doc?: TDoc) => void): void;
    removeListener(event: string, listener: (doc?: TDoc) => void): void;
};

type TLokiDb = {
    /** One door, whatever the document shape — LokiJS's own signature. */
    addCollection<TDoc = TLokiDoc>(
        name: string,
        options: { unique?: string[]; indices?: string[]; disableMeta?: boolean }
    ): TLokiCollection<TDoc>;
    removeCollection(name: string): void;
};

const LokiDb = Loki as unknown as new (name: string) => TLokiDb;

const collectionOptions = (unique: string) => ({
    unique: [unique],
    disableMeta: true,
});

type TRebuiltView = { view: TLokiView; rebuilt: boolean };

const watchRebuild = (view: TLokiView): TRebuiltView => {
    const watched: TRebuiltView = { view, rebuilt: false };
    view.on('rebuild', () => {
        watched.rebuilt = true;
    });
    return watched;
};

// A passive view's own 'rebuild' is queued on a setTimeout (lokijs.js:4667-4705) that never fires here; performSortPhase emits it synchronously, only when the view was dirtied (lokijs.js:4711-4738).
const rebuiltNow = (watched: TRebuiltView): boolean => {
    watched.rebuilt = false;
    watched.view.performSortPhase();
    return watched.rebuilt;
};

// LokiJS has no notification batch: Collection.startTransaction is a rollback snapshot (lokijs.js:7095-7108), and a passive view already defers its sort to the read.
const frameDirect = (run: () => void): void => run();

// Recipe: LokiJS's DynamicView — its documented answer to "a filter you run again and
// again", a persistent view that the collection re-evaluates document by document as
// writes land, plus a unique index on the primary key so the upsert lookup is a hash
// hit rather than a scan. The rest: `lokijs.md`.
const bindViews = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    const db = new LokiDb('bench.db');
    // `unique: ['id']` is the one index this adapter genuinely uses: the upsert
    // rule below looks every row up by key, and `by()` reads its hash map.
    const rows = db.addCollection('rows', collectionOptions('id'));

    const makeView = (
        name: string,
        group: string,
        consumer: BenchConsumer
    ): { watched: TRebuiltView; consumer: BenchConsumer; name: string } => {
        const dynamic = rows.addDynamicView(name);
        dynamic.applyFind({ group });
        // Fresh array per call: `compoundsort` normalises the criteria it is
        // given in place.
        dynamic.applySortCriteria([
            ['rank', false],
            ['id', false],
        ]);
        return { watched: watchRebuild(dynamic), consumer, name };
    };

    // ONE DynamicView PER VIEW — two, or fifty. The rest: `lokijs.md`.
    const views = bindings.map(bound =>
        makeView(bound.group, bound.group, bound.consumer)
    );

    let dirty = false;
    const mark = (): void => {
        dirty = true;
    };
    rows.on('insert', mark);
    rows.on('update', mark);
    // `removeBatchByPositions` only emits `delete` when the collection's
    // listener list holds more than the internal changes-API one it registers
    // for itself, so this line is what makes a batch removal observable at all.
    rows.on('delete', mark);

    // Reused across writes so the batching itself allocates nothing per call.
    const inserts: TLokiDoc[] = [];
    const updates: TLokiDoc[] = [];
    const removals: TLokiDoc[] = [];

    // THE CELL WIRING, empty until `pin`. The rest: `lokijs.md`.
    const pinned: TLokiDoc[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };
    const labelText: string[] = [];
    const noteText: string[] = [];
    // The FIRST TWO consumers of this wiring — A and B under `bind`. CAPTURED,
    // not read out of `views` inside a render: `pin` empties that list. The
    // targeted-delivery script is never bound per group.
    const labelConsumer = views[0].consumer;
    const noteConsumer = views[1].consumer;

    const renderCells = (): void => {
        for (let i = 0; i < pinned.length; i++) {
            labelText[i] = pinned[i].label;
            noteText[i] = pinned[i].note;
        }
        deliverCells(labelConsumer, cells, labelText);
        deliverCells(noteConsumer, cells, noteText);
    };

    const renderViews = (): void => {
        for (let i = 0; i < views.length; i++) {
            const state = views[i];
            if (!rebuiltNow(state.watched)) continue;
            deliver(state.consumer, state.watched.view.data(), view.window);
        }
    };

    const renderPinned = (): void => {
        if (!dirty) return;
        dirty = false;
        renderCells();
    };

    /** Re-pointed once, by `pin`. */
    let render = renderViews;

    return {
        // `insert` throws on a duplicate unique key, so an upsert here IS a lookup per
        // row. The rest: `lokijs.md`.
        write: incoming => {
            inserts.length = 0;
            updates.length = 0;
            for (let i = 0; i < incoming.length; i++) {
                const row = incoming[i];
                const held = rows.by('id', row.id);
                if (held === undefined) {
                    inserts.push({ ...row });
                    continue;
                }
                held.group = row.group;
                held.rank = row.rank;
                held.label = row.label;
                held.note = row.note;
                updates.push(held);
            }
            if (inserts.length > 0) rows.insert(inserts);
            if (updates.length > 0) rows.update(updates);
        },
        // Look each id up, then hand the whole batch to `remove`: an array reaches
        // `removeBatch`, which translates documents to positions once and notifies each
        // DynamicView with the whole set. The rest: `lokijs.md`.
        remove: ids => {
            removals.length = 0;
            for (let i = 0; i < ids.length; i++) {
                const doc = rows.by('id', ids[i]);
                if (doc !== undefined) removals.push(doc);
            }
            if (removals.length > 0) rows.remove(removals);
        },
        // Mutate the stored document, then hand it back to `update` — the idiom
        // the LokiJS collection docs use, and what re-runs the view filters for
        // that document.
        patchLabel: (id, label) => {
            const doc = rows.by('id', id);
            if (doc === undefined) return;
            doc.label = label;
            rows.update(doc);
        },
        // `update` is document-level: LokiJS cannot be told which field moved,
        // so a write to a column no view mentions marks this adapter dirty
        // exactly as a rendered column would.
        patchNote: (id, note) => {
            const doc = rows.by('id', id);
            if (doc === undefined) return;
            doc.note = note;
            rows.update(doc);
        },
        setGroup: (id, group) => {
            const doc = rows.by('id', id);
            if (doc === undefined) return;
            doc.group = group;
            rows.update(doc);
        },
        setRank: (id, rank) => {
            const doc = rows.by('id', id);
            if (doc === undefined) return;
            doc.rank = rank;
            rows.update(doc);
        },
        frame: frameDirect,
        // Each view LokiJS dirtied is re-sorted and delivered; a view it left clean
        // returns from `performSortPhase` at once. The rest: `lokijs.md`.
        settle: () => render(),
        // THE DOCUMENTS, RESOLVED ONCE out of the unique index — the same `by('id', …)`
        // hash hit each point write performs, paid once. The rest: `lokijs.md`.
        pin: config => {
            cells = config;
            pinned.length = 0;
            for (let i = 0; i < config.ids.length; i++) {
                const doc = rows.by('id', config.ids[i]);
                if (doc !== undefined) pinned.push(doc);
            }
            labelText.length = pinned.length;
            noteText.length = pinned.length;
            for (const state of views) rows.removeDynamicView(state.name);
            views.length = 0;
            render = renderPinned;
            dirty = false;
            // Untimed: the state every sample starts from.
            renderCells();
        },
        // The same idiom as `patchLabel`, minus the lookup: `update` fires the
        // collection's `update` event exactly as it does there.
        patchPinnedLabel: (at, label) => {
            const doc = pinned[at];
            doc.label = label;
            rows.update(doc);
        },
        patchPinnedNote: (at, note) => {
            const doc = pinned[at];
            doc.note = note;
            rows.update(doc);
        },
        // THE COLLECTION AND NOT EITHER DynamicView, which is a group filter with a
        // window. Plain rows are built rather than handed over: `$loki` and `meta` are
        // the library's, not the dataset's.
        readAll: () =>
            rows.find({}).map(doc => ({
                id: doc.id,
                group: doc.group,
                rank: doc.rank,
                label: doc.label,
                note: doc.note,
            })),
        deliverableRows: () => undefined,
        // THE GROUP, ASKED OF LOKIJS. This adapter holds NO byGroup map: what groups
        // the rows is LokiJS, and `{ group }` is literally the filter each DynamicView
        // was created with. The rest: `lokijs.md`.
        groupOrder: group =>
            orderedIdsOfRows(
                rows.find({ group }).map(doc => ({
                    id: doc.id,
                    group: doc.group,
                    rank: doc.rank,
                    label: doc.label,
                    note: doc.note,
                }))
            ),
        dispose: () => {
            rows.removeListener('insert', mark);
            rows.removeListener('update', mark);
            rows.removeListener('delete', mark);
            // Whatever views are left: `pin` removes them itself and empties the
            // list, so this cannot ask Loki to remove one twice.
            for (const state of views) rows.removeDynamicView(state.name);
            views.length = 0;
            pinned.length = 0;
            labelText.length = 0;
            noteText.length = 0;
            db.removeCollection('rows');
        },
    };
};

// The same collection and the same unique index, with no DynamicViews at all, because a
// churn binding derives no view and a DynamicView LokiJS still holds is re-evaluated
// document by document on every write. The rest: `lokijs.md`.
const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    const db = new LokiDb('churn.db');
    const rows = db.addCollection('rows', collectionOptions('id'));

    let churnIds: readonly string[] = [];
    /** What each subscriber last read. */
    const churnRead: (string | undefined)[] = [];
    /** Per subscriber: the one body registered on both events. */
    const mounted: (TLokiListener | undefined)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    const inserts: TLokiDoc[] = [];
    const updates: TLokiDoc[] = [];
    const removals: TLokiDoc[] = [];

    /** Read back out of the unique index. */
    const labelAt = (at: number): string => {
        const doc = rows.by('id', churnIds[at]);
        return doc === undefined ? '' : doc.label;
    };

    /** Register one body on both events a source can move by. */
    const listen = (at: number, body: TLokiListener): void => {
        rows.on('update', body);
        rows.on('delete', body);
        mounted[at] = body;
    };

    return {
        write: incoming => {
            inserts.length = 0;
            updates.length = 0;
            for (let i = 0; i < incoming.length; i++) {
                const row = incoming[i];
                const held = rows.by('id', row.id);
                if (held === undefined) {
                    inserts.push({ ...row });
                    continue;
                }
                held.group = row.group;
                held.rank = row.rank;
                held.label = row.label;
                held.note = row.note;
                updates.push(held);
            }
            if (inserts.length > 0) rows.insert(inserts);
            if (updates.length > 0) rows.update(updates);
        },
        remove: ids => {
            removals.length = 0;
            for (let i = 0; i < ids.length; i++) {
                const doc = rows.by('id', ids[i]);
                if (doc !== undefined) removals.push(doc);
            }
            if (removals.length > 0) rows.remove(removals);
        },
        patchLabel: (id, label) => {
            const doc = rows.by('id', id);
            if (doc === undefined) return;
            doc.label = label;
            rows.update(doc);
        },
        patchNote: (id, note) => {
            const doc = rows.by('id', id);
            if (doc === undefined) return;
            doc.note = note;
            rows.update(doc);
        },
        setGroup: (id, group) => {
            const doc = rows.by('id', id);
            if (doc === undefined) return;
            doc.group = group;
            rows.update(doc);
        },
        setRank: (id, rank) => {
            const doc = rows.by('id', id);
            if (doc === undefined) return;
            doc.rank = rank;
            rows.update(doc);
        },
        // A churn binding derives no view and no churn script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame: frameDirect,
        // Every body has already run: the collection emitter is synchronous.
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
        readAll: () =>
            rows.find({}).map(doc => ({
                id: doc.id,
                group: doc.group,
                rank: doc.rank,
                label: doc.label,
                note: doc.note,
            })),
        deliverableRows: () => undefined,
        /** NOTHING TO READ: no view is derived and no DynamicView is created. */
        groupOrder: () => undefined,
        // NOTHING TO RESOLVE. The rest: `lokijs.md`.
        holdChurnRows: (ids, ranks) => {
            churnIds = ids;
            churnId = ids[0];
            churnRank = ranks[0];
            for (let i = 0; i < ids.length; i++) churnRead[i] = undefined;
        },
        mountOnRows: (at, from, count) => {
            if (count === 1) {
                const id = churnIds[from];
                listen(at, doc => {
                    if (doc === undefined || doc.id !== id) return;
                    churnWoke++;
                    churnRead[at] = doc.label;
                });
                churnRead[at] = labelAt(from);
                return;
            }
            const sources = new Set(churnIds.slice(from, from + count));
            const readSources = (): string => {
                let text = '';
                for (let i = from + count - 1; i >= from; i--) {
                    text = labelAt(i);
                }
                return text;
            };
            listen(at, doc => {
                if (doc === undefined || !sources.has(doc.id)) return;
                // Every source read — that is what a subscriber over many
                // sources derives — keeping the first one's label.
                const text = readSources();
                churnWoke++;
                churnRead[at] = text;
            });
            churnRead[at] = readSources();
        },
        mountOnColumn: declinedMount('lokijs', 'column'),
        mountOnChain: declinedMount('lokijs', 'chain'),
        mountOnDiamond: declinedMount('lokijs', 'diamond'),
        unmount: at => {
            const body = mounted[at];
            if (body === undefined) return;
            rows.removeListener('update', body);
            rows.removeListener('delete', body);
            mounted[at] = undefined;
            churnRead[at] = undefined;
        },
        dispose: () => {
            for (let i = 0; i < mounted.length; i++) {
                const body = mounted[i];
                if (body === undefined) continue;
                rows.removeListener('update', body);
                rows.removeListener('delete', body);
            }
            mounted.length = 0;
            churnRead.length = 0;
            db.removeCollection('rows');
        },
    };
};

const PAGED_GROUP_FILTER = 'group';

// THE SECOND PREDICATE IS `applyWhere`, LokiJS's own documented function filter, so the
// axis is evaluated inside the view's pipeline and not over its result. The rest:
// `lokijs.md`.
const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const db = new LokiDb('read.db');
    const rows = db.addCollection('rows', collectionOptions('id'));

    // Persistent because a scroll reads it clean, and a clean persistent `data()` is the kept `resultdata`, not a copy (lokijs.js:4653-4661).
    const paged = watchRebuild(
        rows
            .addDynamicView('paged', { persistent: true })
            .applyFind({ group: view.groupA }, PAGED_GROUP_FILTER)
            .applySortCriteria([
                ['rank', false],
                ['id', false],
            ])
    );

    const onAxis = watchRebuild(
        rows
            .addDynamicView('onAxis')
            .applyFind({ group: view.groupA })
            // The axis, inside the view's own pipeline.
            .applyWhere(doc => onSecondAxis(doc.id))
            .applySortCriteria([
                ['rank', false],
                ['id', false],
            ])
    );

    let offset = 0;
    let scrolled = false;

    const inserts: TLokiDoc[] = [];
    const updates: TLokiDoc[] = [];
    const removals: TLokiDoc[] = [];
    const found: TLokiDoc[] = [];

    return {
        write: incoming => {
            inserts.length = 0;
            updates.length = 0;
            for (let i = 0; i < incoming.length; i++) {
                const row = incoming[i];
                const held = rows.by('id', row.id);
                if (held === undefined) {
                    inserts.push({ ...row });
                    continue;
                }
                held.group = row.group;
                held.rank = row.rank;
                held.label = row.label;
                held.note = row.note;
                updates.push(held);
            }
            if (inserts.length > 0) rows.insert(inserts);
            if (updates.length > 0) rows.update(updates);
        },
        remove: ids => {
            removals.length = 0;
            for (let i = 0; i < ids.length; i++) {
                const doc = rows.by('id', ids[i]);
                if (doc !== undefined) removals.push(doc);
            }
            if (removals.length > 0) rows.remove(removals);
        },
        patchLabel: (id, label) => {
            const doc = rows.by('id', id);
            if (doc === undefined) return;
            doc.label = label;
            rows.update(doc);
        },
        patchNote: (id, note) => {
            const doc = rows.by('id', id);
            if (doc === undefined) return;
            doc.note = note;
            rows.update(doc);
        },
        setGroup: (id, group) => {
            const doc = rows.by('id', id);
            if (doc === undefined) return;
            doc.group = group;
            rows.update(doc);
        },
        setRank: (id, rank) => {
            const doc = rows.by('id', id);
            if (doc === undefined) return;
            doc.rank = rank;
            rows.update(doc);
        },
        // No read script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        // ONE `by('id', …)` PER KEY — a hash hit on the unique index, which is LokiJS's
        // own keyed read. Nothing is resolved in advance.
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const doc = rows.by('id', keys[from + i]);
                if (doc !== undefined) found.push(doc);
            }
            deliverPage(consumers.a, found, 0, count);
        },
        // ONE NUMBER. No document is written, so neither view is dirtied and view B
        // is not re-read; view A takes a different slice of the list the
        // DynamicView already maintains.
        scrollTo: to => {
            offset = to;
            scrolled = true;
        },
        // Replacing the filter by its uid re-runs the pipeline and marks the view sortDirty (lokijs.js:4533-4548, 4496-4523).
        switchGroup: group => {
            offset = 0;
            paged.view.applyFind({ group }, PAGED_GROUP_FILTER);
        },
        frame: frameDirect,
        settle: () => {
            if (rebuiltNow(paged) || scrolled) {
                deliverPage(consumers.a, paged.view.data(), offset, view.window);
            }
            if (rebuiltNow(onAxis)) {
                deliverPage(consumers.b, onAxis.view.data(), 0, view.window);
            }
            scrolled = false;
        },
        readAll: () =>
            rows.find({}).map(doc => ({
                id: doc.id,
                group: doc.group,
                rank: doc.rank,
                label: doc.label,
                note: doc.note,
            })),
        deliverableRows: () => undefined,
        groupOrder: group =>
            orderedIdsOfRows(
                rows.find({ group }).map(doc => ({
                    id: doc.id,
                    group: doc.group,
                    rank: doc.rank,
                    label: doc.label,
                    note: doc.note,
                }))
            ),
        dispose: () => {
            rows.removeDynamicView('paged');
            rows.removeDynamicView('onAxis');
            found.length = 0;
            db.removeCollection('rows');
        },
    };
};

// TWO ENTITY TYPES — THREE COLLECTIONS, which is what a LokiJS database is: a set of
// collections in one db. The rest: `lokijs.md`.
const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    const db = new LokiDb('bench.db');
    const rows = db.addCollection<TLokiDoc>('rows', collectionOptions('id'));
    const owners = db.addCollection<TLokiOwnerDoc>(
        'owners',
        collectionOptions('id')
    );
    // Unique on the COMPOSED address, so `writePair`'s probe is a hash hit and
    // no two distinct pairs can be filed at one key.
    const pairs = db.addCollection<TLokiPairDoc>('pairs', collectionOptions('key'));

    let config: TRelationConfig = {
        ids: [],
        ranks: [],
        owners: [],
        touched: [],
        names: [],
        seeds: [],
    };
    /** The owner documents the join script writes, by POSITION in `touched`. */
    const touchedDocs: TLokiOwnerDoc[] = [];
    /** The owner document each rendered line's name comes from, in `ids` order. */
    const rowOwnerDocs: (TLokiOwnerDoc | undefined)[] = [];
    /** The pair document each rendered line's mark comes from, in `ids` order. */
    const rowPairDocs: (TLokiPairDoc | undefined)[] = [];
    const nameText: string[] = [];
    const markText: string[] = [];
    let namesDirty = false;
    let marksDirty = false;

    const markNames = (): void => {
        namesDirty = true;
    };
    const markMarks = (): void => {
        marksDirty = true;
    };
    /** Whether `holdRelation` has put the listeners on the emitters. */
    let listening = false;

    const pairKey = (owner: string, row: string): string => `${owner} ${row}`;

    const renderNames = (): void => {
        for (let i = 0; i < rowOwnerDocs.length; i++) {
            const owner = rowOwnerDocs[i];
            nameText[i] = owner === undefined ? '' : owner.name;
        }
        deliverRelation(consumers.a, config, nameText);
    };

    const renderMarks = (): void => {
        for (let i = 0; i < rowPairDocs.length; i++) {
            const pair = rowPairDocs[i];
            markText[i] = pair === undefined ? '' : pair.mark;
        }
        deliverRelation(consumers.b, config, markText);
    };

    const inserts: TLokiDoc[] = [];
    const updates: TLokiDoc[] = [];
    const removals: TLokiDoc[] = [];

    return {
        write: incoming => {
            inserts.length = 0;
            updates.length = 0;
            for (let i = 0; i < incoming.length; i++) {
                const row = incoming[i];
                const held = rows.by('id', row.id);
                if (held === undefined) {
                    inserts.push({ ...row });
                    continue;
                }
                held.group = row.group;
                held.rank = row.rank;
                held.label = row.label;
                held.note = row.note;
                updates.push(held);
            }
            if (inserts.length > 0) rows.insert(inserts);
            if (updates.length > 0) rows.update(updates);
        },
        remove: ids => {
            removals.length = 0;
            for (let i = 0; i < ids.length; i++) {
                const doc = rows.by('id', ids[i]);
                if (doc !== undefined) removals.push(doc);
            }
            if (removals.length > 0) rows.remove(removals);
        },
        patchLabel: (id, label) => {
            const doc = rows.by('id', id);
            if (doc === undefined) return;
            doc.label = label;
            rows.update(doc);
        },
        patchNote: (id, note) => {
            const doc = rows.by('id', id);
            if (doc === undefined) return;
            doc.note = note;
            rows.update(doc);
        },
        setGroup: (id, group) => {
            const doc = rows.by('id', id);
            if (doc === undefined) return;
            doc.group = group;
            rows.update(doc);
        },
        setRank: (id, rank) => {
            const doc = rows.by('id', id);
            if (doc === undefined) return;
            doc.rank = rank;
            rows.update(doc);
        },
        // No relation script pins: the targeted-delivery script is a two-view
        // script and is bound by `bind`.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        // The second population, through the bulk `insert(array)` door. Copied, because
        // `insert` stamps `$loki` and `meta` onto what it is handed.
        writeOwners: incoming => {
            const docs: TLokiOwnerDoc[] = new Array(incoming.length);
            for (let i = 0; i < incoming.length; i++) {
                docs[i] = { id: incoming[i].id, name: incoming[i].name };
            }
            owners.insert(docs);
        },
        // EVERY DOCUMENT EITHER VIEW RENDERS, RESOLVED ONCE — the `by(…)` hit a keyed
        // write opens with — and the pair records inserted at their seeds, so every
        // timed step is a probe and an update rather than an insert. The rest:
        // `lokijs.md`.
        holdRelation: given => {
            config = given;
            nameText.length = given.ids.length;
            markText.length = given.ids.length;
            for (let at = 0; at < given.touched.length; at++) {
                const doc = owners.by('id', given.touched[at]);
                if (doc !== undefined) touchedDocs.push(doc);
            }
            const docs: TLokiPairDoc[] = new Array(given.ids.length);
            for (let i = 0; i < given.ids.length; i++) {
                const owner = given.owners[i];
                const row = given.ids[i];
                docs[i] = {
                    key: pairKey(owner, row),
                    owner,
                    row,
                    mark: given.seeds[i],
                };
            }
            pairs.insert(docs);
            for (let i = 0; i < given.ids.length; i++) {
                rowOwnerDocs.push(owners.by('id', given.owners[i]));
                rowPairDocs.push(pairs.by('key', docs[i].key));
            }
            owners.on('insert', markNames);
            owners.on('update', markNames);
            pairs.on('insert', markMarks);
            pairs.on('update', markMarks);
            listening = true;
            // Untimed: the state every sample starts from.
            renderNames();
            renderMarks();
        },
        // A FIELD WRITE AND `update`, on a document resolved once. It marks the owners
        // collection alone, so the pair view is not re-read.
        patchOwnerName: (at, name) => {
            const doc = touchedDocs[at];
            doc.name = name;
            owners.update(doc);
        },
        // COMPOSE THE ADDRESS, HIT THE UNIQUE INDEX, WRITE THE MARK. The string is
        // built fresh every call: caching eight of them would make the row a
        // measurement of an array read.
        writePair: (at, mark) => {
            const doc = pairs.by(
                'key',
                pairKey(config.owners[at], config.ids[at])
            );
            if (doc === undefined) return;
            doc.mark = mark;
            pairs.update(doc);
        },
        frame: frameDirect,
        // Each view is re-read only when ITS OWN collection emitter fired.
        settle: () => {
            if (namesDirty) {
                namesDirty = false;
                renderNames();
            }
            if (marksDirty) {
                marksDirty = false;
                renderMarks();
            }
        },
        readAll: () =>
            rows.find({}).map(doc => ({
                id: doc.id,
                group: doc.group,
                rank: doc.rank,
                label: doc.label,
                note: doc.note,
            })),
        deliverableRows: () => undefined,
        /** NOTHING TO READ: no window, no group, no sort, no DynamicView. */
        groupOrder: () => undefined,
        readOwners: () =>
            owners.find({}).map(doc => ({ id: doc.id, name: doc.name })),
        // EVERY PAIR RECORD, WITH THE ADDRESS READ OUT OF ITS OWN FIELDS and not out of
        // `key` — that field is this file's own composition, so answering from it would
        // make the audit agree with whatever the composition did.
        readPairs: () =>
            pairs.find({}).map(doc => ({
                owner: doc.owner,
                row: doc.row,
                mark: doc.mark,
            })),
        dispose: () => {
            // Guarded: LokiJS's `removeListener` splices at `indexOf`, and an
            // `indexOf` of -1 splices the LAST listener off instead.
            if (listening) {
                listening = false;
                owners.removeListener('insert', markNames);
                owners.removeListener('update', markNames);
                pairs.removeListener('insert', markMarks);
                pairs.removeListener('update', markMarks);
            }
            touchedDocs.length = 0;
            rowOwnerDocs.length = 0;
            rowPairDocs.length = 0;
            nameText.length = 0;
            markText.length = 0;
            db.removeCollection('rows');
            db.removeCollection('owners');
            db.removeCollection('pairs');
        },
    };
};


/* ── one value, one subscriber, and a second value beside it ───────────── */

type TLokiValueDoc = { id: string; value: string; $loki?: number };
type TLokiValueListener = (doc?: TLokiValueDoc) => void;

// LOKIJS HAS NO SCALAR AND NO PER-VALUE SUBSCRIPTION, and both facts are the row. The
// rest: `lokijs.md`.
const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
    const db = new LokiDb('single.db');
    const values = db.addCollection<TLokiValueDoc>('values', collectionOptions('id'));
    const mounted: TLokiValueListener[] = [];
    let name = '';
    let bystanderName = '';
    let read = '';
    let readBystander = '';
    let woke = false;
    let wokeBystander = false;

    const valueOf = (id: string): string => {
        const doc = values.by('id', id);
        return doc === undefined ? '' : doc.value;
    };

    const listen = (body: TLokiValueListener): void => {
        values.on('update', body);
        mounted.push(body);
    };

    return {
        ...noRowStore('lokijs'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            values.insert([
                { id: name, value: config.seeds[0] },
                { id: bystanderName, value: config.seeds[1] },
            ]);
            read = config.seeds[0];
            readBystander = config.seeds[1];
            listen(doc => {
                if (doc === undefined || doc.id !== name) return;
                read = doc.value;
                woke = true;
            });
            listen(doc => {
                if (doc === undefined || doc.id !== bystanderName) return;
                readBystander = doc.value;
                wokeBystander = true;
            });
            deliverSingle(consumers.a, name, read);
            deliverSingle(consumers.b, bystanderName, readBystander);
        },
        writeSingle: next => {
            const doc = values.by('id', name);
            if (doc === undefined) return;
            doc.value = next;
            values.update(doc);
        },
        readSingle: () => valueOf(name),
        readBystander: () => valueOf(bystanderName),
        frame: frameDirect,
        // Every body has already run: the collection emitter is synchronous.
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
            for (let i = 0; i < mounted.length; i++) {
                values.removeListener('update', mounted[i]);
            }
            mounted.length = 0;
            db.removeCollection('values');
        },
    };
};

export const lokiAdapter: TAdapter = {
    name: 'lokijs',
    version: '1.5.12',
    docs: 'https://techfort.github.io/LokiJS/DynamicView.html',
    departure:
        "Loki's own view signal on a passive view is a throttled setTimeout 'rebuild', which never " +
        'fires in a harness that never yields; settle therefore calls each DynamicView\'s ' +
        "performSortPhase(), which emits 'rebuild' synchronously only for a view LokiJS dirtied, so " +
        'which views render is still LokiJS\'s decision, but a settle per step turns a design that ' +
        'coalesces on purpose into a view re-sort per step. LokiJS has no notification batch (its ' +
        'collection transaction is a rollback snapshot), so a frame runs its writes directly. No ' +
        'binary index is built, though the cited indexing guide recommends one. On the churn rows ' +
        'the collection emitter means there is NO PER-SOURCE subscription: every subscriber runs on ' +
        'every write and tests the document for itself. The column, chain and diamond shapes are ' +
        "declined. A view switch replaces the paged DynamicView's group filter by its uid " +
        '(applyFind), which re-runs that view over the whole collection.',
    admission:
        'the row columns live in LokiJS documents inside its own collection, which is also what ' +
        'groups and orders them, and the change signal is the collection emitter firing insert, ' +
        'update and delete synchronously on every write.',

    reads: readShapes((consumers, view, plan) =>
        bindReadStore(consumers, view, plan)
    ),
    /**
     * TWO SHAPES OF FIVE, one decline per shape.
     */
    churn: churnShapes(consumers => bindChurnStore(consumers.a), {
        column:
            'LokiJS HAS NO COLUMN IDENTITY. `update` is document-level: the event carries the ' +
            'document, and with cloning off the "old" document it also carries is THE SAME OBJECT, ' +
            'so nothing in the library can say which column moved. Telling them apart needs either a ' +
            'cloned collection with the adapter comparing old and new labels, or the adapter ' +
            'remembering the last label, and both are the adapter doing the library\'s job, which ' +
            'the B3 clause of churnColumn forbids. The row and wide shapes are supplied and ' +
            'unaffected.',
        chain:
            'LokiJS HAS NO DERIVED VALUE A SECOND DERIVATION CAN READ. A DynamicView is a filtered, ' +
            'sorted list over one collection and cannot take another view as its source, and the ' +
            'collection emitter has no per-source channel, so a mount would be the wide shape\'s ' +
            'collection listener with the depth levels re-run by hand inside its body, which the B3 ' +
            'clause of churnChain forbids: the adapter building the chain, not the library, and the ' +
            "wide shape's row printed under the chain's name. The row and wide shapes are supplied " +
            'and unaffected.',
        diamond:
            'LOKIJS HAS NO DERIVATION PRIMITIVE. Its derived structures are DynamicViews and ' +
            'Resultsets, filtered and sorted lists over ONE collection that cannot take a view as a ' +
            'source, and nothing in it computes a value from two others; the two branches and the ' +
            'join could only be functions this adapter calls by hand inside a collection listener, ' +
            'which the B3 clause of churnDiamond forbids: the adapter building the diamond, not the ' +
            'library. The row and wide shapes are supplied and unaffected.',
    }),
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
