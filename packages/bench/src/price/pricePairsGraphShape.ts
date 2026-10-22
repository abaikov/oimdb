import { computed, effect, endBatch, signal, startBatch } from 'alien-signals';
import {
    OIMDB, OIMEffectService, OIMSlotStoreServiceSingleSlotDriven, createOIMComputedService, createOIMSingleEntityService,
} from '../../../core/src/index';
import type {
    OIMColumnOwnerPushDriven, OIMComputedService, OIMEffectSourceTracker, OIMSingleSlotService, OIMSlotContentEntityService,
    TOIMColumnSlot, TOIMComputedSlot, TOIMComputedStoreSlot, TOIMEntityColumnName, TOIMEntitySlot, TOIMSingleSlotStore,
} from '../../../core/src/index';
import { EPricePath } from './EPricePath';
import { priceSink } from './priceSink';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';

type TGraphRoot = { value: number };

type TGraphRootSlot = TOIMEntitySlot<TGraphRoot, void>;

type TAlienSignal = { (): number; (value: number): void };

const inertSide: TPriceSide = { reset: () => undefined, run: () => undefined };

const WRITES_PER_BATCHED_FRAME = 8;

const DEPTHS: readonly number[] = [1, 8, 64];

const ROOTS_READ_PER_RUN: readonly number[] = [1, 2, 4, 8, 16, 128];

const WRITES_PER_COALESCED_FRAME: readonly number[] = [1, 4, 16];

const valueOfRoot = (rootSlot: TGraphRootSlot): number => rootSlot.entity?.value ?? 0;

type TGraphComputedStoreSlot = TOIMComputedStoreSlot<TOIMSingleSlotStore<TOIMComputedSlot<number, void>>, number, void>;

type TGraphRootEntityService<TRoot extends object> = OIMSingleSlotService<
    TOIMEntitySlot<TRoot, void>,
    OIMSlotContentEntityService<TRoot, void, TOIMSingleSlotStore<TOIMEntitySlot<TRoot, void>>, TOIMEntityColumnName<TRoot>>,
    TOIMEntityColumnName<TRoot>, TOIMColumnSlot, OIMColumnOwnerPushDriven, Partial<TRoot>
>;

type TGraphComputedService = OIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>;

const createRootEntityService = <TRoot extends object = TGraphRoot>(db: OIMDB): TGraphRootEntityService<TRoot> =>
    createOIMSingleEntityService<TRoot>(db);

const createRootSlot = <TRoot extends object = TGraphRoot>(
    db: OIMDB, rootEntityService: TGraphRootEntityService<TRoot>, root: TRoot,
): TOIMEntitySlot<TRoot, void> => {
    const rootStoreSlot = rootEntityService.createStoreSlot(db);
    rootEntityService.slotContentService.upsertEntity(rootStoreSlot, root);
    return rootEntityService.holdSingleSlot(rootStoreSlot);
};

const createGraphComputedService = (): TGraphComputedService =>
    createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
        computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
    });

const valueOfComputedStoreSlot = (computedService: TGraphComputedService, computedStoreSlot: TGraphComputedStoreSlot): number => {
    const computedCollectionService = computedService.computedCollectionService;
    return computedCollectionService.slotContentService.getValueForSlot(
        computedCollectionService.getSlotByKey(computedStoreSlot, undefined),
    );
};

const createHeadOfComputedChain = (
    db: OIMDB, computedService: TGraphComputedService, rootSlot: TGraphRootSlot, depth: number,
): TGraphComputedStoreSlot => {
    let headComputedStoreSlot = computedService.createComputedStoreSlot(
        db,
        () => valueOfRoot(rootSlot) + 1,
        () => ({ sourceSlots: [rootSlot] }),
    );
    for (let i = 1; i < depth; i++) {
        const previousComputedStoreSlot = headComputedStoreSlot;
        headComputedStoreSlot = computedService.createComputedStoreSlot(
            db,
            () => valueOfComputedStoreSlot(computedService, previousComputedStoreSlot) + 1,
            () => ({ sourceComputeds: [computedService.computedCollectionService.getSlotByKey(previousComputedStoreSlot, undefined)] }),
        );
    }
    return headComputedStoreSlot;
};

const createHeadOfAlienChain = (rootSignal: TAlienSignal, depth: number): (() => number) => {
    let head: () => number = computed(() => rootSignal() + 1);
    for (let i = 1; i < depth; i++) {
        const previous = head;
        head = computed(() => previous() + 1);
    }
    return head;
};

type TGraphSourceReader = { readSourceSlot: (rootSlot: TGraphRootSlot) => TGraphRootSlot };

type TGraphHeadComputedSlot = TOIMComputedSlot<number, void>;

type TGraphEffectStrategy = {
    createRootsEffect: (
        db: OIMDB, body: (graphSourceReader: TGraphSourceReader) => void, declaredRootSlots: readonly TGraphRootSlot[],
    ) => object;
    createHeadEffect: (
        db: OIMDB, headComputedSlot: TGraphHeadComputedSlot, body: (headValue: number) => void,
        computedService: TGraphComputedService, headComputedStoreSlot: TGraphComputedStoreSlot,
    ) => object;
};

const declaredGraphSourceReader: TGraphSourceReader = { readSourceSlot: rootSlot => rootSlot };

const declaredGraphEffectStrategy: TGraphEffectStrategy = {
    createRootsEffect: (db, body, declaredRootSlots) => OIMEffectService.INSTANCE
        .createEffectImmediate(db, declaredRootSlots, [], () => body(declaredGraphSourceReader)),
    createHeadEffect: (db, headComputedSlot, body, computedService, headComputedStoreSlot) => OIMEffectService.INSTANCE
        .createEffectImmediate(db, [], [headComputedSlot], () => body(valueOfComputedStoreSlot(computedService, headComputedStoreSlot))),
};

