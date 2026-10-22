// Prose: ./README.md#alternativepairssubscription
import { OIMChannelService, OIMDB, OIMDefaults, OIMEffectService } from '../../../core/src/index';
import type { TOIMEffect, TOIMSlot } from '../../../core/src/index';
import { OIM_SLOT_FLAG_EMPTY } from '../../../core/src/engine/slot/constants/OIM_SLOT_FLAG_EMPTY';
import { OIMEventQueue, createOIMCollectionKit } from '../../../core-legacy/src/index';
import { EPricePath } from './EPricePath';
import { priceSink } from './priceSink';
import type { TPricePair } from './TPricePair';

/** How many subscribers a row mounts. The churn family's largest count. */
const SUBSCRIBERS = 256;

/** A bare identity, as `OIMChannelService.write` needs one and as `TOIMEffect` files itself on. */
const makeSlot = (): TOIMSlot => ({
    effects: undefined,
    changedAtRevision: 0,
    changedAtEpoch: 0,
    effectEdges: undefined,
    holdCount: 0,
    releaseDueAfterWriteMs: -1,
    releaseDueAfterIdleMs: -1,
    releaseDueAfterUnholdMs: -1,
    slotFlags: OIM_SLOT_FLAG_EMPTY,
    columnSlotStore: undefined,
    storeSlot: undefined,
    owner: OIMDefaults.STANDALONE_SLOT_OWNER.getValue(),
});

/**
 * A DISTINCT BODY PER SUBSCRIBER, AND IT IS NOT A DETAIL.
 *
 * 3.12.1 keeps a carrier's handlers in a `Set` (`OIMCarrierKeyedEmitter.addHandler`),
 * so ONE function subscribed 256 times is ONE handler: the arm would mount once,
 * release once and wake once against our 256. The first run of this file did
 * exactly that and printed a ratio of fifteen [NO RUN BEHIND THIS FIGURE, it was
 * discarded] — a number produced by a Set, not by a design.
 *
 * Each closure counts into one shared array so the sum can be checked and so
 * neither arm is charged for a different amount of counting.
 */
const bodiesFor = (count: number, woke: number[]): (() => void)[] => {
    const bodies: (() => void)[] = new Array(count);
    for (let i = 0; i < count; i++) bodies[i] = () => { woke[0]++; };
    return bodies;
};

type TLegacyRow = { id: string };

const WATCHED_KEY = 'watched';

const shippedWorld = () => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const slot = makeSlot();
    const woke = [0];
    const bodies = bodiesFor(SUBSCRIBERS, woke);
    return { db, effectService, slot, woke, bodies };
};

const legacyWorld = () => {
    const queue = new OIMEventQueue();
    const kit = createOIMCollectionKit<TLegacyRow, string>(queue, { selectPk: row => row.id });
    const woke = [0];
    const bodies = bodiesFor(SUBSCRIBERS, woke);
    return { queue, emitter: kit.collection.emitter, woke, bodies };
};

const assertWokeEverySubscriber = (woke: number[], arm: string): void => {
    if (woke[0] === SUBSCRIBERS) return;
    throw new Error(`price: one write woke ${woke[0]} of ${SUBSCRIBERS} subscribers on the ${arm} arm.`);
};

