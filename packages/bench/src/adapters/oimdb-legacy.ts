import {
    EOIMEventQueueEventType,
    OIMCarrierKeyedFieldEmitter,
    OIMCollectionStoreTrieDriven,
    OIMComputed,
    OIMEffect,
    OIMEventQueue,
    OIMFieldMaskRegistry,
    OIMReactiveCollection,
    OIMReactiveObject,
    OIMSlotWriterFieldMasked,
    createMergeEntityUpdater,
    createOIMCollectionKit,
    ctk,
    getOIMComputeRuntime,
    on,
} from '../../../core-legacy/dist/index.js';
import type {
    IOIMEffectDependency,
    TOIMAnyEntitySlot,
    TOIMEntitySlot,
    TOIMKeyPath,
} from '../../../core-legacy/dist/index.js';
import type {
    BenchConsumer,
    TConsumers,
    TViewBinding,
} from '../harness/consumer';
import { compareRows, onSecondAxis } from '../harness/dataset';
import { chainLevelOf, diamondJoinOf, diamondLeftOf, diamondRightOf } from '../harness/derivations';
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

// THE PREVIOUS ENGINE, measured against the one that replaced it. The rest:
// `oimdb-legacy.md`.
const bindViews = (
    bindings: readonly TViewBinding[],
    view: TViewConfig
): TBinding => {
    const queue = new OIMEventQueue();
    const kit = createOIMCollectionKit<TRow, string>(queue, {
        selectPk: row => row.id,
        slotWriter: new OIMSlotWriterFieldMasked<TRow, string>(
            queue,
            createMergeEntityUpdater<TRow>()
        ),
    });
    const byGroup = kit.indexFactory.derivedArrayIndex<string>(
        row => row.group,
        {
            compareEntities: compareRows,
            // Which bucket a row is in reads `group`; the order reads `rank` and `id`.
            deps: ['group', 'rank', 'id'],
        }
    );

    type TView = {
        key: string;
        consumer: BenchConsumer;
        /** Set by the bucket's own subscription: the window may have moved. */
        shapeMoved: boolean;
        /** Set by anything: something this view shows has changed. */
        pending: boolean;
        /** Per-slot unsubscribes, one per row currently in the window. */
        watching: (() => void)[];
        /** The rows handed to the consumer — reused, so a render allocates nothing. */
        visible: TRow[];
    };

    const stops: (() => void)[] = [];

    const makeView = (
        group: string,
        consumer: BenchConsumer
    ): TView => {
        const state: TView = {
            key: group,
            consumer,
            shapeMoved: true,
            pending: false,
            watching: [],
            visible: [],
        };
        // Subscribing before any data exists RESERVES the bucket carrier, so the
        // derived index marks the very same object the first write touches. The rest:
        // `oimdb-legacy.md`.
        stops.push(
            byGroup.emitter.subscribeOnKey(group, () => {
                state.shapeMoved = true;
                state.pending = true;
            })
        );
        return state;
    };

    const resync = (state: TView): void => {
        for (let i = 0; i < state.watching.length; i++) state.watching[i]();
        state.watching.length = 0;
        state.visible.length = 0;
        // The LIVE bucket, no defensive copy — `getSlotsByKey` is documented
        // valid until the next write, and this runs at the end of a frame.
        // `getEntitiesByKey` would materialise ~200 rows to show 32.
        const slots = byGroup.getSlotsByKey(state.key);
        const upto = slots.length < view.window ? slots.length : view.window;
        for (let i = 0; i < upto; i++) {
            const entity = slots[i].item as TRow | undefined;
            if (entity === undefined) continue;
            state.visible.push(entity);
            // Content: dropped again the moment it scrolls out.
            state.watching.push(
                kit.collection.emitter.subscribeOnKey(entity.id, () => {
                    state.pending = true;
                })
            );
        }
    };

    /** Re-read the visible entities without touching the subscriptions. */
    const refresh = (state: TView): void => {
        state.visible.length = 0;
        const slots = byGroup.getSlotsByKey(state.key);
        const upto = slots.length < view.window ? slots.length : view.window;
        for (let i = 0; i < upto; i++) {
            const entity = slots[i].item as TRow | undefined;
            if (entity !== undefined) state.visible.push(entity);
        }
    };

    // ONE PER VIEW — two, or fifty. Subscribing RESERVES a bucket carrier, so
    // fifty subscriptions reserve fifty; the index maintained every bucket anyway.
    const views: TView[] = bindings.map(bound =>
        makeView(bound.group, bound.consumer)
    );

    // THE CELL WIRING, empty until `pin` — and the one adapter where the pin is HALF a
    // pin, which is a fact about 3.12.1 rather than about this file. The rest:
    // `oimdb-legacy.md`.
    const pinnedSlots: TOIMEntitySlot<TRow, string>[] = [];
    /** The same rows' primary keys, in pin order — the only address a WRITE has. */
    const pinnedPks: string[] = [];
    const cellStops: (() => void)[] = [];
    let cells: TCellConfig = { ids: [], ranks: [] };
    const labelText: string[] = [];
    const noteText: string[] = [];
    let cellsPending = false;
    // The two consumers the cell views deliver into: the FIRST TWO of this wiring,
    // which under `bind` are A and B. The rest: `oimdb-legacy.md`.
    const labelConsumer = views[0].consumer;
    const noteConsumer = views[1].consumer;

        // Both cell views out of the pinned slots, because one keyed event marked
        // both. Why `slot.item` is read per render and not captured: `oimdb-legacy.md`.
    const renderCells = (): void => {
        for (let i = 0; i < pinnedSlots.length; i++) {
            const item = pinnedSlots[i].item;
            labelText[i] = item === undefined ? '' : item.label;
            noteText[i] = item === undefined ? '' : item.note;
        }
        deliverCells(labelConsumer, cells, labelText);
        deliverCells(noteConsumer, cells, noteText);
    };

    // FRAME_END, not AFTER_FLUSH: the queue no longer refuses writes or
    // re-subscription, which a render does every time the window's shape changed.
    // AFTER_FLUSH is the effect phase and is still inside the frame.
    const unsubscribeFrame = queue.emitter.on(
        EOIMEventQueueEventType.FRAME_END,
        () => {
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
                deliver(state.consumer, state.visible, view.window);
            }
        }
    );

    return {
        // The collection's own rule: `upsertMany` merges by primary key and the
        // field-masked writer decides whether the result is worth publishing. The rest:
        // `oimdb-legacy.md`.
        write: incoming => {
            kit.collection.upsertMany(incoming as TRow[]);
        },
        // `removeManyByPks` drops the slots and notifies the batch channel with the
        // removed keys, which is what the derived index walks. The rest:
        // `oimdb-legacy.md`.
        remove: ids => {
            kit.collection.removeManyByPks(ids);
        },
        patchLabel: (id, label) => {
            kit.collection.upsertOneByPk(id, { label });
        },
        patchNote: (id, note) => {
            kit.collection.upsertOneByPk(id, { note });
        },
        setGroup: (id, group) => {
            kit.collection.upsertOneByPk(id, { group });
        },
        setRank: (id, rank) => {
            kit.collection.upsertOneByPk(id, { rank });
        },
            // THE SLOTS, RESOLVED ONCE — for reading only. The slots are pinned and
            // `item` is read per render, one field load and no map read. What the
            // window wiring gives up in exchange: `oimdb-legacy.md`.
        pin: config => {
            unsubscribeFrame();
            for (const state of views) {
                for (const stop of state.watching) stop();
                state.watching.length = 0;
                state.visible.length = 0;
            }
            for (const stop of stops) stop();
            stops.length = 0;
            views.length = 0;
            cells = config;
            pinnedSlots.length = 0;
            pinnedPks.length = 0;
            for (let i = 0; i < config.ids.length; i++) {
                const slot = kit.collection.getSlotByPk(config.ids[i]);
                if (slot === undefined) continue;
                pinnedSlots.push(slot);
                pinnedPks.push(config.ids[i]);
            }
            labelText.length = pinnedSlots.length;
            noteText.length = pinnedSlots.length;
            for (let i = 0; i < pinnedPks.length; i++) {
                cellStops.push(
                    kit.collection.emitter.subscribeOnKey(pinnedPks[i], () => {
                        cellsPending = true;
                    })
                );
            }
            cellStops.push(
                queue.emitter.on(EOIMEventQueueEventType.FRAME_END, () => {
                    if (!cellsPending) return;
                    cellsPending = false;
                    renderCells();
                })
            );
            // Untimed: the state every sample starts from.
            renderCells();
        },
        // `upsertOneByPk` — the same call as `patchLabel`, because 3.12.1 has no other.
        // The pin saved this row nothing on the write side.
        patchPinnedLabel: (at, label) => {
            kit.collection.upsertOneByPk(pinnedPks[at], { label });
        },
        patchPinnedNote: (at, note) => {
            kit.collection.upsertOneByPk(pinnedPks[at], { note });
        },
        frame: run => run(),
        settle: () => queue.flush(),
        // THE POPULATION, asked of the collection. The store's own answer, not a copy
        // kept here — this adapter holds no map. The rest: `oimdb-legacy.md`.
        readAll: () => kit.collection.getAll(),
        deliverableRows: () => undefined,
        // THE INDEX'S OWN BUCKET, read the way both views read it. The rest:
        // `oimdb-legacy.md`.
        groupOrder: group => {
            const slots = byGroup.getSlotsByKey(group);
            const held: TRow[] = [];
            for (let i = 0; i < slots.length; i++) {
                const entity = slots[i].item as TRow | undefined;
                if (entity !== undefined) held.push(entity);
            }
            return orderedIdsOfRows(held);
        },
        dispose: () => {
            unsubscribeFrame();
            for (const state of views) {
                for (const stop of state.watching) stop();
                state.watching.length = 0;
            }
            views.length = 0;
            for (const stop of stops) stop();
            stops.length = 0;
            // The cell wiring, if `pin` ever installed any.
            for (const stop of cellStops) stop();
            cellStops.length = 0;
            pinnedSlots.length = 0;
            pinnedPks.length = 0;
            byGroup.destroy();
            kit.destroy();
            queue.destroy();
        },
    };
};