const trackedGraphEffectStrategy: TGraphEffectStrategy = {
    createRootsEffect: (db, body) => OIMEffectService.INSTANCE
        .createEffectWithSourceTracking(db, (effectSourceTracker: OIMEffectSourceTracker) => body(effectSourceTracker)),
    createHeadEffect: (db, headComputedSlot, body) => OIMEffectService.INSTANCE
        .createEffectWithSourceTracking(db, (effectSourceTracker: OIMEffectSourceTracker) => {
            body(effectSourceTracker.readSourceComputedValue(headComputedSlot));
        }),
};

const readRootValue = (graphSourceReader: TGraphSourceReader, rootSlot: TGraphRootSlot): number =>
    valueOfRoot(graphSourceReader.readSourceSlot(rootSlot));

const oursStandingChain = (depth: number, writesPerFrame: number, graphEffectStrategy: TGraphEffectStrategy): TPriceSide => {
    const db = new OIMDB();
    const rootEntityService = createRootEntityService(db);
    const slotContentService = rootEntityService.slotContentService;
    const rootSlot = createRootSlot(db, rootEntityService, { value: 0 });
    const computedService = createGraphComputedService();
    const headComputedStoreSlot = createHeadOfComputedChain(db, computedService, rootSlot, depth);
    const headComputedSlot = computedService.computedCollectionService.holdSlotByKey(headComputedStoreSlot, undefined);
    const headEffect = graphEffectStrategy.createHeadEffect(db, headComputedSlot, headValue => {
        priceSink.number = headValue;
    }, computedService, headComputedStoreSlot);
    db.flush();
    let written = 0;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                for (let w = 0; w < writesPerFrame; w++) slotContentService.updateEntityColumn(rootSlot, 'value', ++written);
                db.flush();
            }
            priceSink.ours = headEffect;
        },
    };
};

const floorStandingChainBatched = (depth: number, writesPerFrame: number): TPriceSide => {
    const rootSignal: TAlienSignal = signal(0);
    const head = createHeadOfAlienChain(rootSignal, depth);
    const disposeHeadEffect = effect(() => {
        priceSink.number = head();
    });
    let written = 0;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                startBatch();
                for (let w = 0; w < writesPerFrame; w++) rootSignal(++written);
                endBatch();
            }
            priceSink.floor = disposeHeadEffect;
        },
    };
};

const floorStandingChainSingleWrite = (depth: number): TPriceSide => {
    const rootSignal: TAlienSignal = signal(0);
    const head = createHeadOfAlienChain(rootSignal, depth);
    const disposeHeadEffect = effect(() => {
        priceSink.number = head();
    });
    let written = 0;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) rootSignal(++written);
            priceSink.floor = disposeHeadEffect;
        },
    };
};

const oursBuildAndDispose = (depth: number): TPriceSide => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rootEntityService = createRootEntityService(db);
    const rootSlot = createRootSlot(db, rootEntityService, { value: 1 });
    const computedService = createGraphComputedService();
    const computedCollectionService = computedService.computedCollectionService;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                const headComputedStoreSlot = createHeadOfComputedChain(db, computedService, rootSlot, depth);
                const headEffect = effectService.createEffectImmediate(db, [], [computedCollectionService.getSlotByKey(headComputedStoreSlot, undefined)], () => {
                    priceSink.number = valueOfComputedStoreSlot(computedService, headComputedStoreSlot);
                });
                effectService.disposeEffect(headEffect);
                db.flush();
            }
            priceSink.ours = rootSlot;
        },
    };
};

const floorBuildAndDispose = (depth: number): TPriceSide => {
    const rootSignal: TAlienSignal = signal(1);
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                const head = createHeadOfAlienChain(rootSignal, depth);
                const disposeHeadEffect = effect(() => {
                    priceSink.number = head();
                });
                disposeHeadEffect();
            }
            priceSink.floor = rootSignal;
        },
    };
};

const oursReadsPerRun = (rootCount: number, graphEffectStrategy: TGraphEffectStrategy): TPriceSide => {
    const db = new OIMDB();
    const rootEntityService = createRootEntityService(db);
    const slotContentService = rootEntityService.slotContentService;
    const rootSlots: TGraphRootSlot[] = [];
    for (let r = 0; r < rootCount; r++) rootSlots.push(createRootSlot(db, rootEntityService, { value: 0 }));
    const sumEffect = graphEffectStrategy.createRootsEffect(db, graphSourceReader => {
        let total = 0;
        for (let r = 0; r < rootSlots.length; r++) total += readRootValue(graphSourceReader, rootSlots[r]);
        priceSink.number = total;
    }, rootSlots);
    db.flush();
    const mask = rootCount - 1;
    let cursor = 0;
    let written = 0;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                cursor = (cursor + 1) & mask;
                slotContentService.updateEntityColumn(rootSlots[cursor], 'value', ++written);
                db.flush();
            }
            priceSink.ours = sumEffect;
        },
    };
};

const floorReadsPerRun = (rootCount: number): TPriceSide => {
    const rootSignals: TAlienSignal[] = [];
    for (let r = 0; r < rootCount; r++) rootSignals.push(signal(0));
    const disposeSumEffect = effect(() => {
        let total = 0;
        for (let r = 0; r < rootSignals.length; r++) total += rootSignals[r]();
        priceSink.number = total;
    });
    const mask = rootCount - 1;
    let cursor = 0;
    let written = 0;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                cursor = (cursor + 1) & mask;
                rootSignals[cursor](++written);
            }
            priceSink.floor = disposeSumEffect;
        },
    };
};

const oursInactiveBranchWrite = (graphEffectStrategy: TGraphEffectStrategy): TPriceSide => {
    const db = new OIMDB();
    const rootEntityService = createRootEntityService(db);
    const slotContentService = rootEntityService.slotContentService;
    const flagSlot = createRootSlot(db, rootEntityService, { value: 1 });
    const activeSlot = createRootSlot(db, rootEntityService, { value: 0 });
    const inactiveSlot = createRootSlot(db, rootEntityService, { value: 0 });
    let bodyRunCount = 0;
    const branchEffect = graphEffectStrategy.createRootsEffect(db, graphSourceReader => {
        bodyRunCount++;
        priceSink.number = readRootValue(graphSourceReader, flagSlot) === 1
            ? readRootValue(graphSourceReader, activeSlot)
            : readRootValue(graphSourceReader, inactiveSlot);
    }, [flagSlot, activeSlot, inactiveSlot]);
    db.flush();
    let written = 0;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                slotContentService.updateEntityColumn(inactiveSlot, 'value', ++written);
                db.flush();
            }
            priceSink.number = bodyRunCount;
            priceSink.ours = branchEffect;
        },
    };
};