export const alternativePairsSubscription: readonly TPricePair[] = [
    {
        id: 'alt.subscription.channel-effect-vs-3.12.1-carrier-handler.mount-and-release',
        path: EPricePath.PerRelationship,
        ours: 'effectService.createEffect([slot], [], body) then effectService.disposeEffect(effect) — per subscriber',
        floor: 'emitter.subscribeOnKey(key, body) then the returned unsubscribe — 3.12.1',
        caveat:
            'ONE OPERATION IS ONE SUBSCRIBER MOUNTED AND RELEASED, in batches of the churn family\'s ' +
            'largest count on one identity. Ours allocates a `TOIMEffect` per mount, appends it to ' +
            'the slot\'s `effects` array, holds the slot, and on dispose swap-removes it and unholds; ' +
            '3.12.1 adds the handler to the carrier\'s `Set` and the carrier to the emitter\'s ' +
            'subscribed set, and its unsubscribe closure deletes both. Every body is a distinct ' +
            'closure, because the 3.12.1 `Set` collapses one function subscribed many times into ' +
            'one handler. Neither arm writes or flushes.',
        build: () => {
            const shipped = shippedWorld();
            const legacy = legacyWorld();
            const effects: TOIMEffect[] = new Array(SUBSCRIBERS);
            const unsubscribes: (() => void)[] = new Array(SUBSCRIBERS);
            const noSources: readonly never[] = [];
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const { db, effectService, slot, bodies } = shipped;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(SUBSCRIBERS, times - done);
                            for (let i = 0; i < upTo; i++) effects[i] = effectService.createEffect(db, [slot], noSources, bodies[i]);
                            for (let i = 0; i < upTo; i++) effectService.disposeEffect(effects[i]);
                            done += upTo;
                        }
                        priceSink.ours = slot;
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const { emitter, bodies } = legacy;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(SUBSCRIBERS, times - done);
                            for (let i = 0; i < upTo; i++) unsubscribes[i] = emitter.subscribeOnKey(WATCHED_KEY, bodies[i]);
                            for (let i = 0; i < upTo; i++) unsubscribes[i]();
                            done += upTo;
                        }
                        priceSink.floor = emitter;
                    },
                },
            };
        },
    },

    {
        id: 'alt.subscription.channel-effect-vs-3.12.1-carrier-handler.wake',
        path: EPricePath.PerFrame,
        ours: 'OIMChannelService.INSTANCE.write(channelSlot, slot); db.flush() — every effect on the slot runs',
        floor: 'emitter.markUpdatedKey(key); queue.flush() — every handler on the carrier runs — 3.12.1',
        caveat:
            'ONE OPERATION IS ONE SUBSCRIBER WOKEN; a frame wakes the whole standing set, mounted ' +
            'before the clock. Ours stamps the slot, enlists each effect through its pending flag, ' +
            'and at the flush asks each effect whether its source moved since it last ran — a stamp ' +
            'compare — before calling its body. 3.12.1 marks the carrier dirty once, and its flush ' +
            'iterates the carrier\'s handler `Set` and calls each. Both arms were checked to wake ' +
            'every subscriber exactly once per write before the clock started. Neither arm goes ' +
            'through a collection write: this is the subscription cost alone, not the write stack ' +
            'in front of it.',
        build: () => {
            const shipped = shippedWorld();
            const legacy = legacyWorld();
            const noSources: readonly never[] = [];
            for (let i = 0; i < SUBSCRIBERS; i++) shipped.effectService.createEffect(shipped.db, [shipped.slot], noSources, shipped.bodies[i]);
            for (let i = 0; i < SUBSCRIBERS; i++) legacy.emitter.subscribeOnKey(WATCHED_KEY, legacy.bodies[i]);
            OIMChannelService.INSTANCE.write(shipped.db.defaultChannelSlot, shipped.slot);
            shipped.db.flush();
            assertWokeEverySubscriber(shipped.woke, 'shipped');
            legacy.emitter.markUpdatedKey(WATCHED_KEY);
            legacy.queue.flush();
            assertWokeEverySubscriber(legacy.woke, '3.12.1');
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const { db, slot } = shipped;
                        const channelSlot = db.defaultChannelSlot;
                        for (let woken = 0; woken < times; woken += SUBSCRIBERS) {
                            OIMChannelService.INSTANCE.write(channelSlot, slot);
                            db.flush();
                        }
                        priceSink.number = shipped.woke[0];
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const { queue, emitter } = legacy;
                        for (let woken = 0; woken < times; woken += SUBSCRIBERS) {
                            emitter.markUpdatedKey(WATCHED_KEY);
                            queue.flush();
                        }
                        priceSink.number = legacy.woke[0];
                    },
                },
            };
        },
    },
];
