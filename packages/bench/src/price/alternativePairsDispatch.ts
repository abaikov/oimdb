// Prose: ./README.md#alternativepairsdispatch
import { OIMEffectService } from '../../../core/src/index';
import { EPricePath } from './EPricePath';
import { priceFixture } from './priceFixture';
import { priceSink } from './priceSink';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';

type TCarrier = { isPending: boolean; markedInFrame: number; ran: number };

const makeCarriers = (count: number): TCarrier[] => {
    const carriers: TCarrier[] = [];
    for (let i = 0; i < count; i++) carriers.push({ isPending: false, markedInFrame: -1, ran: 0 });
    return carriers;
};

const totalRan = (carriers: readonly TCarrier[]): number => {
    let ran = 0;
    for (let i = 0; i < carriers.length; i++) ran += carriers[i].ran;
    return ran;
};

const assertSameRuns = (oursRan: number, floorRan: number, id: string): void => {
    if (oursRan === floorRan) return;
    throw new Error(`price: "${id}" ran ${oursRan} bodies on the shipped arm and ${floorRan} on the rejected one.`);
};

const dirtyFlagPair = (carrierCount: number, marksPerCarrier: number): TPricePair => {
    const id = `alt.dirty-flag-vs-set.${carrierCount}-carriers.${marksPerCarrier}-marks-each`;
    const marksPerFrame = carrierCount * marksPerCarrier;
    return {
        id,
        path: EPricePath.PerWrite,
        ours: 'if (!carrier.isPending) { carrier.isPending = true; pending.push(carrier) } — drained as an array',
        floor: 'pendingSet.add(carrier) — drained by iterating the Set and clearing it',
        caveat:
            'ONE OPERATION IS ONE MARK. A frame marks every carrier the stated number of times, in ' +
            'passes over the whole population, and then drains, so a repeat mark is the flag\'s ' +
            'early return on ours and a hash hit on the Set. The drain runs one counting body per ' +
            'carrier on both arms and both were checked to run the same number before the clock. ' +
            'This is the shape of `OIMChannelService.scheduleEffectRun` (the `isRunScheduled` flag and a push) ' +
            'and its frame loop, hand-written, so one carrier shape reaches each arm; production effects ' +
            'are built by one object literal in OIMEffectService, so the engine also sees one shape there.',
        build: () => {
            const oursCarriers = makeCarriers(carrierCount);
            const floorCarriers = makeCarriers(carrierCount);
            const pending: TCarrier[] = [];
            const pendingSet = new Set<TCarrier>();
            const oursFrame = (): void => {
                for (let r = 0; r < marksPerCarrier; r++) {
                    for (let i = 0; i < carrierCount; i++) {
                        const carrier = oursCarriers[i];
                        if (carrier.isPending) continue;
                        carrier.isPending = true;
                        pending.push(carrier);
                    }
                }
                for (let i = 0; i < pending.length; i++) {
                    const carrier = pending[i];
                    carrier.isPending = false;
                    carrier.ran++;
                }
                pending.length = 0;
            };
            const floorFrame = (): void => {
                for (let r = 0; r < marksPerCarrier; r++) {
                    for (let i = 0; i < carrierCount; i++) pendingSet.add(floorCarriers[i]);
                }
                for (const carrier of pendingSet) carrier.ran++;
                pendingSet.clear();
            };
            oursFrame();
            floorFrame();
            assertSameRuns(totalRan(oursCarriers), totalRan(floorCarriers), id);
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        for (let marked = 0; marked < times; marked += marksPerFrame) oursFrame();
                        priceSink.number = pending.length;
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        for (let marked = 0; marked < times; marked += marksPerFrame) floorFrame();
                        priceSink.number = pendingSet.size;
                    },
                },
            };
        },
    };
};

const SCAN_POPULATION = 1024;