const floorInactiveBranchWrite = (): TPriceSide => {
    const flagSignal: TAlienSignal = signal(1);
    const activeSignal: TAlienSignal = signal(0);
    const inactiveSignal: TAlienSignal = signal(0);
    let bodyRunCount = 0;
    const disposeBranchEffect = effect(() => {
        bodyRunCount++;
        priceSink.number = flagSignal() === 1 ? activeSignal() : inactiveSignal();
    });
    let written = 0;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) inactiveSignal(++written);
            priceSink.number = bodyRunCount;
            priceSink.floor = disposeBranchEffect;
        },
    };
};

const oursCoalescedWrites = (writesPerFrame: number, graphEffectStrategy: TGraphEffectStrategy): TPriceSide => {
    const db = new OIMDB();
    const rootEntityService = createRootEntityService(db);
    const slotContentService = rootEntityService.slotContentService;
    const rootSlot = createRootSlot(db, rootEntityService, { value: 0 });
    const rootEffect = graphEffectStrategy.createRootsEffect(db, graphSourceReader => {
        priceSink.number = readRootValue(graphSourceReader, rootSlot);
    }, [rootSlot]);
    db.flush();
    let written = 0;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                for (let w = 0; w < writesPerFrame; w++) slotContentService.updateEntityColumn(rootSlot, 'value', ++written);
                db.flush();
            }
            priceSink.ours = rootEffect;
        },
    };
};

const floorPerWriteDelivery = (writesPerFrame: number): TPriceSide => {
    const rootSignal: TAlienSignal = signal(0);
    const disposeRootEffect = effect(() => {
        priceSink.number = rootSignal();
    });
    let written = 0;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                for (let w = 0; w < writesPerFrame; w++) rootSignal(++written);
            }
            priceSink.floor = disposeRootEffect;
        },
    };
};

const floorBatchedDelivery = (writesPerFrame: number): TPriceSide => {
    const rootSignal: TAlienSignal = signal(0);
    const disposeRootEffect = effect(() => {
        priceSink.number = rootSignal();
    });
    let written = 0;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                startBatch();
                for (let w = 0; w < writesPerFrame; w++) rootSignal(++written);
                endBatch();
            }
            priceSink.floor = disposeRootEffect;
        },
    };
};

const BOTH_ARMS = [
    'Ours is @oimdb/core from source: a void-key entity store slot root (createStoreSlot, slotContentService.upsertEntity, holdSingleSlot) of an OIMSingleSlotService from createOIMSingleEntityService, written through slotContentService.updateEntityColumn,',
    'void-key computed store slots (createComputedStoreSlot, computedCollectionService.slotContentService.getValueForSlot) of an OIMComputedService for anything derived, one effect from OIMEffectService, and db.flush() as the settle.',
    'The floor is alien-signals 3.2: signal, computed, effect, and startBatch/endBatch where the row says so.',
    'Every write stores a new number from a counter, so no write on either arm is stopped by a same-value check.',
    'Each arm runs in its own process.',
].join(' ');

const caveatOf = (sentences: readonly string[]): string => [...sentences, BOTH_ARMS].join(' ');

const trackedTwinCaveat = (declaredPairId: string, sentences: readonly string[]): string => caveatOf([
    ...sentences,
    `THIS IS THE SAME TASK AS ${declaredPairId}, with the same floor builder; only the ours effect differs.`,
    'The effect comes from OIMEffectService.createEffectWithSourceTracking instead of createEffectImmediate, and its dependencies are tracked at run time:',
    'each run reads its sources through effectSourceTracker (readSourceSlot for a root, readSourceComputedValue for a computed)',
    'instead of the root and computed lists declared once at build.',
    `Read this row against ${declaredPairId}: the difference between the two is the price of tracking against declaring on this task.`,
]);

const revisionClockCaveat = (depth: number): string => caveatOf([
    `ONE OPERATION IS ONE FRAME: ${WRITES_PER_BATCHED_FRAME} writes to the root and one settle, under a standing`,
    `chain of ${depth} derived nodes (each the previous plus one) and one effect reading the head.`,
    'The chain and the effect are built, and read once, outside the clock.',
    'ARCHITECTURAL POINT: a revision clock against dirty-mark propagation, measured as what a write costs under a deep standing graph.',
    'Ours stamps the root with the next revision on each write and enlists only the effects subscribed to the root;',
    'the effect is subscribed to the root slot of the chain directly, so no write walks the chain.',
    'At the flush the effect asks the head, each node asks its source, compares source stamps and re-derives, so the chain is walked once, at the read.',
    'Alien-signals walks the subscriber chain on the first write of the batch and flags every node pending',
    '(node_modules/alien-signals/esm/system.mjs, propagate), later writes in the same batch stop at the already-pending first node,',
    'and endBatch runs the effect, which pulls the chain and re-derives every node.',
    `Both arms re-derive all ${depth} nodes once and run the effect once per operation.`,
    'EXPECTED DIRECTION [FIGURE STATED IN ADVANCE]: the write side is constant for ours and grows with depth for alien,',
    'the read side grows with depth on both, so if the write-side walk is what separates them the ratio falls as depth grows;',
    'a ratio that stays flat across the three depths says the pull at the read dominates on both arms.',
]);

