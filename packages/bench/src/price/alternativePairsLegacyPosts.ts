// Prose: ./README.md#alternativepairslegacyposts
import { EPricePath } from './EPricePath';
import { priceSink } from './priceSink';
import type { TPricePair } from './TPricePair';

const NOT_THE_POSTS_ENGINE =
    'THE POST\'S ENGINE IS NOT THIS ENGINE. All four posts describe `@oimdb/core` 3.x, which now ' +
    'lives in `packages/core-legacy/`; this row runs hand-written arms shaped after the current ' +
    'engine, so it settles the DECISION and settles NOTHING about the withdrawn table.';

const FRAME = 1024;

type TStandingEffect = { isPending: boolean; ran: number };

type TCarrier = { effects: TStandingEffect[] | undefined; changedAtRevision: number };

const standingEffects = (count: number): TStandingEffect[] => {
    const effects: TStandingEffect[] = [];
    for (let i = 0; i < count; i++) effects.push({ isPending: false, ran: 0 });
    return effects;
};

const keyNames = (count: number): string[] => {
    const names: string[] = [];
    for (let i = 0; i < count; i++) names.push(`key-${i}`);
    return names;
};

class CarrierEmitter {
    public readonly pending: TStandingEffect[] = [];
    private revision = 0;
    private frameOpenedAt = 0;

    public mark(carrier: TCarrier): void {
        const revision = ++this.revision;
        const effects = carrier.effects;
        if (effects !== undefined && effects.length !== 0 && !(carrier.changedAtRevision > this.frameOpenedAt)) {
            for (let i = 0; i < effects.length; i++) {
                const effect = effects[i];
                if (effect.isPending) continue;
                effect.isPending = true;
                this.pending.push(effect);
            }
        }
        carrier.changedAtRevision = revision;
    }

    public closeFrame(): number {
        const pending = this.pending;
        const count = pending.length;
        for (let i = 0; i < count; i++) pending[i].isPending = false;
        pending.length = 0;
        this.frameOpenedAt = this.revision;
        return count;
    }
}

class KeyHandlerMapEmitter {
    public readonly pending: TStandingEffect[] = [];
    private readonly dirtyKeys = new Set<string>();

    public constructor(private readonly effectsByKey: Map<string, TStandingEffect[]>) {}

    public mark(key: string): void {
        const effects = this.effectsByKey.get(key);
        if (effects === undefined || this.dirtyKeys.has(key)) return;
        this.dirtyKeys.add(key);
        for (let i = 0; i < effects.length; i++) this.pending.push(effects[i]);
    }

    public closeFrame(): number {
        const count = this.pending.length;
        this.pending.length = 0;
        this.dirtyKeys.clear();
        return count;
    }
}

const enqueueByReference = (queue: TStandingEffect[], effect: TStandingEffect): void => {
    if (effect.isPending) return;
    effect.isPending = true;
    queue.push(effect);
};

const drainByReference = (queue: TStandingEffect[]): number => {
    for (let i = 0; i < queue.length; i++) {
        queue[i].isPending = false;
        queue[i].ran++;
    }
    const count = queue.length;
    queue.length = 0;
    return count;
};

type TQueuedRecord = { effect: TStandingEffect; isLive: boolean };

const enqueueWithDisposer = (queue: TQueuedRecord[], effect: TStandingEffect): (() => void) => {
    const record: TQueuedRecord = { effect, isLive: true };
    queue.push(record);
    return () => { record.isLive = false; };
};

const drainRecords = (queue: TQueuedRecord[]): number => {
    let count = 0;
    for (let i = 0; i < queue.length; i++) {
        if (!queue[i].isLive) continue;
        queue[i].effect.ran++;
        count++;
    }
    queue.length = 0;
    return count;
};

const assertSameCount = (row: string, ours: number, floor: number): void => {
    if (ours === floor) return;
    throw new Error(`alternativePairsLegacyPosts: ${row} hands ${ours} on ours and ${floor} on the floor.`);
};

class DoubleBufferQueue {
    private pending: TStandingEffect[] = [];
    private spare: TStandingEffect[] = [];

