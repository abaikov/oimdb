// Prose: ./README.md#alternativepairseffectshape
import { OIMChannelService, OIMEffectService, oimIsSlotReleased } from '../../../core/src/index';
import { oimIsEffectDisposed } from '../../../core/src/engine/computed/utils/oimIsEffectDisposed';
import { OIM_EFFECT_FLAG_DISPOSED } from '../../../core/src/engine/computed/constants/OIM_EFFECT_FLAG_DISPOSED';
import { OIM_EFFECT_FLAG_RUN_SCHEDULED } from '../../../core/src/engine/computed/constants/OIM_EFFECT_FLAG_RUN_SCHEDULED';
import { OIM_EFFECT_FLAG_SOURCE_CHECK_OWED } from '../../../core/src/engine/computed/constants/OIM_EFFECT_FLAG_SOURCE_CHECK_OWED';
import { oimIsRevisionAfter } from '../../../core/src/engine/channel/utils/oimIsRevisionAfter';
import type { IOIMEffectService, OIMDB, TOIMChannelSlot, TOIMComputedSlot, TOIMEffect, TOIMSlot } from '../../../core/src/index';
import { oimRefreshSourceComputeds } from '../../../core/src/engine/computed/utils/oimRefreshSourceComputeds';
import { oimHasSourceChangedSinceLastRun } from '../../../core/src/engine/computed/utils/oimHasSourceChangedSinceLastRun';
import { EPricePath } from './EPricePath';
import { priceFixture } from './priceFixture';
import { priceSink } from './priceSink';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';

const POOL = 64;
const ROOTS = 8;
const EFFECTS = 1024;
const NO_SOURCE_COMPUTEDS: readonly TOIMComputedSlot[] = Object.freeze([]);

type TEffectBody = () => void | (() => void);

const runCleanup = (effect: TOIMEffect): void => {
    const undo = effect.cleanup;
    if (undo === undefined) return;
    effect.cleanup = undefined;
    undo();
};

const runEffect = (effect: TOIMEffect): void => {
    const channelClock = effect.channelSlot.clock;
    const ranAtRevision = channelClock.revision;
    const ranAtEpoch = channelClock.epoch;
    runCleanup(effect);
    if (oimIsEffectDisposed(effect)) return;
    const undo = effect.body();
    effect.ranAtRevision = ranAtRevision;
    effect.ranAtEpoch = ranAtEpoch;
    if (typeof undo !== 'function') return;
    if (oimIsEffectDisposed(effect)) undo();
    else effect.cleanup = undo;
};

const setPositionInSubscribedSlot = (effect: TOIMEffect, edge: number, positionInSlot: number): void => {
    if (edge === 0) {
        effect.positionInFirstSubscribedSlot = positionInSlot;
        return;
    }
    (effect.positionsInOtherSubscribedSlots ??= [])[edge - 1] = positionInSlot;
};

const runLiteralEffectIfSourcesChanged = (effect: TOIMEffect): void => {
    oimRefreshSourceComputeds(effect.sourceComputeds);
    if (!oimHasSourceChangedSinceLastRun(effect)) return;
    runEffect(effect);
};

const literalEffectService: IOIMEffectService = {
    markEffectRunScheduled: (effect, isSourceCheckOwed) => {
        const effectFlags = effect.effectFlags;
        if ((effectFlags & OIM_EFFECT_FLAG_RUN_SCHEDULED) !== 0) {
            if (isSourceCheckOwed) effect.effectFlags = effectFlags | OIM_EFFECT_FLAG_SOURCE_CHECK_OWED;
            return false;
        }
        effect.effectFlags = isSourceCheckOwed
            ? effectFlags | OIM_EFFECT_FLAG_RUN_SCHEDULED | OIM_EFFECT_FLAG_SOURCE_CHECK_OWED
            : effectFlags | OIM_EFFECT_FLAG_RUN_SCHEDULED;
        return true;
    },
    runScheduledEffect: effect => {
        const effectFlags = effect.effectFlags;
        if ((effectFlags & OIM_EFFECT_FLAG_RUN_SCHEDULED) === 0) return;
        effect.effectFlags = effectFlags & ~(OIM_EFFECT_FLAG_RUN_SCHEDULED | OIM_EFFECT_FLAG_SOURCE_CHECK_OWED);
        const frame = effect.channelSlot.frame;
        if (
            (effectFlags & OIM_EFFECT_FLAG_SOURCE_CHECK_OWED) === 0 && effect.sourceComputeds.length === 0
            && !oimIsRevisionAfter(effect.ranAtRevision, effect.ranAtEpoch, frame.openedAtRevision, frame.openedAtEpoch)
        ) {
            runEffect(effect);
        } else {
            runLiteralEffectIfSourcesChanged(effect);
        }
    },
    runEffect,
    runEffectIfSourcesChanged: runLiteralEffectIfSourcesChanged,
    setPositionInSubscribedSlot,
};