const subscriptionBuildCaveat = (depth: number): string => caveatOf([
    `ONE OPERATION IS ONE MOUNT AND UNMOUNT: create a chain of ${depth} derived nodes over a standing root,`,
    'create one effect over the head and run it once (which reads the whole chain), then dispose the effect.',
    'ARCHITECTURAL POINT: build at subscription against lazy linking, measured as what subscribing costs.',
    'Ours builds ONE OIMComputedService per side outside the clock and, per node inside it, one createComputedStoreSlot over OIMSlotStoreServiceSingleSlotDriven with its own derive and createSources:',
    'a store slot per relationship, not a service per node. Each node then mints its slot, holds its sources, merges the root list the effect subscribes to and subscribes the effect to the root and the head;',
    'disposal unsubscribes, and the flush that ends the operation releases every node, which unholds its sources down the chain.',
    'Alien-signals allocates one closure-backed node per computed and links dependencies as the first run reads them;',
    'disposing the effect unlinks it and each computed left without subscribers unlinks its own dependencies.',
    'EXPECTED DIRECTION [FIGURE STATED IN ADVANCE]: ours above alien at every depth, because ours pays for',
    'a declared, held, stamped graph up front, which is what the matching run rows are meant to pay back.',
    'Read this row together with the run row of the same depth.',
]);

const subscriptionRunCaveat = (depth: number): string => caveatOf([
    `ONE OPERATION IS ONE WRITE TO THE ROOT AND ONE SETTLE, under a standing chain of ${depth} derived nodes and one effect over the head.`,
    'ARCHITECTURAL POINT: build at subscription against lazy linking, measured as what running costs once the graph stands.',
    'Ours stamps the root, schedules the effect it subscribed to at build, and on flush pulls the chain by stamp comparison.',
    'Alien-signals has no settle call: the write propagates pending flags down the chain and runs the effect synchronously at the end of the write,',
    'with no batch; a batch of one write would add only the start and end calls.',
    'Read against the build row of the same depth: the build row is what ours pays up front, this row is whether it comes back per write.',
]);

const readsPerRunCaveat = (rootCount: number): string => caveatOf([
    `ONE OPERATION IS ONE WRITE TO ONE OF ${rootCount} ROOTS, chosen round-robin, AND ONE SETTLE; one effect reads every root and sums them.`,
    'ARCHITECTURAL POINT: declared against auto-tracked dependencies, measured as what each read inside a run costs.',
    `Ours declares the ${rootCount} root slots as the effect's sources once, at build;`,
    'a run checks each source stamp before the body and the body reads each entity, and nothing is re-linked.',
    'Alien-signals has no declaration: every run re-tracks, each read of a signal inside the body checks or re-creates its dependency link,',
    'and the run is synchronous at the end of the write, so there is no settle call.',
    'EXPECTED DIRECTION [FIGURE STATED IN ADVANCE]: the per-read cost of re-tracking grows with the number of roots on alien,',
    'so the ratio is expected to fall as the root count grows, if re-tracking costs more per read than the stamp check ours does per source.',
]);

const INACTIVE_BRANCH_CAVEAT = caveatOf([
    'ONE OPERATION IS ONE WRITE TO THE INACTIVE BRANCH AND ONE SETTLE.',
    'An effect reads a flag and then one of two values, and the flag selects the first, so the written value is one the body does not read.',
    'ARCHITECTURAL POINT: declared against auto-tracked dependencies, measured on a conditional branch.',
    'Ours has no auto-tracking: the flag and both values are declared as the effect\'s sources, so a write to the unread value',
    'schedules the effect and the flush runs the body.',
    'Alien-signals subscribed the effect only to what its last run read, so the write finds no subscriber and nothing runs;',
    'the floor is a signal store with no one listening.',
    'EXPECTED BODY RUNS PER OPERATION [FIGURE STATED IN ADVANCE]: alien 0, ours 1;',
    'both run counts are sunk into priceSink.number at the end of each pass.',
    'The ratio is therefore large by construction and prices the work ours does that the floor skips, not a slower path doing the same work.',
]);

const coalescingCaveat = (writesPerFrame: number): string => caveatOf([
    `ONE OPERATION IS ${writesPerFrame} WRITES TO ONE ROOT AND ONE SETTLE, with one effect reading the root.`,
    'ARCHITECTURAL POINT: frame coalescing against per-write delivery.',
    'Ours enlists the effect on the first write of the frame, finds it already changed in this frame on every later write,',
    'and runs the body once at the flush.',
    `Alien-signals with no batch runs the effect synchronously at the end of every write, so the body runs ${writesPerFrame} times per operation.`,
    'EXPECTED DIRECTION [FIGURE STATED IN ADVANCE]: with a single write ours pays the flush and alien pays nothing extra, so ours is above alien there;',
    'as writes per frame grow, alien pays one effect run per write and ours pays one in total, so the ratio is expected to fall.',
    'The batched row at the largest count is the fairness check.',
]);

const coalescingBatchedCaveat = (writesPerFrame: number): string => caveatOf([
    `ONE OPERATION IS ${writesPerFrame} WRITES TO ONE ROOT AND ONE SETTLE, with one effect reading the root, and THE FLOOR BATCHES.`,
    'ARCHITECTURAL POINT: frame coalescing against per-write delivery, with the floor given the coalescing it offers by hand.',
    'Ours enlists the effect on the first write and runs it once at the flush;',
    'alien-signals wraps the writes in startBatch/endBatch and runs the effect once at endBatch.',
    'Both arms run the body once per operation, so this row is the fairness check for the unbatched row of the same count:',
    'it shows how much of that row\'s difference is coalescing and how much is the cost of each write itself.',
]);

const revisionClockPairs: readonly TPricePair[] = DEPTHS.map(depth => ({
    id: `graph.revision-clock.batched-writes.d${depth}`,
    path: EPricePath.PerFrame,
    ours: `${WRITES_PER_BATCHED_FRAME}× updateEntityColumn on the root, then db.flush(), under ${depth} computed single-slot store slots and one effect over the head`,
    floor: `startBatch(); ${WRITES_PER_BATCHED_FRAME}× root(v); endBatch(), under ${depth} alien computeds and one alien effect over the head`,
    caveat: revisionClockCaveat(depth),
    isolate: true,
    build: wanted => ({
        ours: wanted === 'floor' ? inertSide : oursStandingChain(depth, WRITES_PER_BATCHED_FRAME, declaredGraphEffectStrategy),
        floor: wanted === 'ours' ? inertSide : floorStandingChainBatched(depth, WRITES_PER_BATCHED_FRAME),
    }),
}));