    public push(effect: TStandingEffect): void {
        this.pending.push(effect);
    }

    public flush(): number {
        const draining = this.pending;
        this.pending = this.spare;
        this.spare = draining;
        for (let i = 0; i < draining.length; i++) draining[i].ran++;
        const count = draining.length;
        draining.length = 0;
        return count;
    }
}

class SnapshotQueue {
    private readonly pending: TStandingEffect[] = [];

    public push(effect: TStandingEffect): void {
        this.pending.push(effect);
    }

    public flush(): number {
        const snapshot = Array.from(this.pending);
        this.pending.length = 0;
        for (let i = 0; i < snapshot.length; i++) snapshot[i].ran++;
        return snapshot.length;
    }
}

const doubleBufferPair = (queued: number, size: string): TPricePair => ({
    id: `alt.double-buffer-vs-array-from-snapshot.${size}`,
    path: EPricePath.PerFrame,
    ours: `push ${queued} effects, then flush by swapping two lists`,
    floor: `push ${queued} effects, then flush by draining an \`Array.from\` copy`,
    caveat:
        'ONE POINT OF A TWO-POINT LINE, READ WITH ITS SIBLING. The snapshot is proportional to the ' +
        'queue and the swap is constant, so the empty row is where the rejected design pays its ' +
        'minimum and the loaded row is where the saving is largest in absolute terms. The pushes ' +
        'are the same code on both arms and inside both numbers. NEITHER ARM IS SHIPPED CODE: ' +
        '`OIMChannel` keeps one pending list and empties it in place. The build throws unless one ' +
        `flush walks the same count on both. ${NOT_THE_POSTS_ENGINE}`,
    build: () => {
        const effects = standingEffects(Math.max(queued, 1));
        const oursQueue = new DoubleBufferQueue();
        const floorQueue = new SnapshotQueue();
        for (let i = 0; i < queued; i++) {
            oursQueue.push(effects[i]);
            floorQueue.push(effects[i]);
        }
        assertSameCount('one flush', oursQueue.flush(), floorQueue.flush());
        return {
            ours: {
                reset: () => undefined,
                run: times => {
                    let walked = 0;
                    for (let i = 0; i < times; i++) {
                        for (let e = 0; e < queued; e++) oursQueue.push(effects[e]);
                        walked += oursQueue.flush();
                    }
                    priceSink.number = walked;
                },
            },
            floor: {
                reset: () => undefined,
                run: times => {
                    let walked = 0;
                    for (let i = 0; i < times; i++) {
                        for (let e = 0; e < queued; e++) floorQueue.push(effects[e]);
                        walked += floorQueue.flush();
                    }
                    priceSink.number = walked;
                },
            },
        };
    },
});

