import { OIMCompositeKeyTreeWalk } from '../../../core/dist/index.js';
import { OIMDB, OIMEffectService, OIMSetBucketContentService, OIMSlotNeverReleasePolicy, OIMSlotTreeStoreService, createOIMColumnGroup, createOIMComputedService, createOIMSortedComputedService, createOIMInPlaceEntityWriter, createOIMEntityContentService, createOIMSlotCollectionService, createOIMSingleSlotService, createOIMSlotCollectionIndexService, createOIMSlotCollectionSortedArrayIndexService, insertOIMEntityWithCopy, isOIMSameValueZero } from '../../../core/dist/index.js';
import type {
    IOIMSlotReleasePolicy,
    OIMPushColumnSlotOwner,
    OIMComputedService,
    OIMWritableSlotCollectionService,
    OIMEntityContentService,
    TOIMBucketSlot,
    TOIMBucketSlotsSetStore,
    TOIMBucketSlotsArrayStore,
    TOIMColumnSlot,
    TOIMComputedSlot,
    TOIMComputedStoreSlot,
    TOIMEffect,
    TOIMEntitySlot,
    TOIMColumnName,
    TOIMIndexKeyOptions,
    TOIMSortColumn,
    TOIMStoreKey,
    TOIMStoreSlot,
    TOIMSlot,
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
type TEntityService<
    TKey extends NonNullable<unknown>, TEntity extends object, TStore, TColumnName extends string = TOIMColumnName<TEntity>,
> = OIMWritableSlotCollectionService<
    TKey, TOIMEntitySlot<TEntity, TKey>, TStore, TEntity, OIMEntityContentService<TEntity, TKey, TColumnName>,
    TColumnName, TOIMColumnSlot, OIMPushColumnSlotOwner, Partial<TEntity>
>;
type TRowEntityService = TEntityService<TOIMStoreKey, TRow, TRowStore, TRowColumnName>;
type TRowStoreSlot = TOIMStoreSlot<TRowStore, TRowSlot, Partial<TRow>>;
const ROW_COLUMNS: readonly TRowColumnName[] = ['rank', 'label', 'note'];
type TGroupSlots = TOIMBucketSlotsSetStore<TOIMEntitySlot<TRow, TOIMStoreKey>>;
type TSortedGroupSlots = TOIMBucketSlotsArrayStore<TOIMEntitySlot<TRow, TOIMStoreKey>>;
type TSortedGroupIndexStore = Map<TOIMStoreKey, TOIMBucketSlot<TSortedGroupSlots, TOIMStoreKey>>;
type TGroupOrderComputedSlot = TOIMComputedSlot<readonly TOIMEntitySlot<TRow, TOIMStoreKey>[], TOIMStoreKey>;

type TGroupOrders<TGroupOrder, TOrderedSlots> = {
    holdGroupOrder: (group: string) => TGroupOrder;
    unholdGroupOrder: (groupOrder: TGroupOrder) => void;
    readOrderedSlots: (groupOrder: TGroupOrder) => TOrderedSlots;
    getOrderedSlotCount: (orderedSlots: TOrderedSlots) => number;
    getOrderedSlotAt: (orderedSlots: TOrderedSlots, at: number) => TRowSlot;
};

type TGroupOrderStrategy<TGroupOrder, TOrderedSlots> = {
    createGroupOrders: (
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
    { columnName: 'rank', direction: 'asc' },
    { columnName: 'id', direction: 'asc' },
];

// In place, so the stored object keeps its identity for its whole life and
// `slot.entity` IS that object — what `readAll` and the pinned reads depend on.
const createRowEntityService = (): TRowEntityService =>
    createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TRow>(), columnNames: ROW_COLUMNS });