const subscriptionBuildPairs: readonly TPricePair[] = DEPTHS.map(depth => ({
    id: `graph.subscription.build.d${depth}`,
    path: EPricePath.PerRelationship,
    ours: `${depth} createComputedStoreSlot calls on one standing void-key OIMComputedService in a chain, createEffectImmediate over the head, disposeEffect, db.flush()`,
    floor: `${depth} alien computed() in a chain, effect() over the head, then its dispose()`,
    caveat: subscriptionBuildCaveat(depth),
    isolate: true,
    build: wanted => ({
        ours: wanted === 'floor' ? inertSide : oursBuildAndDispose(depth),
        floor: wanted === 'ours' ? inertSide : floorBuildAndDispose(depth),
    }),
}));

const subscriptionRunPairs: readonly TPricePair[] = DEPTHS.map(depth => ({
    id: `graph.subscription.run.d${depth}`,
    path: EPricePath.PerWrite,
    ours: `one updateEntityColumn on the root, then db.flush(), under a standing chain of ${depth} computed single-slot store slots and one effect`,
    floor: `one root(v) with no batch, under a standing chain of ${depth} alien computeds and one alien effect`,
    caveat: subscriptionRunCaveat(depth),
    isolate: true,
    build: wanted => ({
        ours: wanted === 'floor' ? inertSide : oursStandingChain(depth, 1, declaredGraphEffectStrategy),
        floor: wanted === 'ours' ? inertSide : floorStandingChainSingleWrite(depth),
    }),
}));

const subscriptionRunTrackedPairs: readonly TPricePair[] = DEPTHS.map(depth => ({
    id: `graph.subscription-tracked.run.d${depth}`,
    path: EPricePath.PerWrite,
    ours: `one updateEntityColumn on the root, then db.flush(), under a standing chain of ${depth} computed single-slot store slots and one OIMEffectService.createEffectWithSourceTracking effect reading the head through readSourceComputedValue`,
    floor: `one root(v) with no batch, under a standing chain of ${depth} alien computeds and one alien effect`,
    caveat: trackedTwinCaveat(`graph.subscription.run.d${depth}`, [
        `ONE OPERATION IS ONE WRITE TO THE ROOT AND ONE SETTLE, under a standing chain of ${depth} derived nodes and one effect over the head.`,
        'The tracked effect reads the head through effectSourceTracker.readSourceComputedValue, so the head computed is the one source it tracks.',
    ]),
    isolate: true,
    build: wanted => ({
        ours: wanted === 'floor' ? inertSide : oursStandingChain(depth, 1, trackedGraphEffectStrategy),
        floor: wanted === 'ours' ? inertSide : floorStandingChainSingleWrite(depth),
    }),
}));

const readsPerRunPairs: readonly TPricePair[] = ROOTS_READ_PER_RUN.map(rootCount => ({
    id: `graph.dependencies.reads-per-run.r${rootCount}`,
    path: EPricePath.PerWrite,
    ours: `updateEntityColumn on one of ${rootCount} roots, then db.flush(); one effect declaring all ${rootCount} root slots sums them`,
    floor: `one of ${rootCount} alien signals written with no batch; one alien effect reads and sums all of them`,
    caveat: readsPerRunCaveat(rootCount),
    isolate: true,
    build: wanted => ({
        ours: wanted === 'floor' ? inertSide : oursReadsPerRun(rootCount, declaredGraphEffectStrategy),
        floor: wanted === 'ours' ? inertSide : floorReadsPerRun(rootCount),
    }),
}));

const readsPerRunTrackedPairs: readonly TPricePair[] = ROOTS_READ_PER_RUN.map(rootCount => ({
    id: `graph.dependencies-tracked.reads-per-run.r${rootCount}`,
    path: EPricePath.PerWrite,
    ours: `updateEntityColumn on one of ${rootCount} roots, then db.flush(); one OIMEffectService.createEffectWithSourceTracking effect reads all ${rootCount} root slots through readSourceSlot and sums them`,
    floor: `one of ${rootCount} alien signals written with no batch; one alien effect reads and sums all of them`,
    caveat: trackedTwinCaveat(`graph.dependencies.reads-per-run.r${rootCount}`, [
        `ONE OPERATION IS ONE WRITE TO ONE OF ${rootCount} ROOTS, chosen round-robin, AND ONE SETTLE; one effect reads every root and sums them.`,
        `Each run reads the ${rootCount} roots through effectSourceTracker.readSourceSlot, so both arms re-track on every run.`,
    ]),
    isolate: true,
    build: wanted => ({
        ours: wanted === 'floor' ? inertSide : oursReadsPerRun(rootCount, trackedGraphEffectStrategy),
        floor: wanted === 'ours' ? inertSide : floorReadsPerRun(rootCount),
    }),
}));

const inactiveBranchPair: TPricePair = {
    id: 'graph.dependencies.inactive-branch.s3',
    path: EPricePath.PerWrite,
    ours: 'updateEntityColumn on the unread branch value, then db.flush(); the effect declares flag, active and inactive as sources',
    floor: 'inactive(v) with no batch; the alien effect reads flag() and then active() only',
    caveat: INACTIVE_BRANCH_CAVEAT,
    isolate: true,
    build: wanted => ({
        ours: wanted === 'floor' ? inertSide : oursInactiveBranchWrite(declaredGraphEffectStrategy),
        floor: wanted === 'ours' ? inertSide : floorInactiveBranchWrite(),
    }),
};

