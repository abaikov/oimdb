import {
    OIMChannelService,
    OIMDB,
    OIMDefaults,
    OIMEffectService,
    OIMSlotContentBucketServiceSetDriven,
    OIMSlotReleasePolicyNever,
    createOIMSingleEntityService,
    OIMSlotStoreServiceTreeDriven,
    createOIMComputedService,
    createOIMComputedServiceSorted,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
    createOIMIndexService,
    createOIMIndexServiceSortedArrayDriven,
    oimInsertEntityWithCopy,
    oimSameValueZeroGuard,
} from '../../../core/dist/index.js';
import type {
    IOIMSlotReleasePolicy,
    OIMColumnOwnerPushDriven,
    OIMComputedService,
    OIMSlotCollectionService,
    OIMSlotContentEntityService,
    TOIMBucketSlot,
    TOIMBucketSlotsSetStore,
    TOIMBucketSlotsSortedArrayStore,
    TOIMColumnSlot,
    TOIMComputedSlot,
    TOIMComputedStoreSlot,
    TOIMEffect,
    TOIMEntitySlot,
    TOIMEntityColumnName,
    TOIMIndexKeyOptions,
    TOIMSortColumn,
    TOIMStoreKey,
    TOIMStoreSlot,
    TOIMSlot,
    TOIMSlotStoreTree,
} from '../../../core/dist/index.js';
import type { BenchConsumer, TConsumers, TViewBinding } from '../harness/consumer';
import { chainLevelOf, diamondJoinOf, diamondLeftOf, diamondRightOf } from '../harness/derivations';
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
import { churnShapes, noRowStore, readShapes } from '../harness/types';

// What the adapter builds out of exported parts and why: `packages/bench/src/adapters/oimdb.md`.

type TRowSlot = TOIMEntitySlot<TRow, TOIMStoreKey>;
type TRowColumnName = 'rank' | 'label' | 'note';
type TRowStore = Map<TOIMStoreKey, TRowSlot>;
type TEntityService<TKey, TEntity extends object, TStore, TColumnName extends string = TOIMEntityColumnName<TEntity>> = OIMSlotCollectionService<
    TKey, TOIMEntitySlot<TEntity, TKey>, TStore, OIMSlotContentEntityService<TEntity, TKey, TStore, TColumnName>,
    TColumnName, TOIMColumnSlot, OIMColumnOwnerPushDriven, Partial<TEntity>
>;
type TRowEntityService = TEntityService<TOIMStoreKey, TRow, TRowStore, TRowColumnName>;
type TRowStoreSlot = TOIMStoreSlot<TRowStore, TRowSlot, Partial<TRow>>;
const ROW_COLUMNS: readonly TRowColumnName[] = ['rank', 'label', 'note'];
type TGroupSlots = TOIMBucketSlotsSetStore<TOIMEntitySlot<TRow>>;
type TSortedGroupSlots = TOIMBucketSlotsSortedArrayStore<TOIMEntitySlot<TRow>>;
type TSortedGroupIndexStore = Map<TOIMStoreKey, TOIMBucketSlot<TSortedGroupSlots, TOIMStoreKey>>;
type TGroupOrderComputedSlot = TOIMComputedSlot<readonly TOIMEntitySlot<TRow>[], TOIMStoreKey>;

type TGroupOrders<TGroupOrder, TOrderedSlots> = {
    holdGroupOrder: (group: string) => TGroupOrder;
    unholdGroupOrder: (groupOrder: TGroupOrder) => void;
    readOrderedSlots: (groupOrder: TGroupOrder) => TOrderedSlots;
    getOrderedSlotCount: (orderedSlots: TOrderedSlots) => number;
    getOrderedSlotAt: (orderedSlots: TOrderedSlots, at: number) => TRowSlot;
    watchGroupOrder: (db: OIMDB, groupOrder: TGroupOrder, body: () => void) => TOIMEffect;
};

type TGroupOrderStrategy<TGroupOrder, TOrderedSlots> = {
    createGroupOrders: (
        db: OIMDB,
        entityService: TRowEntityService,
        entityStoreSlot: TRowStoreSlot,
        indexKeyOptions: TOIMIndexKeyOptions<TOIMStoreKey, TRow>,
        slotReleasePolicy?: IOIMSlotReleasePolicy,
    ) => TGroupOrders<TGroupOrder, TOrderedSlots>;
};

const GROUP_COLUMN: TOIMIndexKeyOptions<TOIMStoreKey, TRow> = { columns: ['group'] };
const LABEL_COLUMN: readonly 'label'[] = ['label'];
const NOTE_COLUMN: readonly 'note'[] = ['note'];

type TOwnerSlot = TOIMEntitySlot<TOwner, TOIMStoreKey>;
type TPairKey = readonly TOIMEntitySlot[];
type TPairEntity = { owner: TOwnerSlot; row: TRowSlot; mark: string };
type TPairSlot = TOIMEntitySlot<TPairEntity, TPairKey>;

const NO_ROOT_SLOTS: readonly TOIMSlot[] = Object.freeze([]);
const NO_SOURCE_COMPUTEDS: readonly TOIMComputedSlot[] = Object.freeze([]);

const BY_RANK_THEN_ID: readonly TOIMSortColumn<TRow>[] = [
    { column: 'rank', direction: 'asc' },
    { column: 'id', direction: 'asc' },
];

// In place, so the stored object keeps its identity for its whole life and
// `slot.entity` IS that object — what `readAll` and the pinned reads depend on.
const createRowEntityService = (db: OIMDB): TRowEntityService =>
    createOIMEntityService<TRow, TRowColumnName>(db, { keyOf: row => row.id, columnNames: ROW_COLUMNS });

// THE GROUP FILING IS THE LIBRARY'S: on a write that changed one of the index's
// columns the collection reads the key again, compares it with the key the row was
// last filed under, and moves the row between buckets itself.
const GROUP_ORDER_SORTED_AT_READ: TGroupOrderStrategy<TGroupOrderComputedSlot, readonly TOIMEntitySlot<TRow>[]> = {
    createGroupOrders: (db, entityService, entityStoreSlot, indexKeyOptions, slotReleasePolicy) => {
        const indexService = createOIMIndexService<
            TRow, TOIMStoreKey, readonly TOIMEntityColumnName<TRow>[], TOIMStoreKey, TRowStore, TGroupSlots,
            OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TRow>>
        >(db, {
            ...indexKeyOptions,
            entityService,
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TRow>>(),
            slotReleasePolicy,
        });
        const indexStoreSlot = indexService.createIndexStoreSlot(entityStoreSlot);
        const sortedComputedService = createOIMComputedServiceSorted<TOIMStoreKey, TRow, TGroupSlots, TOIMStoreKey, TRowStore>({
            indexService,
            sortColumns: BY_RANK_THEN_ID,
            slotReleasePolicy,
        });
        const sortedComputedStoreSlot = sortedComputedService.createSortedStoreSlot(indexStoreSlot);
        const computedCollectionService = sortedComputedService.computedCollectionService;
        return {
            holdGroupOrder: group => computedCollectionService.holdSlotByKey(sortedComputedStoreSlot, group),
            unholdGroupOrder: groupOrder => {
                groupOrder.owner.unholdSlot(groupOrder);
            },
            readOrderedSlots: groupOrder => computedCollectionService.slotContentService.getValueForSlot(groupOrder),
            getOrderedSlotCount: orderedSlots => orderedSlots.length,
            getOrderedSlotAt: (orderedSlots, at) => orderedSlots[at] as TRowSlot,
            watchGroupOrder: (db, groupOrder, body) =>
                OIMEffectService.INSTANCE.createEffect(db, NO_ROOT_SLOTS, [groupOrder], body),
        };
    },
};