const createLiteralEffect = (channelSlot: TOIMChannelSlot, rootSlots: readonly TOIMSlot[], body: TEffectBody): TOIMEffect => {
    const effect: TOIMEffect = {
        effectService: literalEffectService,
        sourceSlots: rootSlots,
        sourceComputeds: NO_SOURCE_COMPUTEDS,
        allRootSlots: rootSlots,
        positionInFirstSubscribedSlot: -1,
        positionsInOtherSubscribedSlots: undefined,
        ranAtRevision: channelSlot.clock.revision,
        ranAtEpoch: channelSlot.clock.epoch,
        effectFlags: 0,
        body,
        cleanup: undefined,
        channelSlot,
    };
    for (let i = 0; i < rootSlots.length; i++) {
        const rootSlot = rootSlots[i];
        setPositionInSubscribedSlot(effect, i, rootSlot.owner.subscribeToSlot(rootSlot, effect, i));
    }
    return effect;
};

const disposeLiteralEffect = (effect: TOIMEffect): void => {
    effect.effectFlags = (effect.effectFlags | OIM_EFFECT_FLAG_DISPOSED)
        & ~(OIM_EFFECT_FLAG_RUN_SCHEDULED | OIM_EFFECT_FLAG_SOURCE_CHECK_OWED);
    const allRootSlots = effect.allRootSlots;
    for (let i = 0; i < allRootSlots.length; i++) {
        const rootSlot = allRootSlots[i];
        const positionInSlot = i === 0 ? effect.positionInFirstSubscribedSlot : (effect.positionsInOtherSubscribedSlots?.[i - 1] ?? -1);
        if (oimIsSlotReleased(rootSlot) || positionInSlot < 0) continue;
        setPositionInSubscribedSlot(effect, i, -1);
        rootSlot.owner.unsubscribeFromSlot(rootSlot, positionInSlot, effect);
    }
    runCleanup(effect);
};

type TWorld = { db: OIMDB; effectService: OIMEffectService };

type TArm<TEffect> = {
    create: (world: TWorld, rootSlots: readonly TOIMSlot[], body: TEffectBody) => TEffect;
    dispose: (world: TWorld, effect: TEffect) => void;
};

const classArm: TArm<TOIMEffect> = {
    create: (world, rootSlots, body) => world.effectService.createEffect(world.db, rootSlots, NO_SOURCE_COMPUTEDS, body),
    dispose: (world, effect) => { world.effectService.disposeEffect(effect); },
};

const literalArm: TArm<TOIMEffect> = {
    create: (world, rootSlots, body) => createLiteralEffect(world.db.defaultChannelSlot, rootSlots, body),
    dispose: (_world, effect) => { disposeLiteralEffect(effect); },
};

const worldOf = () => {
    const { db, slots } = priceFixture(POOL);
    const effectService = OIMEffectService.INSTANCE;
    const windows: (readonly TOIMSlot[])[] = [];
    for (let at = 0; at + ROOTS <= POOL; at++) windows.push(slots.slice(at, at + ROOTS));
    const woke = [0];
    const body: TEffectBody = () => { woke[0]++; };
    return { db, effectService, slots, windows, woke, body };
};

const INERT: TPriceSide = { reset: () => undefined, run: () => undefined };

const createSide = <TEffect extends object>(arm: TArm<TEffect>, sink: (effect: TEffect) => void): TPriceSide => {
    const world = worldOf();
    const { db, windows, body } = world;
    const resident = arm.create(world, windows[0], body);
    const made: TEffect[] = [];
    return {
        reset: () => {
            for (let i = 0; i < made.length; i++) arm.dispose(world, made[i]);
            made.length = 0;
            db.flush();
            sink(resident);
        },
        operationsPerPass: EFFECTS,
        run: times => {
            for (let i = 0; i < times; i++) made.push(arm.create(world, windows[i % windows.length], body));
            sink(made[made.length - 1]);
        },
    };
};

const disposeSide = <TEffect extends object>(arm: TArm<TEffect>, sink: (effect: TEffect) => void): TPriceSide => {
    const world = worldOf();
    const { db, windows, body } = world;
    const resident = arm.create(world, windows[0], body);
    const made: TEffect[] = [];
    return {
        reset: () => {
            made.length = 0;
            for (let i = 0; i < EFFECTS; i++) made.push(arm.create(world, windows[i % windows.length], body));
            sink(resident);
        },
        operationsPerPass: EFFECTS,
        run: times => {
            for (let i = 0; i < times; i++) arm.dispose(world, made[i]);
            db.flush();
            sink(made[0]);
        },
    };
};