const inactiveBranchTrackedPair: TPricePair = {
    id: 'graph.dependencies-tracked.inactive-branch.s3',
    path: EPricePath.PerWrite,
    ours: 'updateEntityColumn on the unread branch value, then db.flush(); the OIMEffectService.createEffectWithSourceTracking effect reads flag and then active only, through readSourceSlot',
    floor: 'inactive(v) with no batch; the alien effect reads flag() and then active() only',
    caveat: trackedTwinCaveat('graph.dependencies.inactive-branch.s3', [
        'ONE OPERATION IS ONE WRITE TO THE INACTIVE BRANCH AND ONE SETTLE.',
        'An effect reads a flag and then one of two values, and the flag selects the first, so the written value is one the body does not read.',
        'The tracked effect read only the flag and the active value on its last run, so the write to the inactive value must wake nothing on either arm.',
        'EXPECTED BODY RUNS PER OPERATION [FIGURE STATED IN ADVANCE]: alien 0, ours 0;',
        'both run counts are sunk into priceSink.number at the end of each pass, and an ours count above 0 is a defect of the tracked strategy.',
    ]),
    isolate: true,
    build: wanted => ({
        ours: wanted === 'floor' ? inertSide : oursInactiveBranchWrite(trackedGraphEffectStrategy),
        floor: wanted === 'ours' ? inertSide : floorInactiveBranchWrite(),
    }),
};

const coalescingPairs: readonly TPricePair[] = WRITES_PER_COALESCED_FRAME.map(writesPerFrame => ({
    id: `graph.coalescing.unbatched.k${writesPerFrame}`,
    path: EPricePath.PerFrame,
    ours: `${writesPerFrame}× updateEntityColumn on one root, then db.flush(); one effect on the root runs once`,
    floor: `${writesPerFrame}× root(v) with no batch; the alien effect on the root runs after every write`,
    caveat: coalescingCaveat(writesPerFrame),
    isolate: true,
    build: wanted => ({
        ours: wanted === 'floor' ? inertSide : oursCoalescedWrites(writesPerFrame, declaredGraphEffectStrategy),
        floor: wanted === 'ours' ? inertSide : floorPerWriteDelivery(writesPerFrame),
    }),
}));

const coalescingTrackedPairs: readonly TPricePair[] = WRITES_PER_COALESCED_FRAME.map(writesPerFrame => ({
    id: `graph.coalescing-tracked.unbatched.k${writesPerFrame}`,
    path: EPricePath.PerFrame,
    ours: `${writesPerFrame}× updateEntityColumn on one root, then db.flush(); one OIMEffectService.createEffectWithSourceTracking effect reading the root through readSourceSlot runs once`,
    floor: `${writesPerFrame}× root(v) with no batch; the alien effect on the root runs after every write`,
    caveat: trackedTwinCaveat(`graph.coalescing.unbatched.k${writesPerFrame}`, [
        `ONE OPERATION IS ${writesPerFrame} WRITES TO ONE ROOT AND ONE SETTLE, with one effect reading the root.`,
        `Ours runs the body once at the flush; alien-signals with no batch runs it ${writesPerFrame} times per operation.`,
    ]),
    isolate: true,
    build: wanted => ({
        ours: wanted === 'floor' ? inertSide : oursCoalescedWrites(writesPerFrame, trackedGraphEffectStrategy),
        floor: wanted === 'ours' ? inertSide : floorPerWriteDelivery(writesPerFrame),
    }),
}));

const COALESCING_FAIRNESS_WRITES = 16;

const coalescingBatchedPair: TPricePair = {
    id: `graph.coalescing.batched.k${COALESCING_FAIRNESS_WRITES}`,
    path: EPricePath.PerFrame,
    ours: `${COALESCING_FAIRNESS_WRITES}× updateEntityColumn on one root, then db.flush(); one effect on the root runs once`,
    floor: `startBatch(); ${COALESCING_FAIRNESS_WRITES}× root(v); endBatch(); the alien effect on the root runs once`,
    caveat: coalescingBatchedCaveat(COALESCING_FAIRNESS_WRITES),
    isolate: true,
    build: wanted => ({
        ours: wanted === 'floor' ? inertSide : oursCoalescedWrites(COALESCING_FAIRNESS_WRITES, declaredGraphEffectStrategy),
        floor: wanted === 'ours' ? inertSide : floorBatchedDelivery(COALESCING_FAIRNESS_WRITES),
    }),
};

const ROW_HEIGHT_PX = 32;

const WRITES_PER_SCROLL_FRAME: readonly number[] = [1, 4];

const firstVisibleIndexOf = (scrollTopPx: number): number => Math.floor(scrollTopPx / ROW_HEIGHT_PX);

const oursScrollWindow = (writesPerFrame: number): TPriceSide => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rootEntityService = createRootEntityService(db);
    const slotContentService = rootEntityService.slotContentService;
    const rootSlot = createRootSlot(db, rootEntityService, { value: 0 });
    const indexComputedService = createGraphComputedService();
    const indexComputedStoreSlot = indexComputedService.createComputedStoreSlot(
        db,
        () => firstVisibleIndexOf(valueOfRoot(rootSlot)),
        () => ({ sourceSlots: [rootSlot] }),
    );
    let renderCount = 0;
    const renderEffect = effectService.createEffectImmediate(
        db, [], [indexComputedService.computedCollectionService.getSlotByKey(indexComputedStoreSlot, undefined)], () => {
            priceSink.number = valueOfComputedStoreSlot(indexComputedService, indexComputedStoreSlot);
            renderCount++;
        },
    );
    db.flush();
    let scrollTopPx = 0;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                for (let w = 0; w < writesPerFrame; w++) slotContentService.updateEntityColumn(rootSlot, 'value', ++scrollTopPx);
                db.flush();
            }
            priceSink.ours = renderEffect;
            priceSink.number = renderCount;
        },
    };
};

const floorScrollWindow = (writesPerFrame: number): TPriceSide => {
    const rootSignal: TAlienSignal = signal(0);
    const indexComputed = computed(() => firstVisibleIndexOf(rootSignal()));
    let renderCount = 0;
    const disposeRenderEffect = effect(() => {
        priceSink.number = indexComputed();
        renderCount++;
    });
    let scrollTopPx = 0;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                for (let w = 0; w < writesPerFrame; w++) rootSignal(++scrollTopPx);
            }
            priceSink.floor = disposeRenderEffect;
            priceSink.number = renderCount;
        },
    };
};