const createGroupOrdersSortedAtWrite = (
    db: OIMDB,
    entityService: TRowEntityService,
    entityStoreSlot: TRowStoreSlot,
    indexKeyOptions: TOIMIndexKeyOptions<TOIMStoreKey, TRow>,
    slotReleasePolicy?: IOIMSlotReleasePolicy,
) => {
    const indexService = createOIMIndexServiceSortedArrayDriven<
        TRow, TOIMStoreKey, readonly TOIMEntityColumnName<TRow>[], TOIMStoreKey, TRowStore, TSortedGroupIndexStore
    >(db, {
        ...indexKeyOptions,
        entityService,
        sortColumns: BY_RANK_THEN_ID,
        slotReleasePolicy,
    });
    const indexStoreSlot = indexService.createIndexStoreSlot(entityStoreSlot);
    const bucketContentService = indexService.slotContentService;
    type TSortedIndexBucketSlot = ReturnType<typeof indexService.holdSlotByKey>;
    const groupOrders: TGroupOrders<TSortedIndexBucketSlot, TSortedIndexBucketSlot> = {
        holdGroupOrder: group => indexService.holdSlotByKey(indexStoreSlot, group),
        unholdGroupOrder: bucketSlot => {
            bucketSlot.owner.unholdSlot(bucketSlot);
        },
        readOrderedSlots: bucketSlot => bucketSlot,
        getOrderedSlotCount: bucketSlot => bucketContentService.getBucketMemberSlotCount(bucketSlot),
        getOrderedSlotAt: (bucketSlot, at) => bucketContentService.getBucketMemberSlotAt(bucketSlot, at) as TRowSlot,
        watchGroupOrder: (db, bucketSlot, body) =>
            OIMEffectService.INSTANCE.createEffect(db, [bucketSlot], NO_SOURCE_COMPUTEDS, body),
    };
    return groupOrders;
};

const GROUP_ORDER_SORTED_AT_WRITE = { createGroupOrders: createGroupOrdersSortedAtWrite };

const groupOrderOf = <TGroupOrder, TOrderedSlots>(
    groupOrders: TGroupOrders<TGroupOrder, TOrderedSlots>,
    group: string,
): readonly string[] => {
    const groupOrder = groupOrders.holdGroupOrder(group);
    const orderedSlots = groupOrders.readOrderedSlots(groupOrder);
    const orderedSlotCount = groupOrders.getOrderedSlotCount(orderedSlots);
    const entities: TRow[] = [];
    for (let at = 0; at < orderedSlotCount; at++) {
        const entity = groupOrders.getOrderedSlotAt(orderedSlots, at).entity;
        if (entity !== undefined) entities.push(entity);
    }
    groupOrders.unholdGroupOrder(groupOrder);
    return orderedIdsOfRows(entities);
};

// A slot whose `entity` is `undefined` is an IDENTITY WITHOUT A VALUE — reserved
// by a hold and never written, or emptied by a removal and still held. Neither
// is a row, and the audit compares rows.
const readEntitiesOf = <TKey, TEntity extends object, TStore>(
    entityService: Pick<TEntityService<TKey, TEntity, TStore>, 'getSlots'>,
    entityStoreSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>, Partial<TEntity>>,
): TEntity[] => {
    const held: TEntity[] = [];
    for (const slot of entityService.getSlots(entityStoreSlot)) {
        const entity = slot.entity;
        if (entity !== undefined) held.push(entity);
    }
    return held;
};

type TRowWrites = Omit<
    TBinding,
    'pin' | 'patchPinnedLabel' | 'patchPinnedNote' | 'groupOrder' | 'dispose'
>;

const pinNothing: Pick<TBinding, 'pin' | 'patchPinnedLabel' | 'patchPinnedNote'> = {
    pin: () => undefined,
    patchPinnedLabel: () => undefined,
    patchPinnedNote: () => undefined,
};

const bindRowWrites = (
    db: OIMDB,
    entityService: TRowEntityService,
    entityStoreSlot: TRowStoreSlot,
    paint: () => void,
): TRowWrites => {
    const slotContentService = entityService.slotContentService;
    const channelSlot = db.defaultChannelSlot;
    let loaded = false;
    return {
        write: incoming => {
            if (loaded) {
                slotContentService.upsertEntities(entityStoreSlot, incoming);
                return;
            }
            loaded = true;
            slotContentService.insertEntities(entityStoreSlot, incoming);
        },
        // The engine takes the row OUT OF EVERY BUCKET HOLDING IT and then empties the
        // slot — that order, inside the library, is what keeps the index order from ever
        // being handed a row whose value has already gone.
        remove: ids => {
            const rowSlots: TRowSlot[] = [];
            for (let i = 0; i < ids.length; i++) {
                const rowSlot = entityService.findSlotByKey(entityStoreSlot, ids[i]);
                if (rowSlot !== undefined) rowSlots.push(rowSlot);
            }
            slotContentService.deleteEntities(entityStoreSlot, rowSlots);
        },
        patchLabel: (id, label) => {
            const rowSlot = entityService.getSlotByKey(entityStoreSlot, id);
            const entity = rowSlot.entity;
            if (entity === undefined) return;
            entity.label = label;
            slotContentService.markEntityChanged(rowSlot, LABEL_COLUMN);
        },
        patchNote: (id, note) => {
            const rowSlot = entityService.getSlotByKey(entityStoreSlot, id);
            const entity = rowSlot.entity;
            if (entity === undefined) return;
            entity.note = note;
            slotContentService.markEntityChanged(rowSlot, NOTE_COLUMN);
        },
        // The column the INDEX keys on, so the move between buckets is the write's.
        setGroup: (id, group) => {
            slotContentService.updateEntityColumn(entityService.getSlotByKey(entityStoreSlot, id), 'group', group);
        },
        setRank: (id, rank) => {
            slotContentService.updateEntityColumn(entityService.getSlotByKey(entityStoreSlot, id), 'rank', rank);
        },
        frame: run => {
            OIMChannelService.INSTANCE.openSubframe(channelSlot);
            try {
                run();
            } finally {
                OIMChannelService.INSTANCE.closeSubframe(channelSlot);
            }
        },
        settle: () => {
            db.flush();
            paint();
        },
        readAll: () => readEntitiesOf(entityService, entityStoreSlot),
        deliverableRows: () => undefined,
    };
};