type TChurnFieldEmitter = OIMCarrierKeyedFieldEmitter<
    string,
    TOIMEntitySlot<TRow, string>
>;

// THE SAME STORE WITH NOTHING SUBSCRIBED TO IT — the same field-masked writer and the
// same merge updater, with NO DERIVED INDEX, and built without the kit because the
// column shape needs `createUpdateEmitter`. The rest: `oimdb-legacy.md`.
const bindChurnStore = (churnConsumer: BenchConsumer): TChurnBinding => {
    const queue = new OIMEventQueue();
    const fieldMaskRegistry = new OIMFieldMaskRegistry();
    const collection = new OIMReactiveCollection<TRow, string, TChurnFieldEmitter>(
        queue,
        {
            selectPk: row => row.id,
            slotWriter: new OIMSlotWriterFieldMasked<TRow, string>(
                queue,
                createMergeEntityUpdater<TRow>(),
                fieldMaskRegistry
            ),
            createUpdateEmitter: (eventQueue, carrierProvider) =>
                new OIMCarrierKeyedFieldEmitter(eventQueue, carrierProvider),
        }
    );
    const computeRuntime = getOIMComputeRuntime(queue);
    const labelMask = fieldMaskRegistry.maskOf(['label']);

    /** The churn rows' pks and slots, resolved once by `holdChurnRows`. */
    let churnPks: readonly string[] = [];
    const churnSlots: TOIMEntitySlot<TRow, string>[] = [];
    /** What each subscriber last read. */
    const churnRead: (string | undefined)[] = [];
    const stop: ((() => void) | undefined)[] = [];
    let churnWoke = 0;
    let churnId = '';
    let churnRank = 0;

    // The label of one churn row, read off its slot. `item` is read per call and never
    // captured: the merge updater ALLOCATES A NEW ENTITY per write.
    const labelAt = (at: number): string => {
        const item = churnSlots[at].item;
        return item === undefined ? '' : item.label;
    };

    return {
        write: incoming => {
            collection.upsertMany(incoming as TRow[]);
        },
        remove: ids => {
            collection.removeManyByPks(ids);
        },
        patchLabel: (id, label) => {
            collection.upsertOneByPk(id, { label });
        },
        patchNote: (id, note) => {
            collection.upsertOneByPk(id, { note });
        },
        setGroup: (id, group) => {
            collection.upsertOneByPk(id, { group });
        },
        setRank: (id, rank) => {
            collection.upsertOneByPk(id, { rank });
        },
        // A churn binding derives no view and no churn script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame: run => run(),
        // The flush runs the frame, and the subscriber bodies with it. What is left is
        // the frame boundary — one delivery if anything woke, none if nothing did.
        settle: () => {
            queue.flush();
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
        readAll: () => collection.getAll(),
        deliverableRows: () => undefined,
        /** NOTHING TO READ: no view is derived and no index is built. */
        groupOrder: () => undefined,
        // THE SLOTS, RESOLVED ONCE — the `getSlotByPk` a read would otherwise open
        // with. Untimed, for the reason on `TChurnBinding`. The rest:
        // `oimdb-legacy.md`.
        holdChurnRows: (ids, ranks) => {
            churnPks = ids;
            churnId = ids[0];
            churnRank = ranks[0];
            for (let i = 0; i < ids.length; i++) {
                const slot = collection.getSlotByPk(ids[i]);
                if (slot !== undefined) churnSlots.push(slot);
                churnRead[i] = undefined;
            }
        },
        mountOnRows: (at, from, count) => {
            if (count === 1) {
                stop[at] = collection.emitter.subscribeOnKey(
                    churnPks[from],
                    () => {
                        churnWoke++;
                        churnRead[at] = labelAt(from);
                    }
                );
                churnRead[at] = labelAt(from);
                return;
            }
            const readSources = (): string => {
                let text = '';
                for (let i = from + count - 1; i >= from; i--) {
                    text = labelAt(i);
                }
                return text;
            };
            stop[at] = collection.emitter.subscribeOnKeys(
                churnPks.slice(from, from + count),
                () => {
                    const text = readSources();
                    churnWoke++;
                    churnRead[at] = text;
                }
            );
            churnRead[at] = readSources();
        },
        mountOnColumn: at => {
            stop[at] = collection.emitter.subscribeOnKeyFields(
                churnPks[0],
                labelMask,
                () => {
                    churnWoke++;
                    churnRead[at] = labelAt(0);
                }
            );
            churnRead[at] = labelAt(0);
        },
        // Not `kit.computed`: the kit's scope has no removal, so an unmount would leak.
        mountOnChain: (at, from, count, depth) => {
            const roots: IOIMEffectDependency[] = new Array(count);
            for (let i = 0; i < count; i++) {
                roots[i] = on.collection(collection, churnPks[from + i]);
            }
            const chain: OIMComputed<string>[] = new Array(depth);
            chain[0] = new OIMComputed<string>(computeRuntime, {
                deps: roots,
                compute: () => {
                    let text = labelAt(from);
                    for (let i = from + 1; i < from + count; i++) {
                        text = `${text},${labelAt(i)}`;
                    }
                    return chainLevelOf(text, 1);
                },
            });
            for (let level = 1; level < depth; level++) {
                const below = chain[level - 1];
                chain[level] = new OIMComputed<string>(computeRuntime, {
                    deps: [on.computed(below)],
                    compute: () => chainLevelOf(below.get(), level + 1),
                });
            }
            const head = chain[depth - 1];
            const effect = new OIMEffect(computeRuntime, {
                deps: [on.computed(head)],
                run: () => {
                    churnWoke++;
                    churnRead[at] = head.get();
                },
            });
            stop[at] = () => {
                effect.destroy();
                for (let level = depth - 1; level >= 0; level--) {
                    chain[level].destroy();
                }
            };
            churnRead[at] = head.get();
        },
        mountOnDiamond: (at, from) => {
            const root = on.collection(collection, churnPks[from]);
            const left = new OIMComputed<string>(computeRuntime, {
                deps: [root],
                compute: () => diamondLeftOf(labelAt(from)),
            });
            const right = new OIMComputed<string>(computeRuntime, {
                deps: [root],
                compute: () => diamondRightOf(labelAt(from)),
            });
            const join = new OIMComputed<string>(computeRuntime, {
                deps: [on.computed(left), on.computed(right)],
                compute: () => diamondJoinOf(left.get(), right.get()),
            });
            const effect = new OIMEffect(computeRuntime, {
                deps: [on.computed(join)],
                run: () => {
                    churnWoke++;
                    churnRead[at] = join.get();
                },
            });
            stop[at] = () => {
                effect.destroy();
                join.destroy();
                right.destroy();
                left.destroy();
            };
            churnRead[at] = join.get();
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
            churnSlots.length = 0;
            churnRead.length = 0;
            collection.destroy();
            computeRuntime.destroy();
            queue.destroy();
        },
    };
};

// THE SAME STORE, ASKED TO READ — the same kit and the same derived index, plus a
// SECOND derived index whose key carries both predicates, and a keyed pull. The rest:
// `oimdb-legacy.md`.
const bindReadStore = (
    consumers: TConsumers,
    view: TViewConfig,
    plan: TPlan
): TReadBinding => {
    const queue = new OIMEventQueue();
    const kit = createOIMCollectionKit<TRow, string>(queue, {
        selectPk: row => row.id,
        slotWriter: new OIMSlotWriterFieldMasked<TRow, string>(
            queue,
            createMergeEntityUpdater<TRow>()
        ),
    });
    const byGroup = kit.indexFactory.derivedArrayIndex<string>(
        row => row.group,
        { compareEntities: compareRows, deps: ['group', 'rank', 'id'] }
    );
    const byAxis = kit.indexFactory.derivedArrayIndex<string>(
        row => `${row.group}${onSecondAxis(row.id) ? '#on' : '#off'}`,
        { compareEntities: compareRows, deps: ['group', 'rank', 'id'] }
    );
    const axisKey = `${view.groupA}#on`;
    let pagedGroup = view.groupA;

    type TReadView = {
        consumer: BenchConsumer;
        /** The bucket this view reads, and where in it. */
        slotsOf: () => readonly TOIMAnyEntitySlot<string>[];
        from: number;
        shapeMoved: boolean;
        pending: boolean;
        watching: (() => void)[];
        visible: TRow[];
    };

    const paged: TReadView = {
        consumer: consumers.a,
        slotsOf: () => byGroup.getSlotsByKey(pagedGroup),
        from: 0,
        shapeMoved: true,
        pending: false,
        watching: [],
        visible: [],
    };
    const onAxis: TReadView = {
        consumer: consumers.b,
        slotsOf: () => byAxis.getSlotsByKey(axisKey),
        from: 0,
        shapeMoved: true,
        pending: false,
        watching: [],
        visible: [],
    };

    const markPagedShapeMoved = (): void => {
        paged.shapeMoved = true;
        paged.pending = true;
    };

    const stops: (() => void)[] = [
        byGroup.emitter.subscribeOnKey(pagedGroup, markPagedShapeMoved),
        byAxis.emitter.subscribeOnKey(axisKey, () => {
            onAxis.shapeMoved = true;
            onAxis.pending = true;
        }),
    ];

    /** Re-read the page and re-point the per-slot content subscriptions. */
    const resync = (state: TReadView): void => {
        for (let i = 0; i < state.watching.length; i++) state.watching[i]();
        state.watching.length = 0;
        state.visible.length = 0;
        const slots = state.slotsOf();
        const upto = Math.min(slots.length, state.from + view.window);
        for (let i = state.from; i < upto; i++) {
            const entity = slots[i].item as TRow | undefined;
            if (entity === undefined) continue;
            state.visible.push(entity);
            state.watching.push(
                kit.collection.emitter.subscribeOnKey(entity.id, () => {
                    state.pending = true;
                })
            );
        }
    };

    /** Re-read the page without touching the subscriptions. */
    const refresh = (state: TReadView): void => {
        state.visible.length = 0;
        const slots = state.slotsOf();
        const upto = Math.min(slots.length, state.from + view.window);
        for (let i = state.from; i < upto; i++) {
            const entity = slots[i].item as TRow | undefined;
            if (entity !== undefined) state.visible.push(entity);
        }
    };

    /** Reused only by the pull. */
    const found: TRow[] = [];

    return {
        write: incoming => {
            kit.collection.upsertMany(incoming as TRow[]);
        },
        remove: ids => {
            kit.collection.removeManyByPks(ids);
        },
        patchLabel: (id, label) => {
            kit.collection.upsertOneByPk(id, { label });
        },
        patchNote: (id, note) => {
            kit.collection.upsertOneByPk(id, { note });
        },
        setGroup: (id, group) => {
            kit.collection.upsertOneByPk(id, { group });
        },
        setRank: (id, rank) => {
            kit.collection.upsertOneByPk(id, { rank });
        },
        // No read script pins anything.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame: run => run(),
        // ONE `getSlotByPk` PER KEY and one field load off the slot — 3.12.1's own
        // keyed read. Nothing is resolved in advance, which is the opposite of what
        // `pin` does.
        readKeys: (from, count) => {
            const keys = plan.readKeys;
            found.length = 0;
            for (let i = 0; i < count; i++) {
                const slot = kit.collection.getSlotByPk(keys[from + i]);
                const item = slot === undefined ? undefined : slot.item;
                if (item !== undefined) found.push(item);
            }
            deliverPage(consumers.a, found, 0, count);
        },
        // ONE NUMBER, and the window's subscriptions have to move with it: nothing
        // is written and no ordering is re-derived.
        scrollTo: to => {
            paged.from = to;
            paged.shapeMoved = true;
            paged.pending = true;
        },
        // The bucket subscription moves to the other key; `stops[0]` is view A's.
        switchGroup: group => {
            stops[0]();
            pagedGroup = group;
            stops[0] = byGroup.emitter.subscribeOnKey(group, markPagedShapeMoved);
            paged.from = 0;
            markPagedShapeMoved();
        },
        // The flush runs the engine's frame; the render happens after it returns,
        // outside the frame, because a re-sync re-subscribes and the queue refuses that
        // inside its effect phase.
        settle: () => {
            queue.flush();
            for (const state of [paged, onAxis]) {
                if (!state.pending) continue;
                state.pending = false;
                if (state.shapeMoved) {
                    state.shapeMoved = false;
                    resync(state);
                } else {
                    refresh(state);
                }
                deliverPage(state.consumer, state.visible, 0, view.window);
            }
        },
        readAll: () => kit.collection.getAll(),
        deliverableRows: () => undefined,
        /** The group index's own bucket — see the window wiring. */
        groupOrder: group => {
            const slots = byGroup.getSlotsByKey(group);
            const held: TRow[] = [];
            for (let i = 0; i < slots.length; i++) {
                const entity = slots[i].item as TRow | undefined;
                if (entity !== undefined) held.push(entity);
            }
            return orderedIdsOfRows(held);
        },
        dispose: () => {
            for (const state of [paged, onAxis]) {
                for (const stop of state.watching) stop();
                state.watching.length = 0;
                state.visible.length = 0;
            }
            for (const stop of stops) stop();
            stops.length = 0;
            found.length = 0;
            byGroup.destroy();
            byAxis.destroy();
            kit.destroy();
            queue.destroy();
        },
    };
};

// THE COMPOSITE KEY'S SHAPE, DECLARED ONCE — `ctk` returns the tuple builder and
// nothing else, so the segment ORDER lives in one place instead of being restated at
// every call site.
const pairKey = ctk<{ owner: string; row: string }>()(['owner', 'row']);

// THE SAME ENGINE HOLDING TWO ENTITY TYPES, AND THE ARM 4.0.0 DOES NOT SHIP: a
// composite key over a TUPLE OF SCALARS. The rest: `oimdb-legacy.md`.
const bindRelationStore = (consumers: TConsumers): TRelationBinding => {
    const queue = new OIMEventQueue();
    const rowsKit = createOIMCollectionKit<TRow, string>(queue, {
        selectPk: row => row.id,
        slotWriter: new OIMSlotWriterFieldMasked<TRow, string>(
            queue,
            createMergeEntityUpdater<TRow>()
        ),
    });
    /** THE SECOND ENTITY TYPE, in a collection of its own over its own key. */
    const ownersKit = createOIMCollectionKit<TOwner, string>(queue, {
        selectPk: owner => owner.id,
        slotWriter: new OIMSlotWriterFieldMasked<TOwner, string>(
            queue,
            createMergeEntityUpdater<TOwner>()
        ),
    });
    // THE RECORDS KEYED BY A TUPLE OF TWO SCALARS. The trie store is what makes
    // `TOIMKeyPath` a key at all; the map store would compare arrays by identity.
    const pairsKit = createOIMCollectionKit<TPairRow, TOIMKeyPath>(queue, {
        selectPk: pair => pairKey(pair),
        store: new OIMCollectionStoreTrieDriven<TPairRow>(),
        slotWriter: new OIMSlotWriterFieldMasked<TPairRow, TOIMKeyPath>(
            queue,
            createMergeEntityUpdater<TPairRow>()
        ),
    });

    let config: TRelationConfig = {
        ids: [],
        ranks: [],
        owners: [],
        touched: [],
        names: [],
        seeds: [],
    };
    /** The owner slot each rendered line's name comes from, in `ids` order. */
    const rowOwnerSlots: TOIMEntitySlot<TOwner, string>[] = [];
    /** The pair slot each rendered line's mark comes from, in `ids` order. */
    const pairSlots: TOIMEntitySlot<TPairRow, TOIMKeyPath>[] = [];
    const stops: (() => void)[] = [];
    let unsubscribeFrame: () => void = () => undefined;
    const nameText: string[] = [];
    const markText: string[] = [];
    let namesPending = false;
    let marksPending = false;

    const renderNames = (): void => {
        for (let i = 0; i < rowOwnerSlots.length; i++) {
            const item = rowOwnerSlots[i].item;
            nameText[i] = item === undefined ? '' : item.name;
        }
        deliverRelation(consumers.a, config, nameText);
    };

    const renderMarks = (): void => {
        for (let i = 0; i < pairSlots.length; i++) {
            const item = pairSlots[i].item;
            markText[i] = item === undefined ? '' : item.mark;
        }
        deliverRelation(consumers.b, config, markText);
    };

    return {
        write: incoming => {
            rowsKit.collection.upsertMany(incoming as TRow[]);
        },
        remove: ids => {
            rowsKit.collection.removeManyByPks(ids);
        },
        patchLabel: (id, label) => {
            rowsKit.collection.upsertOneByPk(id, { label });
        },
        patchNote: (id, note) => {
            rowsKit.collection.upsertOneByPk(id, { note });
        },
        setGroup: (id, group) => {
            rowsKit.collection.upsertOneByPk(id, { group });
        },
        setRank: (id, rank) => {
            rowsKit.collection.upsertOneByPk(id, { rank });
        },
        // No relation script pins: the targeted-delivery script is a two-view
        // script and is bound by `bind`.
        pin: () => undefined,
        patchPinnedLabel: () => undefined,
        patchPinnedNote: () => undefined,
        frame: run => run(),
        /** The second population, through the collection's own batch door. */
        writeOwners: owners => {
            ownersKit.collection.upsertMany(owners as TOwner[]);
        },
        // THE SLOTS BOTH SCRIPTS READ THROUGH, RESOLVED ONCE, and the pair records
        // created at their seeds — the mint is outside the clock, so every timed step
        // is a tuple built, a trie descent and an update. The rest: `oimdb-legacy.md`.
        holdRelation: given => {
            config = given;
            nameText.length = given.ids.length;
            markText.length = given.ids.length;
            for (let i = 0; i < given.ids.length; i++) {
                const slot = ownersKit.collection.getSlotByPk(given.owners[i]);
                if (slot !== undefined) rowOwnerSlots.push(slot);
            }
            const seeds: TPairRow[] = new Array(given.ids.length);
            for (let i = 0; i < given.ids.length; i++) {
                seeds[i] = {
                    owner: given.owners[i],
                    row: given.ids[i],
                    mark: given.seeds[i],
                };
            }
            pairsKit.collection.upsertMany(seeds);
            // The seeding frame is closed BEFORE anything subscribes, so the
            // mint marks nothing that a view would later be woken by.
            queue.flush();
            for (let i = 0; i < given.ids.length; i++) {
                const pk = pairKey(seeds[i]);
                const slot = pairsKit.collection.getSlotByPk(pk);
                if (slot !== undefined) pairSlots.push(slot);
                stops.push(
                    pairsKit.collection.emitter.subscribeOnKey(pk, () => {
                        marksPending = true;
                    })
                );
            }
            for (let at = 0; at < given.touched.length; at++) {
                stops.push(
                    ownersKit.collection.emitter.subscribeOnKey(
                        given.touched[at],
                        () => {
                            namesPending = true;
                        }
                    )
                );
            }
            // FRAME_END rather than AFTER_FLUSH, for the reason the window
            // wiring gives.
            unsubscribeFrame = queue.emitter.on(
                EOIMEventQueueEventType.FRAME_END,
                () => {
                    if (namesPending) {
                        namesPending = false;
                        renderNames();
                    }
                    if (marksPending) {
                        marksPending = false;
                        renderMarks();
                    }
                }
            );
            // Untimed: the state every sample starts from.
            renderNames();
            renderMarks();
        },
        // `upsertOneByPk` on the OWNERS collection — 3.12.1 has no slot-addressed
        // write, so the pin saved this call nothing, exactly as it saves
        // `patchPinnedLabel` nothing. The rest: `oimdb-legacy.md`.
        patchOwnerName: (at, name) => {
            ownersKit.collection.upsertOneByPk(config.touched[at], { name });
        },
        // BUILD THE TUPLE, DESCEND THE TRIE, WRITE THE MARK. The rest:
        // `oimdb-legacy.md`.
        writePair: (at, mark) => {
            pairsKit.collection.upsertOneByPk(
                pairKey({ owner: config.owners[at], row: config.ids[at] }),
                { mark }
            );
        },
        settle: () => queue.flush(),
        readAll: () => rowsKit.collection.getAll(),
        deliverableRows: () => undefined,
        /** NOTHING TO READ: no window, no group, no sort, no derived index. */
        groupOrder: () => undefined,
        readOwners: () => ownersKit.collection.getAll(),
        // EVERY PAIR RECORD, UNDER THE KEY THE STORE FILED IT AT — read off the SLOT
        // rather than out of the entity: `slot.pk` is the tuple the trie interned when
        // the record was filed, so these ids are where the engine actually put it.
        readPairs: () => {
            const held: TPairRow[] = [];
            const slots = pairsKit.collection.getAllSlots();
            for (let i = 0; i < slots.length; i++) {
                const item = slots[i].item;
                if (item === undefined) continue;
                const pk = slots[i].pk;
                held.push({
                    owner: String(pk[0]),
                    row: String(pk[1]),
                    mark: item.mark,
                });
            }
            return held;
        },
        dispose: () => {
            unsubscribeFrame();
            unsubscribeFrame = () => undefined;
            for (const stop of stops) stop();
            stops.length = 0;
            rowOwnerSlots.length = 0;
            pairSlots.length = 0;
            nameText.length = 0;
            markText.length = 0;
            pairsKit.destroy();
            ownersKit.destroy();
            rowsKit.destroy();
            queue.destroy();
        },
    };
};


// ONE `OIMReactiveObject` HOLDING TWO PROPERTIES, EACH SUBSCRIBED BY NAME. WHAT 3.12.1
// HAS FOR THIS TASK, and what it does not. It has no scalar and no standalone The rest:
// `oimdb-legacy.md`.
const bindSingleStore = (consumers: TConsumers): TSingleBinding => {
    const queue = new OIMEventQueue();
    const values = new OIMReactiveObject<string, string>(queue);
    const stops: (() => void)[] = [];
    let unsubscribeFrame: () => void = () => undefined;
    let name = '';
    let bystanderName = '';
    let read = '';
    let readBystander = '';
    let woke = false;
    let wokeBystander = false;

    const valueOf = (key: string): string => values.get(key) ?? '';

    return {
        ...noRowStore('oimdb-3.12.1'),
        holdSingle: config => {
            name = config.name;
            bystanderName = config.bystander;
            values.setProperty(name, config.seeds[0]);
            values.setProperty(bystanderName, config.seeds[1]);
            // The seeding frame is closed BEFORE anything subscribes, so the
            // writes above mark nothing a view would later be woken by — the move
            // `holdRelation` makes in this file for the same reason.
            queue.flush();
            read = config.seeds[0];
            readBystander = config.seeds[1];
            stops.push(
                values.emitter.subscribeOnKey(name, () => {
                    read = valueOf(name);
                    woke = true;
                })
            );
            stops.push(
                values.emitter.subscribeOnKey(bystanderName, () => {
                    readBystander = valueOf(bystanderName);
                    wokeBystander = true;
                })
            );
            unsubscribeFrame = queue.emitter.on(
                EOIMEventQueueEventType.FRAME_END,
                () => {
                    if (woke) {
                        woke = false;
                        deliverSingle(consumers.a, name, read);
                    }
                    if (wokeBystander) {
                        wokeBystander = false;
                        deliverSingle(consumers.b, bystanderName, readBystander);
                    }
                }
            );
            deliverSingle(consumers.a, name, read);
            deliverSingle(consumers.b, bystanderName, readBystander);
        },
        writeSingle: next => {
            values.setProperty(name, next);
        },
        readSingle: () => valueOf(name),
        readBystander: () => valueOf(bystanderName),
        frame: run => run(),
        // The flush runs the frame, and the subscriber bodies with it; the frame's own
        // handler renders whichever view was marked. The rest: `oimdb-legacy.md`.
        settle: () => {
            queue.flush();
        },
        dispose: () => {
            for (let i = 0; i < stops.length; i++) stops[i]();
            stops.length = 0;
            unsubscribeFrame();
            values.destroy();
            queue.destroy();
        },
    };
};


export const oimdbLegacyAdapter: TAdapter = {
    name: 'oimdb-3.12.1',
    version: '3.12.1',
    docs: 'packages/core-legacy, built bundle dist/index.js —createOIMCollectionKit + indexFactory.derivedArrayIndex',
    departure:
        "subscribed through collection.emitter and index.emitter, which the 3.x README never " +
        'mentions: the updateEventEmitter.subscribeOnKey its examples use does not exist in ' +
        "3.12.1's source, so the recipe here is the source rather than the shipped documentation. " +
        'The churn binding alone builds its collection as `new OIMReactiveCollection` instead of ' +
        "through createOIMCollectionKit, because the kit's options type has no createUpdateEmitter " +
        'and the column shape subscribes through OIMCarrierKeyedFieldEmitter.subscribeOnKeyFields. ' +
        "Its chain and diamond shapes build OIMComputed and OIMEffect on the queue's getOIMComputeRuntime " +
        "instead of kit.computed and kit.effect, because the kit's dispose scope has no removal and " +
        'an unmounted derivation would stay registered in it until the kit is destroyed.',
    admission:
        'the row columns live in the entity slots of a 3.12.1 collection and are grouped and ordered ' +
        "by its own derived array index; the change signal is the engine's keyed emitters — " +
        "collection.emitter per row and index.emitter per bucket — delivered at the event queue's " +
        'frame end.',

    reads: readShapes((consumers, view, plan) =>
        bindReadStore(consumers, view, plan)
    ),
    churn: churnShapes(consumers => bindChurnStore(consumers.a)),
    // "What does a composite key over scalars cost this project" is answered HERE and
    // on no other row — see `bindRelationStore`'s header.
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