const scrollWindowCaveat = (writesPerFrame: number): string => caveatOf([
    `ONE OPERATION IS ${writesPerFrame} WRITE${writesPerFrame === 1 ? '' : 'S'} OF A SCROLL POSITION AND ONE SETTLE.`,
    `A derived first visible index, floor(position / ${ROW_HEIGHT_PX}), sits on the position and one effect reads the index,`,
    `so the position changes on every write and the index once per ${ROW_HEIGHT_PX} writes: the effect body runs once per ${ROW_HEIGHT_PX} pixels on both arms.`,
    'THE SAME-VALUE STATEMENT BELOW HOLDS FOR THE POSITION AND NOT FOR THE INDEX: the index is stopped by each arm\'s own equality check',
    '(the default sameValueGuard of OIMComputedService, and alien\'s computed comparison), which is what this row prices.',
    'ARCHITECTURAL POINT: a value written every frame whose consumer wakes rarely, which is the shape of a virtualised list under scroll.',
    'Ours enlists the effect on the write, and at the flush the effect asks the index, which re-derives, finds the same value and stops.',
    'Alien-signals propagates pending flags to the computed and the effect on the write, and the effect checks the computed, which re-derives and stops.',
    'Browsers dispatch scroll at most once per rendered frame, so k1 is the scroll case; k4 is a handler that moves the position several times.',
]);

const scrollWindowPairs: readonly TPricePair[] = WRITES_PER_SCROLL_FRAME.map(writesPerFrame => ({
    id: `graph.scroll-window.k${writesPerFrame}`,
    path: EPricePath.PerFrame,
    ours: `${writesPerFrame}× updateEntityColumn on a scroll position, then db.flush(); a computed single-slot store slot first visible index over it and one effect on the index`,
    floor: `${writesPerFrame}× position(v) with no batch; an alien computed first visible index and one alien effect on it`,
    caveat: scrollWindowCaveat(writesPerFrame),
    isolate: true,
    build: wanted => ({
        ours: wanted === 'floor' ? inertSide : oursScrollWindow(writesPerFrame),
        floor: wanted === 'ours' ? inertSide : floorScrollWindow(writesPerFrame),
    }),
}));

const oursDeliveryWriteOnly = (): TPriceSide => {
    const db = new OIMDB();
    const rootEntityService = createRootEntityService(db);
    const slotContentService = rootEntityService.slotContentService;
    const rootSlot = createRootSlot(db, rootEntityService, { value: 0 });
    let written = 0;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) slotContentService.updateEntityColumn(rootSlot, 'value', ++written);
            priceSink.ours = rootSlot;
        },
    };
};

const oursDeliveryWriteAndFlushWithoutEffect = (): TPriceSide => {
    const db = new OIMDB();
    const rootEntityService = createRootEntityService(db);
    const slotContentService = rootEntityService.slotContentService;
    const rootSlot = createRootSlot(db, rootEntityService, { value: 0 });
    let written = 0;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                slotContentService.updateEntityColumn(rootSlot, 'value', ++written);
                db.flush();
            }
            priceSink.ours = rootSlot;
        },
    };
};

const oursDeliveryWriteAndEffectRunWithoutFlush = (): TPriceSide => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rootEntityService = createRootEntityService(db);
    const slotContentService = rootEntityService.slotContentService;
    const rootSlot = createRootSlot(db, rootEntityService, { value: 0 });
    const rootEffect = effectService.createEffectImmediate(db, [rootSlot], [], () => {
        priceSink.number = valueOfRoot(rootSlot);
    });
    db.flush();
    let written = 0;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                slotContentService.updateEntityColumn(rootSlot, 'value', ++written);
                effectService.runEffectIfSourcesChanged(rootEffect);
            }
            priceSink.ours = rootEffect;
        },
    };
};

const oursDeliveryWriteWithAnotherColumnHeld = (): TPriceSide => {
    const db = new OIMDB();
    const rootEntityService = createRootEntityService<TGraphTwoColumnRoot>(db);
    const slotContentService = rootEntityService.slotContentService;
    const rootSlot = createRootSlot(db, rootEntityService, { value: 0, note: 0 });
    const valueColumnSlot = rootEntityService.holdColumn(rootSlot, 'value');
    let written = 0;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) slotContentService.updateEntityColumn(rootSlot, 'note', ++written);
            priceSink.ours = valueColumnSlot;
        },
    };
};

const deliveryCaveat = (step: string): string => caveatOf([
    `ONE OPERATION IS ONE WRITE TO ONE ROOT, and ours stops at: ${step}.`,
    'ARCHITECTURAL POINT: none; this row splits graph.coalescing.unbatched.k1, whose ours side is one write, one db.flush() and one effect run.',
    'Every row of this group stands against the same floor, one alien write with one alien effect on the root,',
    'so the ns difference between two rows of the group is the price of the step one row adds over the other.',
    'The write-and-effect-run row calls effectService.runEffectIfSourcesChanged directly, so it pays the effect service and no frame;',
    'after its first write the frame never closes, so the slot counts as changed in the open frame and the write enlists nothing more.',
]);

const deliveryStepPair = (idSuffix: string, ours: string, step: string, oursSide: () => TPriceSide): TPricePair => ({
    id: `graph.delivery.${idSuffix}`,
    path: EPricePath.PerWrite,
    ours,
    floor: 'one root(v) with no batch; one alien effect on the root runs after the write',
    caveat: deliveryCaveat(step),
    isolate: true,
    build: wanted => ({
        ours: wanted === 'floor' ? inertSide : oursSide(),
        floor: wanted === 'ours' ? inertSide : floorPerWriteDelivery(1),
    }),
});

const deliveryStepPairs: readonly TPricePair[] = [
    deliveryStepPair(
        'write-only', 'one updateEntityColumn on a held root, no effect, no flush',
        'the write', oursDeliveryWriteOnly,
    ),
    deliveryStepPair(
        'write-and-flush-without-effect', 'one updateEntityColumn on a held root, then db.flush(), no effect',
        'the write and an empty frame', oursDeliveryWriteAndFlushWithoutEffect,
    ),
    deliveryStepPair(
        'write-and-effect-run-without-flush', 'one updateEntityColumn, then effectService.runEffectIfSourcesChanged(effect), no flush',
        'the write and the effect service, with no frame', oursDeliveryWriteAndEffectRunWithoutFlush,
    ),
    deliveryStepPair(
        'write-with-another-column-held', 'one updateEntityColumn(note) on a held root whose value column slot is held, no effect, no flush',
        'the write of a column nobody reads, on an entity one of whose other columns is held', oursDeliveryWriteWithAnotherColumnHeld,
    ),
];