type TWindowView<TGroupOrder, TOrderedSlots> = {
    groupOrders: TGroupOrders<TGroupOrder, TOrderedSlots>;
    groupOrder: TGroupOrder;
    consumer: BenchConsumer;
    /** Where this view's window starts. Moved by `scrollTo` and `switchGroup`, on the read binding's view A only. */
    offset: number;
    /** Set by the order's own effect: the window may have moved. */
    shapeMoved: boolean;
    /** Set by anything: something this view shows has changed. */
    pending: boolean;
    shape: TOIMEffect;
    watching: TOIMEffect | undefined;
    watchedRows: Map<TRowSlot, TWatchedRow>;
    watchedSlots: TRowSlot[];
    resyncCount: number;
    /** The rows handed to the consumer — reused, so a render allocates nothing. */
    visible: TRow[];
    markPending: () => void;
    markShapeMoved: () => void;
};

type TWatchedRow = { readonly columnGroupSlot: TOIMColumnSlot; seenInResync: number };

const createWindowViews = <TGroupOrder, TOrderedSlots>(
    db: OIMDB,
    entityService: TRowEntityService,
    windowSize: number,
    deliverView: (consumer: BenchConsumer, visible: readonly TRow[]) => void
) => {
    type TView = TWindowView<TGroupOrder, TOrderedSlots>;
    const effectService = OIMEffectService.INSTANCE;
    const renderedColumns = entityService.getColumnGroup(['rank', 'label']);


    const watchShape = (state: TView): TOIMEffect =>
        state.groupOrders.watchGroupOrder(db, state.groupOrder, state.markShapeMoved);

    const makeView = (groupOrders: TGroupOrders<TGroupOrder, TOrderedSlots>, group: string, consumer: BenchConsumer): TView => {
        const state: Omit<TView, 'shape'> & { shape?: TOIMEffect } = {
            groupOrders,
            groupOrder: groupOrders.holdGroupOrder(group),
            consumer,
            offset: 0,
            shapeMoved: true,
            pending: false,
            watching: undefined,
            watchedRows: new Map(),
            watchedSlots: [],
            resyncCount: 0,
            visible: [],
            markPending: () => {
                state.pending = true;
            },
            markShapeMoved: () => {
                state.shapeMoved = true;
                state.pending = true;
            },
        };
        state.shape = watchShape(state as TView);
        return state as TView;
    };

    const resync = (state: TView): void => {
        const visible = state.visible;
        if (visible.length !== 0) visible.length = 0;
        const resyncCount = ++state.resyncCount;
        const watchedRows = state.watchedRows;
        const groupOrders = state.groupOrders;
        const orderedSlots = groupOrders.readOrderedSlots(state.groupOrder);
        const orderedSlotCount = groupOrders.getOrderedSlotCount(orderedSlots);
        const nextWatchedSlots: TRowSlot[] = [];
        const watchedColumnGroupSlots: TOIMColumnSlot[] = [];
        for (let at = state.offset; at < orderedSlotCount && visible.length < windowSize; at++) {
            const slot = groupOrders.getOrderedSlotAt(orderedSlots, at);
            const entity = slot.entity;
            if (entity === undefined) continue;
            visible.push(entity);
            let watchedRow = watchedRows.get(slot);
            if (watchedRow === undefined) {
                watchedRow = { columnGroupSlot: entityService.holdColumnGroup(slot, renderedColumns), seenInResync: resyncCount };
                watchedRows.set(slot, watchedRow);
            } else {
                watchedRow.seenInResync = resyncCount;
            }
            nextWatchedSlots.push(slot);
            watchedColumnGroupSlots.push(watchedRow.columnGroupSlot);
        }
        if (state.watching !== undefined) effectService.disposeEffect(state.watching);
        const prevWatchedSlots = state.watchedSlots;
        for (let i = 0; i < prevWatchedSlots.length; i++) {
            const slot = prevWatchedSlots[i];
            const watchedRow = watchedRows.get(slot);
            if (watchedRow === undefined || watchedRow.seenInResync === resyncCount) continue;
            entityService.unholdColumn(watchedRow.columnGroupSlot);
            watchedRows.delete(slot);
        }
        state.watchedSlots = nextWatchedSlots;
        state.watching = effectService.createEffect(db, watchedColumnGroupSlots, NO_SOURCE_COMPUTEDS, state.markPending);
    };

    const refresh = (state: TView): void => {
        if (state.visible.length !== 0) state.visible.length = 0;
        const groupOrders = state.groupOrders;
        const orderedSlots = groupOrders.readOrderedSlots(state.groupOrder);
        const orderedSlotCount = groupOrders.getOrderedSlotCount(orderedSlots);
        for (let at = state.offset; at < orderedSlotCount && state.visible.length < windowSize; at++) {
            const entity = groupOrders.getOrderedSlotAt(orderedSlots, at).entity;
            if (entity !== undefined) state.visible.push(entity);
        }
    };

    const dropView = (state: TView): void => {
        effectService.disposeEffect(state.shape);
        if (state.watching !== undefined) effectService.disposeEffect(state.watching);
        state.watching = undefined;
        for (const watchedRow of state.watchedRows.values()) entityService.unholdColumn(watchedRow.columnGroupSlot);
        state.watchedRows.clear();
        state.watchedSlots = [];
        state.visible.length = 0;
    };

    const paint = (views: readonly TView[]): void => {
        for (let i = 0; i < views.length; i++) {
            const state = views[i];
            if (!state.pending) continue;
            state.pending = false;
            if (state.shapeMoved) {
                state.shapeMoved = false;
                resync(state);
            } else {
                refresh(state);
            }
            deliverView(state.consumer, state.visible);
        }
    };

    return { makeView, watchShape, dropView, paint };
};

