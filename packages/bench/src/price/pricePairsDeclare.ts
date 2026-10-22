import {
    OIMDB,
    OIMEffectService,
    OIMSlotContentBucketServiceSetDriven,
    createOIMEntityService,
    createOIMIndexService,
} from '../../../core/src/index';
import type { TOIMComputedSlot, TOIMEntitySlot, TOIMSlot } from '../../../core/src/index';
import { EPricePath } from './EPricePath';
import { priceDataset } from './priceDataset';
import { priceFixture } from './priceFixture';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';

/**
 * How many rows the index-declaration row builds over. 1024, so that one
 * operation costs tens of microseconds rather than milliseconds and a sample is
 * a few hundred of them rather than three — the estimator wants many operations
 * inside one clock reading, and this is the largest population that allows it.
 */
const DECLARED_OVER = 1024;

const noComputeds: readonly TOIMComputedSlot[] = [];

// Twenty allocations, read off OIMDB, OIMUnusedSlotCollector, OIMChannel and OIMErrorPolicyLogAndContinue: seven objects, three arrays, three sets, seven closures.
const handWrittenDatabase = (): object => {
    const slotsHeldUntilFlush: object[] = [];
    const unusedSlotCollector = { slotsHeldUntilFlush, openDepth: 0, isFlushing: false };
    const channelOptions = { unusedSlotCollector };
    const frame = {
        isRunning: false,
        openedAtRevision: 0,
        openedAtEpoch: 0,
        afterEachFrame: new Set<() => void>(),
    };
    const errorPolicy: { onError: ((error: unknown) => void) | undefined } = { onError: undefined };
    const pendingEffects: { isPending: boolean }[] = [];
    const clock = { revision: 0, epoch: 0 };
    const subframeCloseCallbacks = new Set<() => void>();
    const afterEachFlush = new Set<() => void>();
    const afterEachFrameBuffer: ((() => void) | undefined)[] = [];
    let subframesOpen = 0;
    const enlist = (effect: { isPending: boolean }): void => { pendingEffects.push(effect); };
    const collectError = (error: unknown): void => { errorPolicy.onError?.(error); };
    const runOnceOnSubframeClose = (callback: () => void): void => { subframeCloseCallbacks.add(callback); };
    const openSubframe = (): void => { subframesOpen++; };
    const closeSubframe = (): void => { subframesOpen--; };
    const writeWithoutFlushCheck = (slot: object): void => { clock.revision++; priceSink.floor = slot; };
    const write = (slot: object): void => { writeWithoutFlushCheck(slot); };
    const channel = {
        timer: undefined,
        timerDisposer: undefined,
        frame,
        unusedSlotCollector: channelOptions.unusedSlotCollector,
        onBeforeFlush: undefined,
        errorPolicy,
        pendingEffects,
        clock,
        enlist,
        flushRequested: false,
        dropped: false,
        collectError,
        subframesOpen,
        flushRequestedInSubframe: false,
        subframeCloseCallbacks,
        runOnceOnSubframeClose,
        openSubframe,
        closeSubframe,
        afterEachFlush,
        write,
        writeWithoutFlushCheck,
        isFlushing: false,
        afterEachFrameBuffer,
    };
    return {
        channel,
        unusedSlotCollector,
        entityWriter: undefined,
        slotStamp: undefined,
        slotReleasePolicy: undefined,
        indexKeysService: undefined,
    };
};

/**
 * EVERY PRICE THAT IS PAID ONCE, AT STARTUP OR AT A MOUNT.
 *
 * These ratios are the largest in the suite and they matter the least, which is
 * exactly why the table prints the path beside every ratio: a 40x charge on
 * something an application does once while it boots is not comparable with a
 * 1.4x charge on something it does per row per frame, and a table sorted by
 * ratio invites precisely that comparison. Read this group as absolute
 * microseconds against how many times an application will do it, and read the
 * per-write and per-read groups as ratios.
 *
 * THE HONEST DIFFICULTY OF THIS GROUP is that "the primitive a person would have
 * written instead" is often NOTHING. Nobody hand-writes a database object or a
 * frame; they write a `Map` and call the repaint themselves. So several floors
 * here are the smallest plausible hand-written stand-in rather than a like-for-
 * like equivalent, and each row says which of the two it is.
 */