const wakeSide = <TEffect>(arm: TArm<TEffect>, sinkNumber: (value: number) => void): TPriceSide => {
    const world = worldOf();
    const { db, slots, windows, woke, body } = world;
    const channelSlot = db.defaultChannelSlot;
    for (let i = 0; i < EFFECTS; i++) arm.create(world, windows[i % windows.length], body);
    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                OIMChannelService.INSTANCE.write(channelSlot, slots[i % POOL]);
                db.flush();
            }
            sinkNumber(woke[0]);
        },
    };
};

const sinkOurs = (effect: object): void => { priceSink.ours = effect; };
const sinkFloor = (effect: object): void => { priceSink.floor = effect; };
const sinkNumber = (value: number): void => { priceSink.number = value; };

const SHAPE_CAVEAT =
    'THE SHIPPED SERVICE AGAINST THE BENCH\'S OWN LITERAL COPY OF ITS ALGORITHM. Ours is the shipped '
    + '`OIMEffectService`, whose effects are plain `TOIMEffect` objects carrying an `effectService` reference. '
    + 'The floor is a literal copy of the same fields and the same run and dispose steps, kept in this file as '
    + 'module-level functions and a small literal service object (`runEffectIfSourcesChanged`, '
    + '`setPositionInSubscribedSlot`) because the channel and `OIMSlotOwner.unsubscribeFromSlot` call those through '
    + 'the effect. Both subscribe through the same `OIMSlotOwner.subscribeToSlot`, so `isolate` keeps '
    + 'each arm in its own process. Each arm keeps ONE resident effect alive for the whole process, so the '
    + 'hidden-class loss at a full GC (WHY-EACH-ROW.md, churnChain) is excluded and what remains is the cost '
    + 'of the service call itself. The floor skips the shipped `createEffect`\'s source-computed dedup `Set` branch, '
    + 'its try/catch and its frame-scheduling check, none of which does work for an effect with no source computeds.';

export const alternativePairsEffectShape: readonly TPricePair[] = [
    {
        id: 'alt.effect-shape.class-vs-literal-and-service.create',
        path: EPricePath.PerRelationship,
        ours: 'effectService.createEffect(rootSlots, [], body) — a new TOIMEffect over 8 roots',
        floor: 'createLiteralEffect(channelSlot, rootSlots, body) — a literal over 8 roots, subscribed by a shared function',
        isolate: true,
        caveat: `${SHAPE_CAVEAT} One operation is one effect created and subscribed to 8 roots; the disposal of the pass is in \`reset\`, untimed.`,
        build: wanted => ({
            ours: wanted === 'floor' ? INERT : createSide(classArm, sinkOurs),
            floor: wanted === 'ours' ? INERT : createSide(literalArm, sinkFloor),
        }),
    },
    {
        id: 'alt.effect-shape.class-vs-literal-and-service.wake',
        path: EPricePath.PerFrame,
        ours: 'OIMChannelService.INSTANCE.write(channelSlot, slot); db.flush() — wakes the TOIMEffects standing on that slot',
        floor: 'OIMChannelService.INSTANCE.write(channelSlot, slot); db.flush() — wakes the literal effects standing on that slot',
        isolate: true,
        caveat: `${SHAPE_CAVEAT} 1024 effects stand over 57 overlapping 8-row windows of 64 rows; one operation is one write and one frame, which runs every effect whose window holds the row (up to 8).`,
        build: wanted => ({
            ours: wanted === 'floor' ? INERT : wakeSide(classArm, sinkNumber),
            floor: wanted === 'ours' ? INERT : wakeSide(literalArm, sinkNumber),
        }),
    },
    {
        id: 'alt.effect-shape.class-vs-literal-and-service.dispose',
        path: EPricePath.PerRelationship,
        ours: 'effectService.disposeEffect(effect) — a TOIMEffect over 8 roots',
        floor: 'disposeLiteralEffect(effect) — a literal over 8 roots',
        isolate: true,
        caveat: `${SHAPE_CAVEAT} One operation is one effect unsubscribed from 8 roots; the pass's effects are created in \`reset\`, untimed, and one frame closes the pass.`,
        build: wanted => ({
            ours: wanted === 'floor' ? INERT : disposeSide(classArm, sinkOurs),
            floor: wanted === 'ours' ? INERT : disposeSide(literalArm, sinkFloor),
        }),
    },
];