const bindViews = <TGroupOrder, TOrderedSlots>(
    groupOrderStrategy: TGroupOrderStrategy<TGroupOrder, TOrderedSlots>,
    bindings: readonly TViewBinding[],
    view: TViewConfig,
): TBinding => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const entityService = createRowEntityService(db);
    const entityStoreSlot = entityService.createStoreSlot(db);
    const orderByGroup = groupOrderStrategy.createGroupOrders(db, entityService, entityStoreSlot, GROUP_COLUMN);
    const windows = createWindowViews<TGroupOrder, TOrderedSlots>(db, entityService, view.window, (consumer, visible) => {
        deliver(consumer, visible, view.window);
    });
    const views = bindings.map(bound => windows.makeView(orderByGroup, bound.group, bound.consumer));

    /* ── the cell wiring, empty until `pin` ─────────────────────────────── */

    // The SLOTS, not the ids: pay the lookup where the relationship is formed, never
    // where it is used. That is the principle this row exists to make measurable.
    const pinned: TRowSlot[] = [];
    const cellEffects: TOIMEffect[] = [];
    const cellColumnSlots: TOIMColumnSlot[] = [];
    let cellsWired = false;
    let cells: TCellConfig = { ids: [], ranks: [] };
    const labelText: string[] = [];
    const noteText: string[] = [];
    let labelPending = false;
    let notePending = false;
    const labelConsumer = bindings[0].consumer;
    const noteConsumer = bindings[1].consumer;

    const renderLabels = (): void => {
        for (let i = 0; i < pinned.length; i++) {
            const entity = pinned[i].entity;
            labelText[i] = entity === undefined ? '' : entity.label;
        }
        deliverCells(labelConsumer, cells, labelText);
    };

    const renderNotes = (): void => {
        for (let i = 0; i < pinned.length; i++) {
            const entity = pinned[i].entity;
            noteText[i] = entity === undefined ? '' : entity.note;
        }
        deliverCells(noteConsumer, cells, noteText);
    };

    let windowsWired = true;

    const dropWindowWiring = (): void => {
        if (!windowsWired) return;
        windowsWired = false;
        for (const state of views) windows.dropView(state);
    };

    const paint = (): void => {
        if (windowsWired) windows.paint(views);
        if (!cellsWired) return;
        if (labelPending) {
            labelPending = false;
            renderLabels();
        }
        if (notePending) {
            notePending = false;
            renderNotes();
        }
    };

    return {
        ...bindRowWrites(db, entityService, entityStoreSlot, paint),
        groupOrder: group => groupOrderOf(orderByGroup, group),
        pin: config => {
            dropWindowWiring();
            cells = config;
            for (let i = 0; i < config.ids.length; i++) pinned.push(entityService.holdSlotByKey(entityStoreSlot, config.ids[i]));
            labelText.length = pinned.length;
            noteText.length = pinned.length;
            for (let i = 0; i < pinned.length; i++) {
                const slot = pinned[i];
                const labelColumnSlot = entityService.holdColumn(slot, 'label');
                const noteColumnSlot = entityService.holdColumn(slot, 'note');
                cellColumnSlots.push(labelColumnSlot, noteColumnSlot);
                cellEffects.push(
                    effectService.createEffect(db, [labelColumnSlot], [], () => {
                        labelPending = true;
                    })
                );
                cellEffects.push(
                    effectService.createEffect(db, [noteColumnSlot], [], () => {
                        notePending = true;
                    })
                );
            }
            cellsWired = true;
            // Untimed: the state every sample starts from.
            renderLabels();
            renderNotes();
        },
        patchPinnedLabel: (at, label) => {
            const rowSlot = pinned[at];
            const entity = rowSlot.entity;
            if (entity === undefined) return;
            entity.label = label;
            entityService.slotContentService.markEntityChanged(rowSlot, LABEL_COLUMN);
        },
        // A COLUMN OF A ROW IS ITS OWN IDENTITY, so a note write does not reach the
        // label handler at all.
        patchPinnedNote: (at, note) => {
            const rowSlot = pinned[at];
            const entity = rowSlot.entity;
            if (entity === undefined) return;
            entity.note = note;
            entityService.slotContentService.markEntityChanged(rowSlot, NOTE_COLUMN);
        },
        dispose: () => {
            OIMChannelService.INSTANCE.dropChannelSlot(db.defaultChannelSlot);
            windowsWired = false;
            cellsWired = false;
            labelPending = false;
            notePending = false;
            cellEffects.length = 0;
            cellColumnSlots.length = 0;
            pinned.length = 0;
            labelText.length = 0;
            noteText.length = 0;
            views.length = 0;
        },
    };
};

const labelOf = (slot: TRowSlot): string => {
    const entity = slot.entity;
    return entity === undefined ? '' : entity.label;
};

type TChurnDerivationSlot = TOIMComputedSlot<string, number>;
type TChurnComputedService = OIMComputedService<number, string, Map<number, TChurnDerivationSlot>>;
type TChurnComputedStoreSlot = TOIMComputedStoreSlot<Map<number, TChurnDerivationSlot>, string, number>;

const CHAIN_KEYS_PER_SUBSCRIBER = 256;
const DIAMOND_KEYS_PER_SUBSCRIBER = 3;
const DIAMOND_LEFT = 0;
const DIAMOND_JOIN = 2;

const joinedLabelsOf = (rootSlots: readonly TRowSlot[]): string => {
    let text = labelOf(rootSlots[0]);
    for (let i = 1; i < rootSlots.length; i++) text = `${text},${labelOf(rootSlots[i])}`;
    return text;
};

type TChurnMounts = {
    mountOnChain: (at: number, rootSlots: readonly TRowSlot[], depth: number) => string;
    mountOnDiamond: (at: number, rootSlots: readonly TRowSlot[]) => string;
};