export const pricePairsDeclare: readonly TPricePair[] = [
    {
        id: 'new-db.vs-hand-written-frame-state',
        path: EPricePath.PerDeclaration,
        ours: 'new OIMDB()',
        floor: 'the object a person keeps instead: a frame number and a queue',
        caveat:
            'NOT A LIKE-FOR-LIKE FLOOR. Nobody hand-writes a database; the nearest thing is the ' +
            'bookkeeping a person keeps beside their `Map`, which is a frame counter and a list of ' +
            'what to repaint. Ours constructs an unused-slot collector, a channel with its frame ' +
            'record, clock, error policy, pending-effect list, three handler sets and seven bound arrows, and ' +
            'the root that holds both. Direction: inflates our ratio without limit, and it is paid ' +
            'ONCE per application. It is on the table because a price nobody prints is a price ' +
            'nobody believes, not because the multiple means anything. What the absolute figure is ' +
            'MADE OF is what `new-db.vs-the-same-object-graph-by-hand` beside it is for.',
        build: () => {
            let frame = 0;
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) priceSink.ours = new OIMDB();
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            priceSink.floor = { frame: frame++, queued: [] };
                        }
                    },
                },
            };
        },
    },

    {
        id: 'new-db.vs-the-same-object-graph-by-hand',
        path: EPricePath.PerDeclaration,
        ours: 'new OIMDB()',
        floor:
            'the same twenty allocations written out — seven objects, three arrays, three sets and ' +
            'seven closures over them',
        caveat:
            'THIS ROW EXISTS TO SPLIT `new-db.vs-hand-written-frame-state`, WHOSE FLOOR IS TWO ' +
            'ALLOCATIONS AND WHOSE MULTIPLE THEREFORE HAS NO UPPER BOUND. What that row cannot ' +
            'say is whether the price of a database is its OBJECT GRAPH — twenty allocations ' +
            'that a person keeping the same state would also have made — or something about the ' +
            'class that carries it. This floor allocates the graph and nothing else, read off ' +
            '`OIMDB`, `OIMUnusedSlotCollector`, `OIMChannel` and the default ' +
            '`OIMErrorPolicyLogAndContinue`: the root, the collector and its ' +
            'tracked list, the options object `OIMDB` spreads for the channel, the channel, its ' +
            'frame record with its handler set, the error policy, the pending-effect list, the clock, ' +
            'the subframe-close and after-each-flush sets, the after-each-frame buffer, and the seven ' +
            'bound arrows `enlist`, `collectError`, `runOnceOnSubframeClose`, `openSubframe`, ' +
            '`closeSubframe`, `write` and `writeWithoutFlushCheck`. ' +
            'THE COUNT WAS SEVENTEEN, TRANSCRIBED FROM AN `OIMDB` THAT NO LONGER EXISTS, and no ' +
            'reading of this row taken against that floor is comparable with one taken against ' +
            'this one. ' +
            'WHAT IS LEFT IN THE RATIO is the class: two instance shapes with their field ' +
            'initialisers and the `OIMFlushScheduler` base constructor against object literals ' +
            'built in one place. A reading at 1.00 ' +
            'says the price IS the graph and the only way down is to hold fewer things at birth — ' +
            'which every candidate field would pay for with a test on a path that runs per frame ' +
            'or per write. Above 1.00 it says the construction costs more than what it ' +
            'constructs, and names the size of that. ' +
            'BOTH SIDES DROP EVERYTHING THEY MAKE, so both hand the collector the same shape of ' +
            'garbage at the same rate and the scavenges inside a pass are charged to numerator ' +
            'and denominator alike. Direction: this floor does far MORE than the floor of the row ' +
            'it splits — it is our own graph transcribed — so this ratio is not comparable with ' +
            'any other row in this table. It is a decomposition instrument and not a price.',
        build: () => {
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) priceSink.ours = new OIMDB();
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) priceSink.floor = handWrittenDatabase();
                    },
                },
            };
        },
    },

    {
        id: 'new-collection.vs-new-map',
        path: EPricePath.PerDeclaration,
        ours: 'entityService.createStoreSlot(db)',
        floor: 'new Map()',
        caveat:
            'A POPULATION AGAINST THE CONTAINER THAT WOULD HAVE HELD IT, with the entity service ' +
            'built once outside the clock, so what is timed is the instance and not the type. ' +
            'Ours also builds the store slot that carries the store and answers to the store-slot ' +
            'listener; the store itself is a `Map` of the same kind the floor makes. What the ' +
            'type costs — the key selector, the defaults read off `OIMDB`, the content services — ' +
            'is `new-entity-service.vs-new-map`\'s and is not in this number. Direction: inflates ' +
            'our ratio; paid once per population.',
        build: () => {
            const db = new OIMDB();
            const entityService = createOIMEntityService<TPriceDataRow>(db, { keyOf: row => row.id });
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            priceSink.ours = entityService.createStoreSlot(db);
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            priceSink.floor = new Map<string, TPriceDataRow>();
                        }
                    },
                },
            };
        },
    },

    {
        id: 'new-entity-service.vs-new-map',
        path: EPricePath.PerDeclaration,
        ours: 'createOIMEntityService(db, row => row.id)',
        floor: 'new Map()',
        caveat:
            'THE TYPE AGAINST THE CONTAINER THAT WOULD HAVE HELD ITS INSTANCES, and it does not ' +
            'include a store slot: no population is made here. Ours reads the defaults off `OIMDB` ' +
            'and `OIMDefaults`, builds the content-change listener list, the content batch list ' +
            'and the index-key positions, wires the internal owner, the entity content service and ' +
            'the store aggregate to one another, and keeps the key selector — which is the closure ' +
            'a caller passes and which the floor does not need because the caller writes `row.id` ' +
            'at every call site instead. The floor is the same `new Map()` as ' +
            '`new-collection.vs-new-map`, because a hand-written store has no per-type object ' +
            'at all: everything here is charged to us. Direction: inflates our ratio; paid once ' +
            'per entity type, however many populations are then made from it.',
        build: () => {
            const db = new OIMDB();
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            priceSink.ours = createOIMEntityService<TPriceDataRow>(db, { keyOf: row => row.id });
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            priceSink.floor = new Map<string, TPriceDataRow>();
                        }
                    },
                },
            };
        },
    },

    {
        id: 'index.hold-every-group-of-a-loaded-population-vs-hand-built-map',
        path: EPricePath.PerDeclaration,
        ours:
            'indexService.createIndexStoreSlot(entityStoreSlot) over `group` on a population already holding a thousand rows, ' +
            'holdSlotsByKeys every group, then disposeIndexStoreSlot and unholdSlot',
        floor: 'build a Map of Sets from the same thousand rows, then clear it',
        caveat:
            'THE ENGINE WALKS THE POPULATION AGAIN, SO THIS IS A DECLARATION ONCE MORE. It replaces ' +
            '`index-fill.over-a-loaded-population-vs-hand-built-map`, whose caller did the walk and ' +
            'the per-bucket write because the index of that day touched no population; the auto-index ' +
            'files every row it can see into a bucket the moment the bucket is minted ' +
            '(`OIMIndexService`\'s source-slot collection, through `collectBucketMemberSlotsForKey`), so a ' +
            '`holdSlotsByKeys` over all sixty-four groups is one walk of the thousand rows, one ' +
            '`keyOf` per row, one index-key write per row and one hold per row. No figure recorded ' +
            'under the old id attaches to this one. ' +
            'THE INDEX SERVICE IS BUILT ONCE OUTSIDE THE CLOCK, so the type is not in this number: ' +
            '`new-index-service.vs-new-map-of-sets` prices `createOIMIndexService` on its own. ' +
            'BOTH SIDES BUILD AND THEN GIVE BACK INSIDE THE CLOCK: ours disposes the index store slot — which ' +
            'drops its listener, releases its index-key position (a second walk of the population, ' +
            'clearing each row\'s cell) and clears every bucket, unholding each row — and then ' +
            'unholds the sixty-four buckets so each is released; the floor clears every set and ' +
            'then the map. The floor reads `row.group` off held copies; ours reads it through ' +
            '`slot.entity`. What ours buys that the floor cannot: the index keeps filing every ' +
            'later write, and each bucket is an identity that can be subscribed. Direction: ' +
            'inflates our ratio; paid once per index.',
        build: () => {
            const rows = priceDataset.makeRows(DECLARED_OVER);
            const names = priceDataset.groupNames();
            const db = new OIMDB();
            const entityService = createOIMEntityService<TPriceDataRow>(db, { keyOf: row => row.id });
            const entityStoreSlot = entityService.createStoreSlot(db);
            entityService.slotContentService.upsertEntities(entityStoreSlot, rows);
            db.flush();
            const held: TPriceDataRow[] = [];
            for (let i = 0; i < rows.length; i++) held.push({ ...rows[i] });
            const indexService = createOIMIndexService(db, {
                entityService,
                slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TPriceDataRow>>(),
                keyOf: (row: TPriceDataRow) => row.group,
            });
            const probeIndexStoreSlot = indexService.createIndexStoreSlot(entityStoreSlot);
            const probeBuckets = indexService.holdSlotsByKeys(probeIndexStoreSlot, names);
            let probeMembers = 0;
            for (let b = 0; b < probeBuckets.length; b++) {
                probeMembers += indexService.slotContentService.getBucketMemberSlotCount(probeBuckets[b]);
            }
            indexService.disposeIndexStoreSlot(probeIndexStoreSlot);
            for (let b = 0; b < probeBuckets.length; b++) {
                const probeBucket = probeBuckets[b];
                probeBucket.owner.unholdSlot(probeBucket);
            }
            if (probeMembers !== held.length) {
                throw new Error(
                    `price: the index filed ${probeMembers} of ${held.length} rows; the two arms ` +
                        'would not be building the same grouping.',
                );
            }
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            const indexStoreSlot = indexService.createIndexStoreSlot(entityStoreSlot);
                            const buckets = indexService.holdSlotsByKeys(indexStoreSlot, names);
                            priceSink.ours = indexStoreSlot;
                            indexService.disposeIndexStoreSlot(indexStoreSlot);
                            for (let b = 0; b < buckets.length; b++) {
                                const bucket = buckets[b];
                                bucket.owner.unholdSlot(bucket);
                            }
                        }
                        db.flush();
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            const byGroup = new Map<string, Set<TPriceDataRow>>();
                            for (let g = 0; g < names.length; g++) {
                                byGroup.set(names[g], new Set<TPriceDataRow>());
                            }
                            for (let r = 0; r < held.length; r++) {
                                const row = held[r];
                                const bucket = byGroup.get(row.group);
                                if (bucket !== undefined) bucket.add(row);
                            }
                            priceSink.floor = byGroup;
                            for (const bucket of byGroup.values()) bucket.clear();
                            byGroup.clear();
                        }
                    },
                },
            };
        },
    },

    {
        id: 'new-index-service.vs-new-map-of-sets',
        path: EPricePath.PerDeclaration,
        ours: 'createOIMIndexService(db, { entityService, slotContentService: new OIMSlotContentBucketServiceSetDriven(), keyOf: row => row.group })',
        floor: 'new Map() of Sets, empty',
        caveat:
            'THE INDEX TYPE ALONE: no store slot is made, so no listener is installed and no row is ' +
            'walked; `index.hold-every-group-of-a-loaded-population-vs-hand-built-map` is where ' +
            'the instance and its walk are priced. Ours builds the bucket service the index files ' +
            'into — its slot store, its set-driven slot service, its column owner options and the ' +
            'defaults read off `OIMDB` — and keeps the key selector and the entity service it ' +
            'listens to. The floor is an empty `Map` of `Set`s, the container a hand-built grouping ' +
            'starts from; it has no per-type object, so everything here is charged to us. ' +
            'Direction: inflates our ratio; paid once per index type.',
        build: () => {
            const db = new OIMDB();
            const entityService = createOIMEntityService<TPriceDataRow>(db, { keyOf: row => row.id });
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            priceSink.ours = createOIMIndexService(db, {
                                entityService,
                                slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TPriceDataRow>>(),
                                keyOf: (row: TPriceDataRow) => row.group,
                            });
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            priceSink.floor = new Map<string, Set<TPriceDataRow>>();
                        }
                    },
                },
            };
        },
    },

    {
        id: 'effect.attach-and-dispose-vs-set-add-delete',
        path: EPricePath.PerRelationship,
        ours: 'const effect = OIMEffectService.INSTANCE.createEffect(db, [slot], [], body); OIMEffectService.INSTANCE.disposeEffect(effect)',
        floor: 'set.add(handler); set.delete(handler)',
        caveat:
            'THE MOUNT AND THE UNMOUNT AS ONE OPERATION, because half of a subscription is not a ' +
            'thing a screen ever does. The only subscriber is an effect. ' +
            'Ours allocates a `TOIMEffect`, files it on the slot\'s effect list and holds the slot, asks whether ' +
            'the slot was written since the batch opened so a write already in it still reaches ' +
            'the newcomer, and on the way out clears its pending mark, swaps itself out of the ' +
            'list, unholds the slot and asks whether anything still keeps it. The one-element ' +
            'source array is built outside the clock, per slot, so the caller\'s literal is not ' +
            'charged. The floor adds to a `Set` somebody else has to remember to create, and can ' +
            'never tell the new subscriber about a write that already landed. Direction: inflates ' +
            'our ratio. Every slot here carries a value, so the unhold never releases an identity.',
        build: () => {
            const fixture = priceFixture(priceDataset.batch);
            const body = (): void => {
                priceSink.number++;
            };
            const effectService = OIMEffectService.INSTANCE;
            const db = fixture.db;
            const sourcesBySlot: (readonly TOIMSlot[])[] = [];
            for (let i = 0; i < fixture.slots.length; i++) sourcesBySlot.push([fixture.slots[i]]);
            const handlers = new Set<() => void>();
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const mask = sourcesBySlot.length - 1;
                        for (let i = 0; i < times; i++) {
                            const effect = effectService.createEffect(db, sourcesBySlot[i & mask], noComputeds, body);
                            effectService.disposeEffect(effect);
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            handlers.add(body);
                            handlers.delete(body);
                        }
                        priceSink.number = handlers.size;
                    },
                },
            };
        },
    },
];