type TGraphTwoColumnRoot = { value: number; note: number };

const DERIVED_COLLECTION_SIZE = 128;

const oursDerivedCollection = (writtenColumn: 'value' | 'note'): TPriceSide => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rootEntityService = createRootEntityService<TGraphTwoColumnRoot>(db);
    const slotContentService = rootEntityService.slotContentService;
    const derivedComputedService = createGraphComputedService();
    const roots = Array.from({ length: DERIVED_COLLECTION_SIZE }, (_, i) => {
        const rootSlot = createRootSlot(db, rootEntityService, { value: i, note: i });
        const valueColumnSlot = rootEntityService.holdColumn(rootSlot, 'value');
        const derivedComputedStoreSlot = derivedComputedService.createComputedStoreSlot(
            db,
            () => (rootSlot.entity?.value ?? 0) * 2,
            () => ({ sourceSlots: [valueColumnSlot] }),
        );
        return { rootSlot, derivedComputedStoreSlot };
    });
    const derivedComputedSlots = roots.map(
        root => derivedComputedService.computedCollectionService.getSlotByKey(root.derivedComputedStoreSlot, undefined),
    );
    let renderCount = 0;
    const listEffect = effectService.createEffectImmediate(db, [], derivedComputedSlots, () => {
        let sum = 0;
        for (let i = 0; i < roots.length; i++) sum += valueOfComputedStoreSlot(derivedComputedService, roots[i].derivedComputedStoreSlot);
        priceSink.number = sum;
        renderCount++;
    });
    db.flush();
    let written = DERIVED_COLLECTION_SIZE;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                written++;
                for (let r = 0; r < roots.length; r++) {
                    slotContentService.updateEntityColumn(roots[r].rootSlot, writtenColumn, written + r);
                }
                db.flush();
            }
            priceSink.ours = listEffect;
            priceSink.number = renderCount;
        },
    };
};

const floorDerivedCollection = (writtenColumn: 'value' | 'note'): TPriceSide => {
    const rows = Array.from({ length: DERIVED_COLLECTION_SIZE }, (_, i) => {
        const valueSignal: TAlienSignal = signal(i);
        const noteSignal: TAlienSignal = signal(i);
        return { valueSignal, noteSignal, derivedComputed: computed(() => valueSignal() * 2) };
    });
    let renderCount = 0;
    const disposeListEffect = effect(() => {
        let sum = 0;
        for (let i = 0; i < rows.length; i++) sum += rows[i].derivedComputed();
        priceSink.number = sum;
        renderCount++;
    });
    let written = DERIVED_COLLECTION_SIZE;
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                written++;
                startBatch();
                for (let r = 0; r < rows.length; r++) {
                    const row = rows[r];
                    (writtenColumn === 'value' ? row.valueSignal : row.noteSignal)(written + r);
                }
                endBatch();
            }
            priceSink.floor = disposeListEffect;
            priceSink.number = renderCount;
        },
    };
};

const derivedCollectionCaveat = (writtenColumn: 'value' | 'note'): string => caveatOf([
    `ONE OPERATION IS ONE FRAME: one column written on every one of ${DERIVED_COLLECTION_SIZE} roots, and one settle.`,
    `Each root has two columns, value and note; a derived value per root reads value only (value × 2), and one effect reads all ${DERIVED_COLLECTION_SIZE} derived values, which is a derived collection wholly on screen.`,
    writtenColumn === 'value'
        ? 'THE WRITTEN COLUMN IS THE ONE THE DERIVED VALUES READ, so both arms re-derive every value and run the effect once.'
        : 'THE WRITTEN COLUMN IS ONE NO DERIVED VALUE READS, so neither arm may re-derive anything or run the effect, and what is left is what each arm pays to learn that.',
    'Ours sources each derived value on the held column slot of value (rootEntityService.holdColumn), so a note write does not reach it;',
    'alien has one signal per field, the shape every signal adapter in this bench uses, and batches the frame with startBatch/endBatch, since ours delivers once per frame.',
]);

const derivedCollectionPairs: readonly TPricePair[] = (['value', 'note'] as const).map(writtenColumn => ({
    id: `graph.derived-collection.bulk-${writtenColumn === 'value' ? 'read' : 'unread'}-column.n${DERIVED_COLLECTION_SIZE}`,
    path: EPricePath.PerFrame,
    ours: `updateEntityColumn(${writtenColumn}) on ${DERIVED_COLLECTION_SIZE} roots, then db.flush(); a computed single-slot store slot per root over its value column slot and one effect over all of them`,
    floor: `startBatch(); ${writtenColumn}(v) on ${DERIVED_COLLECTION_SIZE} rows; endBatch(); an alien computed per row over its value signal and one alien effect over all of them`,
    caveat: derivedCollectionCaveat(writtenColumn),
    isolate: true,
    build: wanted => ({
        ours: wanted === 'floor' ? inertSide : oursDerivedCollection(writtenColumn),
        floor: wanted === 'ours' ? inertSide : floorDerivedCollection(writtenColumn),
    }),
}));

export const pricePairsGraphShape: readonly TPricePair[] = [
    ...revisionClockPairs,
    ...subscriptionBuildPairs,
    ...subscriptionRunPairs,
    ...subscriptionRunTrackedPairs,
    ...readsPerRunPairs,
    ...readsPerRunTrackedPairs,
    inactiveBranchPair,
    inactiveBranchTrackedPair,
    ...coalescingPairs,
    ...coalescingTrackedPairs,
    coalescingBatchedPair,
    ...scrollWindowPairs,
    ...deliveryStepPairs,
    ...derivedCollectionPairs,
];