const createChurnMounts = (
    db: OIMDB,
    readHead: (at: number, value: string) => void,
    effects: (TOIMEffect | undefined)[],
): TChurnMounts => {
    const rootSlotsBySubscriber: (readonly TRowSlot[])[] = [];

    const chainComputedService: TChurnComputedService = createOIMComputedService<number, string, Map<number, TChurnDerivationSlot>>({
        createSources: key => {
            const level = key % CHAIN_KEYS_PER_SUBSCRIBER;
            return level === 1
                ? { sourceSlots: rootSlotsBySubscriber[(key - level) / CHAIN_KEYS_PER_SUBSCRIBER] }
                : { sourceComputeds: [chainComputedService.computedCollectionService.getSlotByKey(chainComputedStoreSlot, key - 1)] };
        },
        derive: computedSlot => {
            const level = computedSlot.key % CHAIN_KEYS_PER_SUBSCRIBER;
            return level === 1
                ? chainLevelOf(joinedLabelsOf(computedSlot.sourceSlots as readonly TRowSlot[]), 1)
                : chainLevelOf(chainComputedService.computedCollectionService.slotContentService.getValueForSlot(computedSlot.sourceComputeds[0] as TChurnDerivationSlot), level);
        },
        sameValueGuard: oimSameValueZeroGuard,
    });
    const chainComputedStoreSlot: TChurnComputedStoreSlot = chainComputedService.createComputedStoreSlot(db);

    const diamondComputedService: TChurnComputedService = createOIMComputedService<number, string, Map<number, TChurnDerivationSlot>>({
        createSources: key => {
            const node = key % DIAMOND_KEYS_PER_SUBSCRIBER;
            const diamondCollectionService = diamondComputedService.computedCollectionService;
            return node === DIAMOND_JOIN
                ? { sourceComputeds: [diamondCollectionService.getSlotByKey(diamondComputedStoreSlot, key - 2), diamondCollectionService.getSlotByKey(diamondComputedStoreSlot, key - 1)] }
                : { sourceSlots: rootSlotsBySubscriber[(key - node) / DIAMOND_KEYS_PER_SUBSCRIBER] };
        },
        derive: computedSlot => {
            const node = computedSlot.key % DIAMOND_KEYS_PER_SUBSCRIBER;
            if (node === DIAMOND_JOIN) {
                const sourceComputeds = computedSlot.sourceComputeds;
                const computedValueService = diamondComputedService.computedCollectionService.slotContentService;
                return diamondJoinOf(
                    computedValueService.getValueForSlot(sourceComputeds[0] as TChurnDerivationSlot),
                    computedValueService.getValueForSlot(sourceComputeds[1] as TChurnDerivationSlot),
                );
            }
            const label = labelOf(computedSlot.sourceSlots[0] as TRowSlot);
            return node === DIAMOND_LEFT ? diamondLeftOf(label) : diamondRightOf(label);
        },
        sameValueGuard: oimSameValueZeroGuard,
    });
    const diamondComputedStoreSlot: TChurnComputedStoreSlot = diamondComputedService.createComputedStoreSlot(db);

    const subscribeHead = (
        at: number,
        computedService: TChurnComputedService,
        computedStoreSlot: TChurnComputedStoreSlot,
        firstKey: number,
        keyCount: number,
    ): string => {
        const computedCollectionService = computedService.computedCollectionService;
        const computedValueService = computedCollectionService.slotContentService;
        const headKey = firstKey + keyCount - 1;
        for (let key = firstKey; key < headKey; key++) computedCollectionService.holdSlotByKey(computedStoreSlot, key);
        const head = computedCollectionService.holdSlotByKey(computedStoreSlot, headKey);
        effects[at] = OIMEffectService.INSTANCE.createEffect(db, NO_ROOT_SLOTS, [head], () => {
            readHead(at, computedValueService.getValueForSlot(head));
        });
        for (let key = firstKey; key <= headKey; key++) {
            const derivationSlot = computedCollectionService.getSlotByKey(computedStoreSlot, key);
            derivationSlot.owner.unholdSlot(derivationSlot);
        }
        return computedValueService.getValueForSlot(head);
    };

    return {
        mountOnChain: (at, rootSlots, depth) => {
            rootSlotsBySubscriber[at] = rootSlots;
            return subscribeHead(at, chainComputedService, chainComputedStoreSlot, at * CHAIN_KEYS_PER_SUBSCRIBER + 1, depth);
        },
        mountOnDiamond: (at, rootSlots) => {
            rootSlotsBySubscriber[at] = rootSlots;
            return subscribeHead(at, diamondComputedService, diamondComputedStoreSlot, at * DIAMOND_KEYS_PER_SUBSCRIBER, DIAMOND_KEYS_PER_SUBSCRIBER);
        },
    };
};

const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const entityService = createRowEntityService(db);
    const entityStoreSlot = entityService.createStoreSlot(db);

    // What a mount and an unmount cost here: `oimdb.md`.
    const churnSlots: TRowSlot[] = [];
    const churnSources: TRowSlot[][] = [];
    const spanSources = new Map<number, TRowSlot[]>();
    /** What each standing subscriber last read. */
    const churnRead: (string | undefined)[] = [];
    const churnEffects: (TOIMEffect | undefined)[] = [];
    /** How many bodies ran in the frame now closing. The proof of the mounts. */
    let churnWoke = 0;
    let churnPending = false;
    let churnId = '';
    let churnRank = 0;

    const sourcesOf = (from: number, count: number): readonly TRowSlot[] => {
        if (count === 1) return churnSources[from];
        const spanKey = count * churnSlots.length + from;
        let sources = spanSources.get(spanKey);
        if (sources === undefined) {
            sources = churnSlots.slice(from, from + count);
            spanSources.set(spanKey, sources);
        }
        return sources;
    };

    const readChurn = (at: number, value: string): void => {
        churnWoke++;
        churnRead[at] = value;
        churnPending = true;
    };

    const churnBody = (at: number, slot: TRowSlot): (() => void) => () => {
        readChurn(at, labelOf(slot));
    };

    let churnMounts: TChurnMounts | undefined = undefined;

    const paintChurn = (): void => {
        if (!churnPending) return;
        churnPending = false;
        deliverChurn(churnConsumer, churnId, churnRank, churnWoke, churnRead);
        churnWoke = 0;
    };

    return {
        ...bindRowWrites(db, entityService, entityStoreSlot, paintChurn),
        ...pinNothing,
        groupOrder: () => undefined,
        // Resolved once; each mounted effect holds the slots it subscribes to.
        holdChurnRows: (ids, ranks) => {
            churnId = ids[0];
            churnRank = ranks[0];
            for (let i = 0; i < ids.length; i++) {
                const slot = entityService.getSlotByKey(entityStoreSlot, ids[i]);
                churnSlots.push(slot);
                churnSources.push([slot]);
            }
        },
        // ONE EFFECT OVER `count` ROOTS. The source array is handed over and kept by
        // `TOIMEffect` as its `sourceSlots`, so it is part of what a subscription
        // costs rather than an artefact of the harness.
        mountOnRows: (at, from, count) => {
            churnEffects[at] = effectService.createEffect(
                db,
                sourcesOf(from, count),
                NO_SOURCE_COMPUTEDS,
                churnBody(at, churnSlots[from])
            );
            churnRead[at] = labelOf(churnSlots[from]);
        },
        mountOnColumn: at => {
            const slot = churnSlots[0];
            const columnSlot = entityService.holdColumn(slot, 'label');
            churnEffects[at] = effectService.createEffect(db, [columnSlot], [], churnBody(at, slot));
            entityService.unholdColumn(columnSlot);
            churnRead[at] = labelOf(slot);
        },
        // A STACK OF DERIVATIONS BUILT BY THE MOUNT, and one effect on its head.
        mountOnChain: (at, from, count, depth) => {
            churnMounts ??= createChurnMounts(db, readChurn, churnEffects);
            churnRead[at] = churnMounts.mountOnChain(at, sourcesOf(from, count), depth);
        },
        mountOnDiamond: (at, from) => {
            churnMounts ??= createChurnMounts(db, readChurn, churnEffects);
            churnRead[at] = churnMounts.mountOnDiamond(at, churnSources[from]);
        },
        unmount: at => {
            const effect = churnEffects[at];
            if (effect === undefined) return;
            effectService.disposeEffect(effect);
            churnEffects[at] = undefined;
            churnRead[at] = undefined;
        },
        dispose: () => {
            OIMChannelService.INSTANCE.dropChannelSlot(db.defaultChannelSlot);
            churnPending = false;
            churnEffects.length = 0;
            churnSlots.length = 0;
            churnSources.length = 0;
            spanSources.clear();
            churnRead.length = 0;
        },
    };
};