// THE GROUP FILING IS THE LIBRARY'S: on a write that changed one of the index's
// columns the collection reads the key again, compares it with the key the row was
// last filed under, and moves the row between buckets itself.
const GROUP_ORDER_SORTED_AT_READ: TGroupOrderStrategy<TGroupOrderComputedSlot, readonly TOIMEntitySlot<TRow, TOIMStoreKey>[]> = {
    createGroupOrders: (entityService, entityStoreSlot, indexKeyOptions, slotReleasePolicy) => {
        const indexService = createOIMSlotCollectionIndexService<
            TRow, TOIMStoreKey, readonly TOIMColumnName<TRow>[], TOIMStoreKey, TRowStore, TGroupSlots,
            OIMSetBucketContentService<TOIMEntitySlot<TRow, TOIMStoreKey>>
        >({
            ...indexKeyOptions,
            entityService,
            slotContentService: new OIMSetBucketContentService<TOIMEntitySlot<TRow, TOIMStoreKey>>(),
            slotReleasePolicy,
        });
        const indexStoreSlot = indexService.createIndexStoreSlot(entityStoreSlot);
        const sortedComputedService = createOIMSortedComputedService<TOIMStoreKey, TRow, TGroupSlots, TOIMStoreKey, TRowStore>({
            indexService,
            sortColumns: BY_RANK_THEN_ID,
            slotReleasePolicy,
        });
        const sortedComputedStoreSlot = sortedComputedService.createSortedStoreSlot(indexStoreSlot);
        return {
            holdGroupOrder: group => sortedComputedService.holdSlotByKey(sortedComputedStoreSlot, group),
            unholdGroupOrder: groupOrder => {
                groupOrder.owner.unholdSlot(groupOrder);
            },
            readOrderedSlots: groupOrder => groupOrder.value,
            getOrderedSlotCount: orderedSlots => orderedSlots.length,
            getOrderedSlotAt: (orderedSlots, at) => orderedSlots[at] as TRowSlot,
        };
    },
};