const dirtyListPair = (markedPerFrame: number): TPricePair => {
    const id = `alt.dirty-list-vs-scan.${markedPerFrame}-of-${SCAN_POPULATION}-marked`;
    const stride = SCAN_POPULATION / markedPerFrame;
    return {
        id,
        path: EPricePath.PerFrame,
        ours: 'a delivery list built at the write — the frame walks only what was marked',
        floor: 'a stamp written at the write — the frame scans every subscriber for this frame\'s stamp',
        caveat:
            'ONE OPERATION IS ONE FRAME: the stated number of subscribers out of the population ' +
            'are marked, spread evenly, and the frame delivers to exactly those. The list pays a ' +
            'flag test and a push per mark and walks only the marked; the scan pays one store per ' +
            'mark and walks the whole population every frame. So the answer turns on the marked ' +
            'fraction and THE ROWS CROSS OVER: read them as a table, never as one ratio. Both arms ' +
            'were checked to deliver to the same number of subscribers before the clock.',
        build: () => {
            const oursCarriers = makeCarriers(SCAN_POPULATION);
            const floorCarriers = makeCarriers(SCAN_POPULATION);
            const pending: TCarrier[] = [];
            let frame = 0;
            const oursFrame = (): void => {
                for (let j = 0; j < markedPerFrame; j++) {
                    const carrier = oursCarriers[j * stride];
                    if (carrier.isPending) continue;
                    carrier.isPending = true;
                    pending.push(carrier);
                }
                for (let i = 0; i < pending.length; i++) {
                    const carrier = pending[i];
                    carrier.isPending = false;
                    carrier.ran++;
                }
                pending.length = 0;
            };
            const floorFrame = (): void => {
                const now = ++frame;
                for (let j = 0; j < markedPerFrame; j++) floorCarriers[j * stride].markedInFrame = now;
                for (let i = 0; i < SCAN_POPULATION; i++) {
                    const carrier = floorCarriers[i];
                    if (carrier.markedInFrame === now) carrier.ran++;
                }
            };
            oursFrame();
            floorFrame();
            assertSameRuns(totalRan(oursCarriers), totalRan(floorCarriers), id);
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) oursFrame();
                        priceSink.number = pending.length;
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) floorFrame();
                        priceSink.number = frame;
                    },
                },
            };
        },
    };
};

const NODES = 256;
const SOURCES_PER_NODE = 8;

type TNode = { sources: number[]; value: number; isPending: boolean };

const makeNodes = (): TNode[] => {
    const nodes: TNode[] = [];
    for (let i = 0; i < NODES; i++) {
        const sources: number[] = new Array(SOURCES_PER_NODE);
        for (let s = 0; s < SOURCES_PER_NODE; s++) sources[s] = i + s;
        nodes.push({ sources, value: 0, isPending: false });
    }
    return nodes;
};

const recompute = (node: TNode): void => {
    const sources = node.sources;
    let sum = 0;
    for (let s = 0; s < sources.length; s++) sum += sources[s];
    node.value = sum;
};

const coalescePair = (writesPerNodePerFrame: number): TPricePair => {
    const id = `alt.coalesce-vs-eager.${writesPerNodePerFrame}-writes-per-node-per-frame`;
    return {
        id,
        path: EPricePath.PerFrame,
        ours: 'mark the node at the write, recompute each marked node once when the frame closes',
        floor: 'recompute the node at every write',
        caveat:
            'ONE OPERATION IS ONE FRAME over the whole node population, each node taking the ' +
            'stated number of writes to its sources. Coalescing pays a flag test and a push per ' +
            'write and one recompute per node per frame; eager pays one recompute per write and ' +
            'nothing else. So the answer is a BREAK-EVEN in writes per node per frame, not a ' +
            'speed-up: at one write eager does strictly less, and every row above it is where ' +
            'coalescing has to earn its list. Both arms are plain objects; both were checked to ' +
            'leave every node holding the same value after a frame.',
        build: () => {
            const oursNodes = makeNodes();
            const floorNodes = makeNodes();
            const pending: TNode[] = [];
            let oursRound = 0;
            let floorRound = 0;
            const oursFrame = (): void => {
                const round = ++oursRound;
                for (let w = 0; w < writesPerNodePerFrame; w++) {
                    for (let i = 0; i < NODES; i++) {
                        const node = oursNodes[i];
                        node.sources[w & (SOURCES_PER_NODE - 1)] = round + w;
                        if (node.isPending) continue;
                        node.isPending = true;
                        pending.push(node);
                    }
                }
                for (let i = 0; i < pending.length; i++) {
                    const node = pending[i];
                    node.isPending = false;
                    recompute(node);
                }
                pending.length = 0;
            };
            const floorFrame = (): void => {
                const round = ++floorRound;
                for (let w = 0; w < writesPerNodePerFrame; w++) {
                    for (let i = 0; i < NODES; i++) {
                        const node = floorNodes[i];
                        node.sources[w & (SOURCES_PER_NODE - 1)] = round + w;
                        recompute(node);
                    }
                }
            };
            oursFrame();
            floorFrame();
            for (let i = 0; i < NODES; i++) {
                if (oursNodes[i].value === floorNodes[i].value) continue;
                throw new Error(`price: "${id}" left node ${i} holding different values on the two arms.`);
            }
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) oursFrame();
                        priceSink.number = oursNodes[0].value;
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) floorFrame();
                        priceSink.number = floorNodes[0].value;
                    },
                },
            };
        },
    };
};