/** The key the second-axis index answers with for a row off the axis. Nobody holds it. */
const OFF_THE_SECOND_AXIS = '#off';

/**
 * THE READ WIRING — the same engine, asked the four questions the window bindings
 * cannot put.
 */
const bindReadViews = <TGroupOrder, TOrderedSlots>(
    groupOrderStrategy: TGroupOrderStrategy<TGroupOrder, TOrderedSlots>,
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const entityService = createRowEntityService(db);
    const entityStoreSlot = entityService.createStoreSlot(db);
    /**
     * ONE GROUP, TWO INDEXES: everything filed under the group, and the subset on the
     * second axis. A composite predicate is a second index over the same collection,
     * and a row off the axis answers with a key nobody holds — which is filed nowhere.
     * The price of the second index is one `keyOf` call and one key comparison per
     * write that changes `id` or `group`, paid inside this binding's writes.
     */
    const orderByGroup = groupOrderStrategy.createGroupOrders(db, entityService, entityStoreSlot, GROUP_COLUMN, OIMSlotReleasePolicyNever.INSTANCE);
    const orderByGroupOnAxis = groupOrderStrategy.createGroupOrders(db, entityService, entityStoreSlot, {
        columns: ['id', 'group'],
        keyOf: row => (onSecondAxis(row.id) ? row.group : OFF_THE_SECOND_AXIS),
    });
    const windows = createWindowViews<TGroupOrder, TOrderedSlots>(db, entityService, view.window, (consumer, visible) => {
        deliverPage(consumer, visible, 0, view.window);
    });

    // VIEW A over the group, at an offset `scrollTo` moves; VIEW B over the same
    // group AND the axis, at a fixed offset. Both over group A: a different group
    // would make the gap a gap between groups rather than between predicates.
    const views = [
        windows.makeView(orderByGroup, view.groupA, consumers.a),
        windows.makeView(orderByGroupOnAxis, view.groupA, consumers.b),
    ];

    /** The rows one page of keys resolved to. Reused, so a read allocates nothing. */
    const found: TRow[] = [];

    return {
        ...bindRowWrites(db, entityService, entityStoreSlot, () => {
            windows.paint(views);
        }),
        ...pinNothing,
        // NOTHING IS RESOLVED BEFORE THIS CALL AND NOTHING IS KEPT AFTER IT — the lookup
        // is what the row measures, and every key the plan names is a row that exists
        // (dataset.ts builds them from `rows`).
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const entity = entityService.slotContentService.findEntityByKey(entityStoreSlot, keys[from + i]);
                if (entity !== undefined) found.push(entity);
            }
            deliverPage(consumers.a, found, 0, count);
        },
        // THE WINDOW MOVES AND THE DATA DOES NOT. `shapeMoved` is set because the SET
        // OF VISIBLE ROWS changed, and it is what makes the next frame re-point one
        // subscription per visible row.
        scrollTo: to => {
            const state = views[0];
            state.offset = to;
            state.shapeMoved = true;
            state.pending = true;
        },
        // Held before the old key is given back, so a switch to the same group keeps its order.
        switchGroup: group => {
            const state = views[0];
            const groupOrder = orderByGroup.holdGroupOrder(group);
            effectService.disposeEffect(state.shape);
            orderByGroup.unholdGroupOrder(state.groupOrder);
            state.groupOrder = groupOrder;
            state.shape = windows.watchShape(state);
            state.offset = 0;
            state.shapeMoved = true;
            state.pending = true;
        },
        // THE GROUP INDEX AND NOT THE AXIS ONE: the audit asks for a whole group.
        groupOrder: group => groupOrderOf(orderByGroup, group),
        dispose: () => {
            OIMChannelService.INSTANCE.dropChannelSlot(db.defaultChannelSlot);
            found.length = 0;
            views.length = 0;
        },
    };
};

/**
 * THE RELATIONSHIP WIRING — two entity collections and a third keyed by one identity
 * from each.
 */