const createGroupOrdersSortedAtWrite = (
    entityService: TRowEntityService,
    entityStoreSlot: TRowStoreSlot,
    indexKeyOptions: TOIMIndexKeyOptions<TOIMStoreKey, TRow>,
    slotReleasePolicy?: IOIMSlotReleasePolicy,
) => {
    const indexService = createOIMSlotCollectionSortedArrayIndexService<
        TRow, TOIMStoreKey, readonly TOIMColumnName<TRow>[], TOIMStoreKey, TRowStore, TSortedGroupIndexStore
    >({
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
        getOrderedSlotCount: bucketSlot => bucketSlot.getBucketMemberSlotCount(),
        getOrderedSlotAt: (bucketSlot, at) => bucketContentService.getBucketMemberSlotAt(bucketSlot, at) as TRowSlot,
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
const readEntitiesOf = <TKey extends NonNullable<unknown>, TEntity extends object, TStore>(
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
    return {
        write: incoming => {
            entityService.writeInBatch(entityStoreSlot, () => {
                for (let i = 0; i < incoming.length; i++) entityService.writeSlotContentByKey(entityStoreSlot, incoming[i].id, incoming[i]);
            });
        },
        // The engine takes the row OUT OF EVERY BUCKET HOLDING IT and then empties the
        // slot — that order, inside the library, is what keeps the index order from ever
        // being handed a row whose value has already gone.
        remove: ids => {
            entityService.writeInBatch(entityStoreSlot, () => {
                for (let i = 0; i < ids.length; i++) {
                    const rowSlot = entityService.peekSlotByKey(entityStoreSlot, ids[i]);
                    if (rowSlot !== undefined) slotContentService.clearSlotContent(rowSlot);
                }
            });
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
            entityService.writeInBatch(entityStoreSlot, run);
        },
        settle: () => {
            db.flush();
            paint();
        },
        readAll: () => readEntitiesOf(entityService, entityStoreSlot),
        deliverableRows: () => undefined,
    };
};

type TWindowViewHandle = {
    paint: () => void;
    scrollTo: (offset: number) => void;
    switchGroup: (group: string) => void;
    drop: () => void;
};

type TWindowViewFactory<TGroupOrder, TOrderedSlots> = {
    makeView: (groupOrders: TGroupOrders<TGroupOrder, TOrderedSlots>, group: string, consumer: BenchConsumer) => TWindowViewHandle;
};

type TWindowViewsCreator = <TGroupOrder, TOrderedSlots>(
    db: OIMDB,
    windowSize: number,
    deliverView: (consumer: BenchConsumer, visible: readonly TRow[]) => void,
) => TWindowViewFactory<TGroupOrder, TOrderedSlots>;

type TPageOffset = { offset: number };

const createWindowViews: TWindowViewsCreator = <TGroupOrder, TOrderedSlots>(
    db: OIMDB,
    windowSize: number,
    deliverView: (consumer: BenchConsumer, visible: readonly TRow[]) => void
): TWindowViewFactory<TGroupOrder, TOrderedSlots> => {
    const effectService = OIMEffectService.INSTANCE;
    const renderedColumns = createOIMColumnGroup<TRowColumnName>(['rank', 'label']);
    const offsetService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TPageOffset>() });
    const offsetStoreSlot = offsetService.createStoreSlot(db);
    let viewCount = 0;

    return {
        makeView: (groupOrders, group, consumer) => {
            const offsetSlot = offsetService.writeSlotContentByKey(offsetStoreSlot, viewCount++, { offset: 0 });
            const visible: TRow[] = [];
            const shownIds: string[] = [];
            const shownRanks: number[] = [];
            const shownLabels: string[] = [];
            let pending = false;
            let groupOrder = groupOrders.holdGroupOrder(group);
            const watchWindow = (): TOIMEffect => effectService.createSourceTrackingEffect(db, () => {
                const offset = (offsetSlot.entity as TPageOffset).offset;
                const orderedSlots = groupOrders.readOrderedSlots(groupOrder);
                const orderedSlotCount = groupOrders.getOrderedSlotCount(orderedSlots);
                visible.length = 0;
                for (let at = offset; at < orderedSlotCount && visible.length < windowSize; at++) {
                    const slot = groupOrders.getOrderedSlotAt(orderedSlots, at);
                    const entity = slot.getEntity(renderedColumns);
                    if (entity === undefined) continue;
                    visible.push(entity);
                }
                pending = true;
            });
            let effect = watchWindow();
            return {
                paint: () => {
                    if (!pending) return;
                    pending = false;
                    let isShownChanged = visible.length !== shownIds.length;
                    for (let i = 0; i < visible.length; i++) {
                        const row = visible[i];
                        if (shownIds[i] !== row.id || shownRanks[i] !== row.rank || shownLabels[i] !== row.label) {
                            isShownChanged = true;
                            shownIds[i] = row.id;
                            shownRanks[i] = row.rank;
                            shownLabels[i] = row.label;
                        }
                    }
                    if (!isShownChanged) return;
                    shownIds.length = visible.length;
                    shownRanks.length = visible.length;
                    shownLabels.length = visible.length;
                    deliverView(consumer, visible);
                },
                scrollTo: offset => {
                    offsetService.slotContentService.updateEntityColumn(offsetSlot, 'offset', offset);
                },
                switchGroup: nextGroup => {
                    const nextGroupOrder = groupOrders.holdGroupOrder(nextGroup);
                    effectService.disposeEffect(effect);
                    groupOrders.unholdGroupOrder(groupOrder);
                    groupOrder = nextGroupOrder;
                    offsetService.slotContentService.updateEntityColumn(offsetSlot, 'offset', 0);
                    effect = watchWindow();
                },
                drop: () => {
                    effectService.disposeEffect(effect);
                    visible.length = 0;
                },
            };
        },
    };
};


const bindViews = <TGroupOrder, TOrderedSlots>(
    groupOrderStrategy: TGroupOrderStrategy<TGroupOrder, TOrderedSlots>,
    bindings: readonly TViewBinding[],
    view: TViewConfig,
): TBinding => {
    const db = new OIMDB({ channelScheduler: null });
    const effectService = OIMEffectService.INSTANCE;
    const entityService = createRowEntityService();
    const entityStoreSlot = entityService.createStoreSlot(db);
    const orderByGroup = groupOrderStrategy.createGroupOrders(entityService, entityStoreSlot, GROUP_COLUMN);
    const windows = createWindowViews<TGroupOrder, TOrderedSlots>(db, view.window, (consumer, visible) => {
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
        for (const state of views) state.drop();
    };

    const paint = (): void => {
        if (windowsWired) {
            for (let i = 0; i < views.length; i++) views[i].paint();
        }
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
                const labelColumnSlot = entityService.columnSlotService.holdColumnSlot(slot, 'label');
                const noteColumnSlot = entityService.columnSlotService.holdColumnSlot(slot, 'note');
                cellColumnSlots.push(labelColumnSlot, noteColumnSlot);
                cellEffects.push(
                    effectService.createEffect(db, () => {
                        labelPending = true;
                    }, [labelColumnSlot])
                );
                cellEffects.push(
                    effectService.createEffect(db, () => {
                        notePending = true;
                    }, [noteColumnSlot])
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
            db.dispose();
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
type TChurnComputedStoreSlot = TOIMComputedStoreSlot<Map<number, TChurnDerivationSlot>, string, TChurnDerivationSlot>;

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
        createSources: ({ key }) => {
            const level = key % CHAIN_KEYS_PER_SUBSCRIBER;
            return level === 1
                ? { sourceSlots: rootSlotsBySubscriber[(key - level) / CHAIN_KEYS_PER_SUBSCRIBER] }
                : { sourceComputeds: [chainComputedService.getSlotByKey(chainComputedStoreSlot, key - 1)] };
        },
        derive: computedSlot => {
            const level = computedSlot.key % CHAIN_KEYS_PER_SUBSCRIBER;
            return level === 1
                ? chainLevelOf(joinedLabelsOf(computedSlot.sourceSlots as readonly TRowSlot[]), 1)
                : chainLevelOf((computedSlot.sourceComputeds[0] as TChurnDerivationSlot).value, level);
        },
        sameValueGuard: isOIMSameValueZero,
    });
    const chainComputedStoreSlot: TChurnComputedStoreSlot = chainComputedService.createStoreSlot(db);

    const diamondComputedService: TChurnComputedService = createOIMComputedService<number, string, Map<number, TChurnDerivationSlot>>({
        createSources: ({ key }) => {
            const node = key % DIAMOND_KEYS_PER_SUBSCRIBER;
            return node === DIAMOND_JOIN
                ? { sourceComputeds: [diamondComputedService.getSlotByKey(diamondComputedStoreSlot, key - 2), diamondComputedService.getSlotByKey(diamondComputedStoreSlot, key - 1)] }
                : { sourceSlots: rootSlotsBySubscriber[(key - node) / DIAMOND_KEYS_PER_SUBSCRIBER] };
        },
        derive: computedSlot => {
            const node = computedSlot.key % DIAMOND_KEYS_PER_SUBSCRIBER;
            if (node === DIAMOND_JOIN) {
                const sourceComputeds = computedSlot.sourceComputeds;
                const leftSlot = sourceComputeds[0] as TChurnDerivationSlot;
                const rightSlot = sourceComputeds[1] as TChurnDerivationSlot;
                return diamondJoinOf(
                    leftSlot.value,
                    rightSlot.value,
                );
            }
            const label = labelOf(computedSlot.sourceSlots[0] as TRowSlot);
            return node === DIAMOND_LEFT ? diamondLeftOf(label) : diamondRightOf(label);
        },
        sameValueGuard: isOIMSameValueZero,
    });
    const diamondComputedStoreSlot: TChurnComputedStoreSlot = diamondComputedService.createStoreSlot(db);

    const subscribeHead = (
        at: number,
        computedService: TChurnComputedService,
        computedStoreSlot: TChurnComputedStoreSlot,
        firstKey: number,
        keyCount: number,
    ): string => {
        const headKey = firstKey + keyCount - 1;
        for (let key = firstKey; key < headKey; key++) computedService.holdSlotByKey(computedStoreSlot, key);
        const head = computedService.holdSlotByKey(computedStoreSlot, headKey);
        effects[at] = OIMEffectService.INSTANCE.createEffect(db, () => {
            readHead(at, head.value);
        }, NO_ROOT_SLOTS, [head]);
        for (let key = firstKey; key <= headKey; key++) {
            const derivationSlot = computedService.getSlotByKey(computedStoreSlot, key);
            derivationSlot.owner.unholdSlot(derivationSlot);
        }
        return head.value;
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
    const db = new OIMDB({ channelScheduler: null });
    const effectService = OIMEffectService.INSTANCE;
    const entityService = createRowEntityService();
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
                db, churnBody(at, churnSlots[from]), sourcesOf(from, count), NO_SOURCE_COMPUTEDS
            );
            churnRead[at] = labelOf(churnSlots[from]);
        },
        mountOnColumn: at => {
            const slot = churnSlots[0];
            const columnSlot = entityService.columnSlotService.holdColumnSlot(slot, 'label');
            churnEffects[at] = effectService.createEffect(db, churnBody(at, slot), [columnSlot]);
            entityService.columnSlotService.unholdColumnSlot(columnSlot);
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
            db.dispose();
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
    const db = new OIMDB({ channelScheduler: null });
    const entityService = createRowEntityService();
    const entityStoreSlot = entityService.createStoreSlot(db);
    /**
     * ONE GROUP, TWO INDEXES: everything filed under the group, and the subset on the
     * second axis. A composite predicate is a second index over the same collection,
     * and a row off the axis answers with a key nobody holds — which is filed nowhere.
     * The price of the second index is one `selectKey` call and one key comparison per
     * write that changes `id` or `group`, paid inside this binding's writes.
     */
    const orderByGroup = groupOrderStrategy.createGroupOrders(entityService, entityStoreSlot, GROUP_COLUMN, OIMSlotNeverReleasePolicy.INSTANCE);
    const orderByGroupOnAxis = groupOrderStrategy.createGroupOrders(entityService, entityStoreSlot, {
        columns: ['id', 'group'],
        selectKey: row => (onSecondAxis(row.id) ? row.group : OFF_THE_SECOND_AXIS),
    });
    const windows = createWindowViews<TGroupOrder, TOrderedSlots>(db, view.window, (consumer, visible) => {
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
            for (let i = 0; i < views.length; i++) views[i].paint();
        }),
        ...pinNothing,
        // NOTHING IS RESOLVED BEFORE THIS CALL AND NOTHING IS KEPT AFTER IT — the lookup
        // is what the row measures, and every key the plan names is a row that exists
        // (dataset.ts builds them from `rows`).
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const entity = entityService.peekSlotByKey(entityStoreSlot, keys[from + i])?.entity;
                if (entity !== undefined) found.push(entity);
            }
            deliverPage(consumers.a, found, 0, count);
        },
        // THE WINDOW MOVES AND THE DATA DOES NOT. `shapeMoved` is set because the SET
        // OF VISIBLE ROWS changed, and it is what makes the next frame re-point one
        // subscription per visible row.
        scrollTo: to => {
            views[0].scrollTo(to);
        },
        // Held before the old key is given back, so a switch to the same group keeps its order.
        switchGroup: group => {
            views[0].switchGroup(group);
        },
        // THE GROUP INDEX AND NOT THE AXIS ONE: the audit asks for a whole group.
        groupOrder: group => groupOrderOf(orderByGroup, group),
        dispose: () => {
            db.dispose();
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
    const db = new OIMDB({ channelScheduler: null });
    const effectService = OIMEffectService.INSTANCE;
    const rowEntityService = createRowEntityService();
    const rowEntityStoreSlot = rowEntityService.createStoreSlot(db);
    // The SECOND ENTITY TYPE, and into the SAME channel, so a frame that wrote both
    // types is one frame and one flush.
    const ownerEntityService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TOwner>({ entityWriter: createOIMInPlaceEntityWriter({ entityInserter: insertOIMEntityWithCopy }) }) });
    const ownerEntityStoreSlot = ownerEntityService.createStoreSlot(db);
    // The records keyed by a COMBINATION OF IDENTITIES. The descent compares nothing:
    // rebuilding `[a, b]` from the same two slots arrives at the same node.
    const pairEntityService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TPairEntity, TPairKey>(), slotStoreService: new OIMSlotTreeStoreService<TOIMEntitySlot, TPairSlot>(OIMCompositeKeyTreeWalk.INSTANCE) });
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
        // A first load into an empty collection, one batch of by-key writes.
        writeOwners: incoming => {
            ownerEntityService.writeInBatch(ownerEntityStoreSlot, () => (incoming).map(entity => ownerEntityService.writeSlotContentByKey(ownerEntityStoreSlot, entity.id, entity)));
        },
        // EVERY IDENTITY BOTH SCRIPTS WORK THROUGH, RESOLVED ONCE AND HELD, and the pair
        // records created at their seeds. The pair records go in through `writeSlotContentByKey`, the
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
                    pairEntityService.writeSlotContentByKey(pairEntityStoreSlot, (pair => [pair.owner, pair.row])({
                        owner: rowOwnerSlots[i],
                        row: rowSlots[i],
                        mark: given.seeds[i],
                    }), {
                        owner: rowOwnerSlots[i],
                        row: rowSlots[i],
                        mark: given.seeds[i],
                    })
                );
            }
            for (let at = 0; at < touchedSlots.length; at++) {
                effectService.createEffect(db, () => {
                    namesPending = true;
                }, [touchedSlots[at]], NO_SOURCE_COMPUTEDS);
            }
            for (let i = 0; i < pairSlots.length; i++) {
                effectService.createEffect(db, () => {
                    marksPending = true;
                }, [pairSlots[i]], NO_SOURCE_COMPUTEDS);
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
            db.dispose();
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
 * TWO STANDALONE RECORDS ON ONE CHANNEL, EACH UNDER ITS OWN EFFECT. One createOIMSingleSlotService makes a store slot for each
 * (createStoreSlot(db), holdSingleSlot, slotContentService.writeSlotContent); the slot is written through its slotContentService's `updateEntity` and `updateEntityColumn`.
 */
const bindSingleStore = (participantName: string, consumers: TConsumers): TSingleBinding => {
    const db = new OIMDB({ channelScheduler: null });
    const effectService = OIMEffectService.INSTANCE;
    /** The value the scripts write, and the one no step of either writes. */
    const entityService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<{ value: string }>() });
    const slotContentService = entityService.slotContentService;
    const valueEntitySlot = entityService.holdSingleSlot(entityService.createStoreSlot(db));
    slotContentService.writeSlotContent(valueEntitySlot, { value: '' });
    const bystanderEntitySlot = entityService.holdSingleSlot(entityService.createStoreSlot(db));
    slotContentService.writeSlotContent(bystanderEntitySlot, { value: '' });
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
                effectService.createEffect(db, () => {
                    const item = valueEntitySlot.entity;
                    read = item === undefined ? '' : item.value;
                    woke = true;
                }, [valueEntitySlot], NO_SOURCE_COMPUTEDS)
            );
            effects.push(
                effectService.createEffect(db, () => {
                    const item = bystanderEntitySlot.entity;
                    readBystander = item === undefined ? '' : item.value;
                    wokeBystander = true;
                }, [bystanderEntitySlot], NO_SOURCE_COMPUTEDS)
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
    version: '4.1.0',
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
    // The only place in this suite `OIMSlotTreeStoreService` is exercised at all.
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
    'measured against source that is not released: @oimdb/core is imported from the working tree, ' +
    'ahead of the published 4.0.1. Two things it does that no other row pays for or is credited with: ' +
    'an index bucket is minted only when a key is ' +
    'held, so the two-view bindings file into the two groups a view watches and into no other, ' +
    'where several rows here keep a bucket per group whether or not anybody watches it — the ' +
    'fifty-view binding holds all fifty and files into all fifty; and on the wide mount shape the ' +
    'subscriber is registered over every churn row it is asked for while its body reads the first ' +
    'of them alone. Every binding with entity collections tears down with one ' +
    'db.dispose() and clears its own arrays: no effect is detached and no hold ' +
    'given back one at a time, because a dropped channel neither schedules nor runs a frame, so no ' +
    'effect body runs again. The single binding disposes its two effects and keeps its channel.';

export const oimdbAdapter: TAdapter = oimdbAdapterWith({
    name: 'oimdb',
    docs:
        'packages/core/dist (the built package, as a consumer gets it) — createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService() }) on one ' +
        'OIMDB with the default entity writer, createOIMInPlaceEntityWriter(), and one createStoreSlot(db) as the instance; every load goes in through ' +
        'entityService.writeSlotContentByKey(entityStoreSlot, id, row) for each row inside entityService.writeInBatch; a label or note patch assigns slot.entity in ' +
        'place and calls slotContentService.markEntityChanged with that one column, a group or rank move is slotContentService.updateEntityColumn on the slot entityService.getSlotByKey returns; ' +
        'a createOIMSlotCollectionIndexService with an OIMSetBucketContentService over the group column, with indexService.createIndexStoreSlot(entityStoreSlot) as its instance, files each write into its buckets from selectKey, and a ' +
        'createOIMSortedComputedService over that index service (rank then id, as sortColumns, so only a write that ' +
        'changes rank or id on a member re-sorts), read through createSortedStoreSlot(indexStoreSlot), keeps the order of a held group as a computed slot; the ' +
        'read views wake on that order too, one per index; the churn chain levels are slots of one ' +
        'createOIMComputedService store slot and the diamond nodes slots of another, each keyed by subscriber and ' +
        'level, under one OIMEffectService.INSTANCE.createEffect(db, …) on the head; a frame of the window ' +
        'and read bindings is one entityService.writeInBatch(entityStoreSlot, …) batch',
    departure: OIMDB_DEPARTURE,
    admission:
        'the row values live in the library — an entity service\'s slots, written through ' +
        'writeSlotContentByKey and its slotContentService\'s updateEntityColumn and markEntityChanged, and read back as slot.entity — and the change signal is the ' +
        'library\'s own OIMEffectService effect over a slot, a column, a bucket or an index order, ' +
        'delivered at the frame flush; the GROUP FILING and the ORDER are the library\'s too, an OIMSlotCollectionIndexService ' +
        'whose selectKey runs on each write, moves the row between its buckets itself and ' +
        'an OIMSortedComputedService re-sorts a held group\'s order when a write touches the sorter\'s columns.',
}, GROUP_ORDER_SORTED_AT_READ);

export const oimdbSortedIndexAdapter: TAdapter = oimdbAdapterWith({
    name: 'oimdb-sorted-index',
    docs:
        'packages/core/dist (the built package, as a consumer gets it) — the same wiring as the oimdb row ' +
        'except for group order: a createOIMSlotCollectionSortedArrayIndexService over the group column with sortColumns ' +
        'rank then id, and indexService.createIndexStoreSlot(entityStoreSlot) as its instance, files each write into its buckets from selectKey and keeps every bucket in that order at ' +
        'the write, so there is no createOIMSortedComputedService; a window or read view reads its page ' +
        'with indexService.slotContentService.getBucketMemberSlotCount and getBucketMemberSlotAt from its offset, and its order effect has the ' +
        'held bucket slot as a root slot, which the index writes when membership changes or a member\'s rank ' +
        'or id changes; the read binding builds two such indexes, the group and the second axis',
    departure: OIMDB_DEPARTURE,
    admission:
        'the row values live in the library — an entity service\'s slots, written through ' +
        'writeSlotContentByKey and its slotContentService\'s updateEntityColumn and markEntityChanged, and read back as slot.entity — and the change signal is the ' +
        'library\'s own OIMEffectService effect over a slot, a column or a bucket, ' +
        'delivered at the frame flush; the GROUP FILING and the ORDER are the library\'s too, an OIMSlotCollectionSortedArrayIndexService ' +
        'whose selectKey runs on each write, moves the row between its buckets itself and ' +
        'keeps each bucket sorted by rank then id at the write.',
}, GROUP_ORDER_SORTED_AT_WRITE);