const COLUMN_ROWS = 1024;

const inertSide: TPriceSide = { reset: () => undefined, run: () => undefined };

const columnSubscriptionSide = (byColumn: boolean): TPriceSide => {
    const fixture = priceFixture(COLUMN_ROWS);
    const { entityService, db, slots } = fixture;
    const effectService = OIMEffectService.INSTANCE;
    const woke = [0];
    const lastSeen: (string | undefined)[] = slots.map(slot => slot.entity?.title);
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (byColumn) {
            effectService.createEffect(db, [entityService.holdColumn(slot, 'title')], [], () => { woke[0]++; });
            continue;
        }
        effectService.createEffect(db, [slot], [], () => {
            const title = slot.entity?.title;
            if (title === lastSeen[i]) return;
            lastSeen[i] = title;
            woke[0]++;
        });
    }
    const notePatches = [{ note: 'note-a' }, { note: 'note-b' }];
    const titlePatches = [{ title: 'title-a' }, { title: 'title-b' }];
    let round = 0;
    const pass = (): void => {
        const turn = round++;
        const notePatch = notePatches[turn & 1];
        for (let i = 0; i < slots.length; i++) entityService.slotContentService.updateEntity(slots[i], notePatch);
        db.flush();
        const titlePatch = titlePatches[turn & 1];
        for (let i = 0; i < slots.length; i++) entityService.slotContentService.updateEntity(slots[i], titlePatch);
        db.flush();
    };
    const before = woke[0];
    pass();
    if (woke[0] - before !== COLUMN_ROWS) {
        throw new Error(
            `price: a pass moved the title of ${COLUMN_ROWS} rows and the ${byColumn ? 'column' : 'row'} ` +
                `subscribers reported ${woke[0] - before}.`,
        );
    }
    return {
        reset: () => undefined,
        run: times => {
            for (let written = 0; written < times; written += 2 * COLUMN_ROWS) pass();
            priceSink.number = woke[0];
        },
    };
};

export const alternativePairsDispatch: readonly TPricePair[] = [
    dirtyFlagPair(1024, 1),
    dirtyFlagPair(1024, 4),
    dirtyFlagPair(65536, 1),
    dirtyFlagPair(65536, 4),

    dirtyListPair(1),
    dirtyListPair(32),
    dirtyListPair(256),
    dirtyListPair(1024),

    coalescePair(1),
    coalescePair(2),
    coalescePair(4),
    coalescePair(16),

    {
        id: 'alt.column-subscription.by-column-vs-by-row.1024-rows',
        path: EPricePath.PerRowPerWrite,
        ours: 'effectService.createEffect(db, [entityService.holdColumn(slot, \'title\')], [], body) — per row',
        floor: 'effectService.createEffect(db, [slot], [], body) with the body comparing `title` against what it saw last',
        caveat:
            'ONE OPERATION IS ONE ROW WRITE, AND A PASS IS TWO OF THEM PER ROW: every row\'s `note` ' +
            'moves and a frame runs, then every row\'s `title` moves and a frame runs. One ' +
            'subscriber per row, mounted before the clock, cares only about `title`. Ours ' +
            'subscribes to the column\'s own identity, so the `note` frame wakes nobody — the write ' +
            'probes the row\'s column store and finds no `note` column — and the `title` frame ' +
            'wakes every subscriber; the rejected arm subscribes to the row, so BOTH frames wake ' +
            'every subscriber and its body filters the `note` frame out. Each arm was checked to ' +
            'report exactly one title change per row per pass. The two arms put different slot ' +
            'shapes through the same `slotContentService.updateEntity` and the same db, so the pair is isolated.',
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor' ? inertSide : columnSubscriptionSide(true),
            floor: wanted === 'ours' ? inertSide : columnSubscriptionSide(false),
        }),
    },
];