const bindRelationViews = (consumers: TConsumers): TRelationBinding => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rowEntityService = createRowEntityService(db);
    const rowEntityStoreSlot = rowEntityService.createStoreSlot(db);
    // The SECOND ENTITY TYPE, and into the SAME channel, so a frame that wrote both
    // types is one frame and one flush.
    const ownerEntityService = createOIMEntityService<TOwner>(db, {
        keyOf: owner => owner.id,
        entityWriter: createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithCopy }),
    });
    const ownerEntityStoreSlot = ownerEntityService.createStoreSlot(db);
    // The records keyed by a COMBINATION OF IDENTITIES. The descent compares nothing:
    // rebuilding `[a, b]` from the same two slots arrives at the same node.
    const pairEntityService = createOIMEntityService<
        TPairEntity, TOIMEntityColumnName<TPairEntity>, TPairKey, TOIMSlotStoreTree<TPairSlot, TOIMEntitySlot>
    >(db, {
        entitySlotStoreService:
            new OIMSlotStoreServiceTreeDriven<TOIMEntitySlot, TPairSlot>(OIMDefaults.KEY_TREE_WALK_COMPOSITE.getValue()),
        keyOf: pair => [pair.owner, pair.row],
        columnSlotStoreService: OIMDefaults.COLUMN_SLOT_STORE_SERVICE.getValue(),
    });
    const pairEntityStoreSlot = pairEntityService.createStoreSlot(db);

    /** The addresses `holdRelation` was given. Both views render these rows. */
    let config: TRelationConfig = {
        ids: [],
        ranks: [],
        owners: [],
        touched: [],
        names: [],
        seeds: [],
    };
    // THE IDENTITIES RESOLVED BEFORE THE CLOCK.
    // `rowOwnerSlots` is the identity each rendered line's name comes from, so a render
    // is an array read and a field read and never a lookup.
    const touchedSlots: TOwnerSlot[] = [];
    const rowSlots: TRowSlot[] = [];
    const rowOwnerSlots: TOwnerSlot[] = [];
    const pairSlots: TPairSlot[] = [];
    const nameText: string[] = [];
    const markText: string[] = [];
    let namesPending = false;
    let marksPending = false;

    // THE JOINED VIEW: one line per relation row, carrying that row's owner's name,
    // read through the owner identity resolved at bind time.
    const renderNames = (): void => {
        for (let i = 0; i < rowOwnerSlots.length; i++) {
            const owner = rowOwnerSlots[i].entity;
            nameText[i] = owner === undefined ? '' : owner.name;
        }
        deliverRelation(consumers.a, config, nameText);
    };

    const renderMarks = (): void => {
        for (let i = 0; i < pairSlots.length; i++) {
            const pair = pairSlots[i].entity;
            markText[i] = pair === undefined ? '' : pair.mark;
        }
        deliverRelation(consumers.b, config, markText);
    };

    const paintRelations = (): void => {
        if (namesPending) {
            namesPending = false;
            renderNames();
        }
        if (marksPending) {
            marksPending = false;
            renderMarks();
        }
    };

    return {
        ...bindRowWrites(db, rowEntityService, rowEntityStoreSlot, paintRelations),
        ...pinNothing,
        frame: run => {
            run();
        },
        // `insertEntities` and not `upsertEntities`: a first load into an empty collection, the
        // precondition that door checks in constant time. A second call throws.
        writeOwners: incoming => {
            ownerEntityService.slotContentService.insertEntities(ownerEntityStoreSlot, incoming);
        },
        // EVERY IDENTITY BOTH SCRIPTS WORK THROUGH, RESOLVED ONCE AND HELD, and the pair
        // records created at their seeds. The pair records go in through `upsertEntity`, the
        // door that MINTS the composite key — the expensive half, deliberately outside
        // the clock. Nothing subscribes to a row: the rows are the address, and no
        // relation script writes one.
        holdRelation: given => {
            config = given;
            nameText.length = given.ids.length;
            markText.length = given.ids.length;
            for (let at = 0; at < given.touched.length; at++) touchedSlots.push(ownerEntityService.holdSlotByKey(ownerEntityStoreSlot, given.touched[at]));
            for (let i = 0; i < given.ids.length; i++) {
                rowSlots.push(rowEntityService.holdSlotByKey(rowEntityStoreSlot, given.ids[i]));
                rowOwnerSlots.push(
                    touchedSlots[given.touched.indexOf(given.owners[i])]
                );
            }
            for (let i = 0; i < given.ids.length; i++) {
                pairSlots.push(
                    pairEntityService.slotContentService.upsertEntity(pairEntityStoreSlot, {
                        owner: rowOwnerSlots[i],
                        row: rowSlots[i],
                        mark: given.seeds[i],
                    })
                );
            }
            for (let at = 0; at < touchedSlots.length; at++) {
                effectService.createEffect(db, [touchedSlots[at]], NO_SOURCE_COMPUTEDS, () => {
                    namesPending = true;
                });
            }
            for (let i = 0; i < pairSlots.length; i++) {
                effectService.createEffect(db, [pairSlots[i]], NO_SOURCE_COMPUTEDS, () => {
                    marksPending = true;
                });
            }
            // Untimed: the state every sample starts from.
            renderNames();
            renderMarks();
        },
        // `updateEntity` through the identity of a record of the SECOND TYPE. It must reach
        // the joined view and must NOT reach the pair view.
        patchOwnerName: (at, name) => {
            ownerEntityService.slotContentService.updateEntityColumn(touchedSlots[at], 'name', name);
        },
        // COMPOSE THE KEY, DESCEND, WRITE. No mint, no hold, no edge: the record is
        // already filed, so the descent walks edges that exist.
        writePair: (at, mark) => {
            pairEntityService.slotContentService.updateEntityColumn(
                pairEntityService.getSlotByKey(pairEntityStoreSlot, [rowOwnerSlots[at], rowSlots[at]]), 'mark', mark,
            );
        },
        // NOTHING TO READ: no window, no group, no sort, no bucket collection.
        groupOrder: () => undefined,
        /** The second population, read out of its own collection's identity store. */
        readOwners: () => readEntitiesOf(ownerEntityService, ownerEntityStoreSlot),
        // Read off the SLOT rather than out of the entity: `slot.key` is the chain the
        // store kept when the record was filed, so a descent that lost a segment is
        // caught here and nowhere else.
        readPairs: () => {
            const held: TPairRow[] = [];
            for (const slot of pairEntityService.getSlots(pairEntityStoreSlot)) {
                const entity = slot.entity;
                if (entity === undefined) continue;
                const key = slot.key;
                held.push({
                    owner: String(key[0].key),
                    row: String(key[1].key),
                    mark: entity.mark,
                });
            }
            return held;
        },
        dispose: () => {
            OIMChannelService.INSTANCE.dropChannelSlot(db.defaultChannelSlot);
            namesPending = false;
            marksPending = false;
            pairSlots.length = 0;
            touchedSlots.length = 0;
            rowSlots.length = 0;
            rowOwnerSlots.length = 0;
            nameText.length = 0;
            markText.length = 0;
        },
    };
};

/**
 * TWO STANDALONE RECORDS ON ONE CHANNEL, EACH UNDER ITS OWN EFFECT. One createOIMSingleEntityService makes a store slot for each
 * (createStoreSlot(db), holdSingleSlot, writeEntity); the slot is written through its slotContentService's `updateEntity` and `updateEntityColumn`.
 */
const bindSingleStore = (participantName: string, consumers: TConsumers): TSingleBinding => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    /** The value the scripts write, and the one no step of either writes. */
    const entityService = createOIMSingleEntityService<{ value: string }>(db, {
        columnSlotStoreService: OIMDefaults.COLUMN_SLOT_STORE_SERVICE.getValue(),
    });
    const slotContentService = entityService.slotContentService;
    const valueEntitySlot = entityService.holdSingleSlot(entityService.createStoreSlot(db));
    slotContentService.writeEntity(valueEntitySlot, { value: '' });
    const bystanderEntitySlot = entityService.holdSingleSlot(entityService.createStoreSlot(db));
    slotContentService.writeEntity(bystanderEntitySlot, { value: '' });
    const effects: TOIMEffect[] = [];
    let name = '';
    let bystanderName = '';
    let read = '';
    let readBystander = '';
    let woke = false;
    let wokeBystander = false;

    return {
        ...noRowStore(participantName),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            slotContentService.updateEntity(valueEntitySlot, { value: config.seeds[0] });
            slotContentService.updateEntity(bystanderEntitySlot, { value: config.seeds[1] });
            // The seeding frame is closed BEFORE anything subscribes, so the writes
            // above mark nothing a view would later be woken by.
            db.flush();
            read = config.seeds[0];
            readBystander = config.seeds[1];
            effects.push(
                effectService.createEffect(db, [valueEntitySlot], NO_SOURCE_COMPUTEDS, () => {
                    const item = valueEntitySlot.entity;
                    read = item === undefined ? '' : item.value;
                    woke = true;
                })
            );
            effects.push(
                effectService.createEffect(db, [bystanderEntitySlot], NO_SOURCE_COMPUTEDS, () => {
                    const item = bystanderEntitySlot.entity;
                    readBystander = item === undefined ? '' : item.value;
                    wokeBystander = true;
                })
            );
            woke = false;
            wokeBystander = false;
            deliverSingle(consumers.a, name, read);
            deliverSingle(consumers.b, bystanderName, readBystander);
        },
        writeSingle: next => {
            slotContentService.updateEntityColumn(valueEntitySlot, 'value', next);
        },
        readSingle: () => {
            const item = valueEntitySlot.entity;
            return item === undefined ? '' : item.value;
        },
        readBystander: () => {
            const item = bystanderEntitySlot.entity;
            return item === undefined ? '' : item.value;
        },
        frame: run => {
            run();
        },
        settle: () => {
            db.flush();
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
            for (let i = 0; i < effects.length; i++) effectService.disposeEffect(effects[i]);
            effects.length = 0;
            valueEntitySlot.owner.unholdSlot(valueEntitySlot);
            bystanderEntitySlot.owner.unholdSlot(bystanderEntitySlot);
        },
    };
};