export const alternativePairsLegacyPosts: readonly TPricePair[] = [
    {
        id: 'alt.carrier-emitter-vs-key-handler-map.mark',
        path: EPricePath.PerRowPerWrite,
        ours: 'mark a carrier: read its own effects list, compare its stamp, enlist, stamp it',
        floor: 'mark a key: probe a Map<key, handlers>, dedup the key in a Set, enlist',
        caveat:
            'THE MARK, NOT THE DELIVERY. Ours transcribes the prefix of ' +
            '`OIMChannel.writeWithoutFlushCheck` — `slot.effects`, the stamp against the frame, ' +
            'the `isRunScheduled` check of `addEffectScheduledToRun` and the stamp store — without the clock wrap and the flush ' +
            'request; the floor is the self-contained emitter the post turned down, one hash to ' +
            'find the handlers and one string-`Set` insertion to dedup the key. Every key carries ' +
            'one standing effect and a frame marks 1024 distinct keys once each, so every mark ' +
            'enlists on both arms; closing the frame is inside both numbers once per 1024 marks. ' +
            'The build throws unless one frame enlists the same count on both. What the floor ' +
            'buys and ours does not: carriers know nothing about subscriptions, and a key with no ' +
            `carrier yet can be subscribed to. ${NOT_THE_POSTS_ENGINE}`,
        build: () => {
            const keys = keyNames(FRAME);
            const carriers: TCarrier[] = [];
            const effectsByKey = new Map<string, TStandingEffect[]>();
            const oursEffects = standingEffects(FRAME);
            const floorEffects = standingEffects(FRAME);
            for (let i = 0; i < FRAME; i++) {
                carriers.push({ effects: [oursEffects[i]], changedAtRevision: 0 });
                effectsByKey.set(keys[i], [floorEffects[i]]);
            }
            const carrierEmitter = new CarrierEmitter();
            const keyHandlerMapEmitter = new KeyHandlerMapEmitter(effectsByKey);
            for (let i = 0; i < FRAME; i++) {
                carrierEmitter.mark(carriers[i]);
                keyHandlerMapEmitter.mark(keys[i]);
            }
            assertSameCount('one frame', carrierEmitter.closeFrame(), keyHandlerMapEmitter.closeFrame());
            const mask = FRAME - 1;
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        let enlisted = 0;
                        for (let i = 0; i < times; i++) {
                            carrierEmitter.mark(carriers[i & mask]);
                            if ((i & mask) === mask) enlisted += carrierEmitter.closeFrame();
                        }
                        enlisted += carrierEmitter.closeFrame();
                        priceSink.number = enlisted;
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        let enlisted = 0;
                        for (let i = 0; i < times; i++) {
                            keyHandlerMapEmitter.mark(keys[i & mask]);
                            if ((i & mask) === mask) enlisted += keyHandlerMapEmitter.closeFrame();
                        }
                        enlisted += keyHandlerMapEmitter.closeFrame();
                        priceSink.number = enlisted;
                    },
                },
            };
        },
    },

    {
        id: 'alt.enqueue-by-reference-vs-disposer-closure.array-queue',
        path: EPricePath.PerRowPerWrite,
        ours: 'enqueue the effect itself, deduplicated by its own isPending flag',
        floor: 'enqueue a record and hand back a disposer closure that cancels it',
        caveat:
            'OURS IS THE SHAPE `OIMChannel` SHIPS — the private `addEffectScheduledToRun` pushes the effect by ' +
            'reference and dedups on `effect.isRunScheduled` — transcribed rather than called, because ' +
            'the public `scheduleEffectRun` also requests a flush. The floor allocates a record and a ' +
            'closure per enqueue, which is what the post turned down; its disposers are sunk so ' +
            'neither allocation can be removed. A frame enqueues 1024 distinct effects once each and ' +
            'then drains, and the drain is inside both numbers once per frame. The build throws ' +
            `unless one drain runs the same count on both. ${NOT_THE_POSTS_ENGINE}`,
        build: () => {
            const oursEffects = standingEffects(FRAME);
            const floorEffects = standingEffects(FRAME);
            const oursQueue: TStandingEffect[] = [];
            const floorQueue: TQueuedRecord[] = [];
            for (let i = 0; i < FRAME; i++) {
                enqueueByReference(oursQueue, oursEffects[i]);
                priceSink.floor = enqueueWithDisposer(floorQueue, floorEffects[i]);
            }
            assertSameCount('one drain', drainByReference(oursQueue), drainRecords(floorQueue));
            const mask = FRAME - 1;
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        let ran = 0;
                        for (let i = 0; i < times; i++) {
                            enqueueByReference(oursQueue, oursEffects[i & mask]);
                            if ((i & mask) === mask) ran += drainByReference(oursQueue);
                        }
                        ran += drainByReference(oursQueue);
                        priceSink.number = ran;
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        let ran = 0;
                        for (let i = 0; i < times; i++) {
                            priceSink.floor = enqueueWithDisposer(floorQueue, floorEffects[i & mask]);
                            if ((i & mask) === mask) ran += drainRecords(floorQueue);
                        }
                        ran += drainRecords(floorQueue);
                        priceSink.number = ran;
                    },
                },
            };
        },
    },

    doubleBufferPair(0, 'empty-flush'),
    doubleBufferPair(FRAME, '1024-queued'),
];