type TOimdbParticipant = Pick<TAdapter, 'name' | 'docs' | 'departure' | 'admission'>;

const oimdbAdapterWith = <TGroupOrder, TOrderedSlots>(
    participant: TOimdbParticipant,
    groupOrderStrategy: TGroupOrderStrategy<TGroupOrder, TOrderedSlots>,
): TAdapter => ({
    name: participant.name,
    version: '4.0.0',
    docs: participant.docs,
    departure: participant.departure,
    admission: participant.admission,

    bind: (consumers, view) =>
        bindViews(
            groupOrderStrategy,
            [
                { group: view.groupA, consumer: consumers.a },
                { group: view.groupB, consumer: consumers.b },
            ],
            view
        ),
    // THE SAME STORE WITH NOTHING SUBSCRIBED TO IT: every subscription the churn
    // scripts time is one they made themselves.
    churn: churnShapes(consumers => bindChurnStore(consumers.a)),
    /** A second index, a moving offset and a movable group. `bindReadViews` says why it is a body. */
    reads: readShapes((consumers, view, plan) =>
        bindReadViews(groupOrderStrategy, consumers, view, plan)
    ),
    // The only place in this suite `OIMSlotStoreServiceTreeDriven` is exercised at all.
    relations: {
        build: consumers => bindRelationViews(consumers),
        absent: '',
    },
    single: {
        build: consumers => bindSingleStore(participant.name, consumers),
        absent: '',
    },
    // FIFTY VIEWS OVER THE SAME INDEX, one held key each: all fifty buckets are
    // maintained by the library on every write, whichever group the write lands in.
    bindPerGroup: (consumers, view) =>
        bindViews(groupOrderStrategy, consumers.views, view),
});

const OIMDB_DEPARTURE =
    'measured against source that is not released: @oimdb/core 4.0.0 is unpublished and imported ' +
    'from the working tree. Two things it does that no other row pays for or is credited with: ' +
    'an index bucket is minted only when a key is ' +
    'held, so the two-view bindings file into the two groups a view watches and into no other, ' +
    'where several rows here keep a bucket per group whether or not anybody watches it — the ' +
    'fifty-view binding holds all fifty and files into all fifty; and on the wide mount shape the ' +
    'subscriber is registered over every churn row it is asked for while its body reads the first ' +
    'of them alone. Every binding with entity collections tears down with one ' +
    'OIMChannelService.INSTANCE.dropChannelSlot(db.defaultChannelSlot) and clears its own arrays: no effect is detached and no hold ' +
    'given back one at a time, because a dropped channel neither schedules nor runs a frame, so no ' +
    'effect body runs again. The single binding disposes its two effects and keeps its channel.';

export const oimdbAdapter: TAdapter = oimdbAdapterWith({
    name: 'oimdb',
    docs:
        'packages/core/dist (the built package, as a consumer gets it) — createOIMEntityService(db, …) on one ' +
        'OIMDB with the default entity writer, createOIMEntityWriterInPlace(), and one createStoreSlot(db) as the instance; a first load goes in through ' +
        'entityService.slotContentService.insertEntities(entityStoreSlot, …), later writes through slotContentService.upsertEntities; a label or note patch assigns slot.entity in ' +
        'place and calls slotContentService.markEntityChanged with that one column, a group or rank move is slotContentService.updateEntityColumn on the slot entityService.getSlotByKey returns; ' +
        'a createOIMIndexService with an OIMSlotContentBucketServiceSetDriven over the group column, with indexService.createIndexStoreSlot(entityStoreSlot) as its instance, files each write into its buckets from keyOf, and a ' +
        'createOIMComputedServiceSorted over that index service (rank then id, as sortColumns, so only a write that ' +
        'changes rank or id on a member re-sorts), read through createSortedStoreSlot(indexStoreSlot), keeps the order of a held group as a computed slot; the ' +
        'read views wake on that order too, one per index; the churn chain levels are slots of one ' +
        'createOIMComputedService store slot and the diamond nodes slots of another, each keyed by subscriber and ' +
        'level, under one OIMEffectService.INSTANCE.createEffect(db, …) on the head; a frame of the window ' +
        'and read bindings is one OIMChannelService.INSTANCE.openSubframe/closeSubframe subframe on db.defaultChannelSlot',
    departure: OIMDB_DEPARTURE,
    admission:
        'the row values live in the library — an entity service\'s slots, written through ' +
        'its slotContentService\'s insertEntities, upsertEntities, updateEntityColumn and markEntityChanged, and read back as slot.entity — and the change signal is the ' +
        'library\'s own OIMEffectService effect over a slot, a column, a bucket or an index order, ' +
        'delivered at the frame flush; the GROUP FILING and the ORDER are the library\'s too, an OIMIndexService ' +
        'whose entity service calls keyOf on each write, moves the row between its buckets itself and ' +
        'an OIMComputedServiceSorted re-sorts a held group\'s order when a write touches the sorter\'s columns.',
}, GROUP_ORDER_SORTED_AT_READ);

export const oimdbSortedIndexAdapter: TAdapter = oimdbAdapterWith({
    name: 'oimdb-sorted-index',
    docs:
        'packages/core/dist (the built package, as a consumer gets it) — the same wiring as the oimdb row ' +
        'except for group order: a createOIMIndexServiceSortedArrayDriven over the group column with sortColumns ' +
        'rank then id, and indexService.createIndexStoreSlot(entityStoreSlot) as its instance, files each write into its buckets from keyOf and keeps every bucket in that order at ' +
        'the write, so there is no createOIMComputedServiceSorted; a window or read view reads its page ' +
        'with indexService.slotContentService.getBucketMemberSlotCount and getBucketMemberSlotAt from its offset, and its order effect has the ' +
        'held bucket slot as a root slot, which the index writes when membership changes or a member\'s rank ' +
        'or id changes; the read binding builds two such indexes, the group and the second axis',
    departure: OIMDB_DEPARTURE,
    admission:
        'the row values live in the library — an entity service\'s slots, written through ' +
        'its slotContentService\'s insertEntities, upsertEntities, updateEntityColumn and markEntityChanged, and read back as slot.entity — and the change signal is the ' +
        'library\'s own OIMEffectService effect over a slot, a column or a bucket, ' +
        'delivered at the frame flush; the GROUP FILING and the ORDER are the library\'s too, an OIMIndexServiceSortedArrayDriven ' +
        'whose entity service calls keyOf on each write, moves the row between its buckets itself and ' +
        'keeps each bucket sorted by rank then id at the write.',
}, GROUP_ORDER_SORTED_AT_WRITE);
