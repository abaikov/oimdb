import {
    OIMChannelService,
    OIMContentChangeListenerService,
    OIMSlotContentBucketServiceSetDriven,
    OIMSlotReleasePolicyNever,
    OIMSlotStoreServiceMapDriven,
    createOIMBucketService,
    oimIsSlotReleased,
} from '../../../core/src/index';
import type {
    IOIMContentChangeListener,
    OIMDB,
    TOIMBucketSlot,
    TOIMBucketSlotsSetStore,
    TOIMColumnSlot,
    TOIMEntitySlot,
    TOIMStoreKey,
} from '../../../core/src/index';
import { EPricePath } from './EPricePath';
import { priceCollectionFixture } from './priceFixture';
import { priceSink } from './priceSink';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';

type TBucketMember = { id: string };

type TMemberEntitySlot = TOIMEntitySlot<TBucketMember, TOIMStoreKey>;

type TMemberSlotsSetStore = TOIMBucketSlotsSetStore<TMemberEntitySlot>;

type TMemberBucketSlot = TOIMBucketSlot<TMemberSlotsSetStore, string>;

type TFloorBucket = {
    readonly key: string;
    readonly bucketMembers: Set<TBucketMember>;
    readonly holdCount: number;
    readonly isKeptWhenEmpty: boolean;
    isEmpty: boolean;
    isReleased: boolean;
    changedAtRevision: number;
};

type TFloorClock = { revision: number };

type TFloorContentChangeListener = { onContentChanged(floorBucket: TFloorBucket): void };

type TBucketAddsScenario = {
    readonly name: string;
    readonly what: string;
    readonly caveat: string;
    readonly addsPerSubframe: number;
    readonly bucketCount: number;
    readonly hasListener: boolean;
    readonly isHeld: boolean;
};

const countingContentChangeListener: IOIMContentChangeListener<TMemberBucketSlot, readonly TMemberEntitySlot[]> = {
    onContentChanged: () => { priceSink.number++; },
    onContentChangedMany: bucketSlotChannelQueue => { priceSink.number += bucketSlotChannelQueue.getEntryCount(); },
};

const floorCountingContentChangeListener: TFloorContentChangeListener = {
    onContentChanged: () => { priceSink.number++; },
};

const bucketKeysOf = (bucketCount: number): string[] =>
    Array.from({ length: bucketCount }, (_, at) => `bucket-${at}`);

const bucketMembersOf = (memberCount: number): TBucketMember[] =>
    Array.from({ length: memberCount }, (_, at) => ({ id: `member-${at}` }));

const sideOfPasses = (addsPerSubframe: number, runPass: (adds: number) => void): TPriceSide => {
    const side: TPriceSide = {
        reset: () => undefined,
        run: times => {
            let remaining = times;
            while (remaining >= addsPerSubframe) {
                runPass(addsPerSubframe);
                remaining -= addsPerSubframe;
            }
            if (remaining !== 0) runPass(remaining);
        },
    };
    side.run(addsPerSubframe * 256);
    return side;
};

const oursSide = (
    bucketAddsScenario: TBucketAddsScenario, db: OIMDB, entitySlots: readonly TMemberEntitySlot[],
): TPriceSide => {
    const { addsPerSubframe, bucketCount } = bucketAddsScenario;
    const bucketService = createOIMBucketService<
        TMemberEntitySlot, string, TMemberSlotsSetStore, OIMSlotContentBucketServiceSetDriven<TMemberEntitySlot>
    >(db, {
        bucketSlotStoreService: new OIMSlotStoreServiceMapDriven<TMemberBucketSlot, string>(),
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TMemberEntitySlot>(),
        columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
        slotReleasePolicy: OIMSlotReleasePolicyNever.INSTANCE,
    });
    const slotContentService = bucketService.slotContentService;
    const bucketStoreSlot = bucketService.createStoreSlot(db);
    const bucketKeys = bucketKeysOf(bucketCount);
    const bucketSlots = bucketKeys.map(key => bucketService.holdSlotByKey(bucketStoreSlot, key));
    if (!bucketAddsScenario.isHeld) {
        for (let b = 0; b < bucketSlots.length; b++) bucketSlots[b].owner.unholdSlot(bucketSlots[b]);
    }
    if (bucketAddsScenario.hasListener) {
        OIMContentChangeListenerService.INSTANCE.addContentChangeListener(bucketStoreSlot, countingContentChangeListener, undefined);
    }
    db.flush();
    const addPass = (adds: number): void => {
        OIMChannelService.INSTANCE.openSubframe(db.defaultChannelSlot);
        for (let i = 0; i < adds; i++) {
            slotContentService.addBucketMemberSlot(bucketService.getSlotByKey(bucketStoreSlot, bucketKeys[i % bucketCount]), entitySlots[i]);
        }
        OIMChannelService.INSTANCE.closeSubframe(db.defaultChannelSlot);
    };
    const clearPass = (): void => {
        for (let b = 0; b < bucketCount; b++) slotContentService.clearBucketMemberSlots(bucketSlots[b]);
        priceSink.ours = bucketSlots[0];
    };
    const assertBucketsFiled = (bucketMemberSlotCount: number): void => {
        let filedBucketMemberSlotCount = 0;
        for (let b = 0; b < bucketCount; b++) {
            const bucketSlot = bucketSlots[b];
            if (oimIsSlotReleased(bucketSlot) || bucketService.findSlotByKey(bucketStoreSlot, bucketKeys[b]) !== bucketSlot) {
                throw new Error(`price: ${bucketAddsScenario.name} lost the bucket ${bucketKeys[b]}.`);
            }
            filedBucketMemberSlotCount += slotContentService.getBucketMemberSlotCount(bucketSlot);
        }
        if (filedBucketMemberSlotCount !== bucketMemberSlotCount) {
            throw new Error(
                `price: ${bucketAddsScenario.name} files ${filedBucketMemberSlotCount} members, expected ${bucketMemberSlotCount}.`,
            );
        }
    };
    addPass(addsPerSubframe);
    assertBucketsFiled(addsPerSubframe);
    clearPass();
    assertBucketsFiled(0);
    const side = sideOfPasses(addsPerSubframe, adds => {
        addPass(adds);
        clearPass();
    });
    assertBucketsFiled(0);
    return side;
};

const floorSide = (bucketAddsScenario: TBucketAddsScenario, bucketMembers: readonly TBucketMember[]): TPriceSide => {
    const { addsPerSubframe, bucketCount } = bucketAddsScenario;
    const floorClock: TFloorClock = { revision: 0 };
    const floorContentChangeListeners: TFloorContentChangeListener[] =
        bucketAddsScenario.hasListener ? [floorCountingContentChangeListener] : [];
    const bucketKeys = bucketKeysOf(bucketCount);
    const floorBucketsByKey = new Map<string, TFloorBucket>();
    const floorBuckets: TFloorBucket[] = bucketKeys.map(key => {
        const floorBucket: TFloorBucket = {
            key,
            bucketMembers: new Set<TBucketMember>(),
            holdCount: bucketAddsScenario.isHeld ? 1 : 0,
            isKeptWhenEmpty: true,
            isEmpty: true,
            isReleased: false,
            changedAtRevision: 0,
        };
        floorBucketsByKey.set(key, floorBucket);
        return floorBucket;
    });
    const changeFloorBucket = (floorBucket: TFloorBucket): void => {
        if (floorBucket.holdCount !== 0) floorBucket.changedAtRevision = ++floorClock.revision;
        floorBucket.isEmpty = floorBucket.bucketMembers.size === 0;
        for (let i = 0; i < floorContentChangeListeners.length; i++) floorContentChangeListeners[i].onContentChanged(floorBucket);
    };
    const releaseFloorBucketIfUnheld = (floorBucket: TFloorBucket): void => {
        if (floorBucket.holdCount !== 0 || floorBucket.isReleased || floorBucket.isKeptWhenEmpty || !floorBucket.isEmpty) return;
        floorBucket.isReleased = true;
        floorBucketsByKey.delete(floorBucket.key);
    };
    return sideOfPasses(addsPerSubframe, adds => {
        for (let i = 0; i < adds; i++) {
            const floorBucket = floorBucketsByKey.get(bucketKeys[i % bucketCount]);
            if (floorBucket === undefined) continue;
            const floorBucketMembers = floorBucket.bucketMembers;
            const hadCount = floorBucketMembers.size;
            floorBucketMembers.add(bucketMembers[i]);
            if (floorBucketMembers.size !== hadCount) changeFloorBucket(floorBucket);
        }
        for (let b = 0; b < bucketCount; b++) releaseFloorBucketIfUnheld(floorBuckets[b]);
        for (let b = 0; b < bucketCount; b++) {
            const floorBucket = floorBuckets[b];
            if (floorBucket.bucketMembers.size !== 0) {
                floorBucket.bucketMembers.clear();
                changeFloorBucket(floorBucket);
            }
            releaseFloorBucketIfUnheld(floorBucket);
        }
        priceSink.floor = floorBuckets[0];
    });
};

const HELD_CAVEAT =
    'The bucket is HELD through bucketService.holdSlotByKey and carries no effect, so the channel-slot write takes '
    + 'its no-dependent path.';

const UNHELD_CAVEAT =
    'NOTHING HOLDS the bucket: it is minted through holdSlotByKey and given back through bucketSlot.owner.unholdSlot '
    + 'at build. The channel write door returns at once for an unheld slot, so ours stamps nothing, and the floor '
    + 'guards its stamp by the same hold count and stamps nothing either.';

const IMMEDIATE_CAVEAT =
    'With a hold and no content-change listener the shipped door takes its immediate path on every add: it writes '
    + 'the bucket to the channel, settles it and calls dispatchContentChange, which finds no listener; nothing is pushed for '
    + 'the close and no release check runs there, nor after the clear, which takes the same immediate path. The '
    + 'floor stamps and settles on every add too, so per add the two sides do the same observable work; the floor '
    + 'alone runs a release check per bucket at the close and after each clear, which returns at its hold count and '
    + 'pushes the ratio down by those tests.';

const LISTENER_CAVEAT =
    'With a content-change listener the shipped door takes its batch path whether or not the bucket is held: the '
    + 'first add of a pass writes, settles and announces the bucket (the announce is buffered by the door\'s own '
    + 'subframe and delivered at its close) and pushes the bucket once for the outermost close; every later add only '
    + 'flags it; the outermost close writes, settles and announces it once more and runs its release check. The '
    + 'listener therefore hears a bucket at most twice per pass, where the floor stamps, settles and announces on '
    + 'every add. Whenever a bucket takes more than one add in a pass the floor does more work than ours, and that '
    + 'pushes the ratio down, in our favour, the more so the more adds a bucket takes.';

const UNHELD_SILENT_CAVEAT =
    'With no listener and no hold the shipped door settles the first add of a pass at once and pushes the bucket '
    + 'once for the outermost close; every later add only flags it; the close settles it once more and runs its '
    + 'release check. The floor settles on every add and runs the release check for every bucket at the close. '
    + 'Whenever a bucket takes more than one add in a pass the floor does more settles than ours, which pushes the '
    + 'ratio down, in our favour.';

const COMMON_CAVEAT =
    'One operation is one member add. Both sides open one outer subframe per pass (ours through OIMChannelService.openSubframe '
    + 'and closeSubframe on the default channel slot), find each bucket by key (ours bucketService.getSlotByKey, '
    + 'a store get plus an undefined test, followed by the public slotContentService.addBucketMemberSlot — there is no by-key add door now, so the '
    + 'lookup and the add are two calls here; the floor Map.get), add the member to a Set, and after the close empty every bucket of the pass, ours through '
    + 'slotContentService.clearBucketMemberSlots: the clear is timed on both sides alike and carries its own stamp, '
    + 'settle, announce and release check. Ours additionally, per add, asserts that the channel is not flushing and '
    + 'that neither slot is released, opens and closes the owner\'s and the channel\'s subframe, holds the member '
    + 'slot and records the append on the no-op command recorder; per clear it copies the members into a fresh '
    + 'array, gives back each member\'s hold and runs each member\'s release check. The floor keeps plain objects '
    + 'and holds nothing. All of that pushes the ratio up, against ours. No flush runs inside a pass: the channel '
    + 'has no scheduler and the bucket no effect, so nothing asks for a frame and the clock only advances.';

const POLICY_CAVEAT =
    'The bucket collection is built with OIMSlotReleasePolicyNever and the floor\'s release check mirrors it, keeping '
    + 'an empty bucket: under the default policy an unheld bucket emptied by the per-pass clear is released and '
    + 'unfiled, and the next pass\'s adds would find no bucket and land nowhere. The release check is therefore '
    + 'priced as its tests, never as a release.';

const behaviourCaveatOf = (bucketAddsScenario: TBucketAddsScenario): string => {
    if (bucketAddsScenario.hasListener) return LISTENER_CAVEAT;
    return bucketAddsScenario.isHeld ? IMMEDIATE_CAVEAT : UNHELD_SILENT_CAVEAT;
};

const pairOf = (bucketAddsScenario: TBucketAddsScenario): TPricePair => ({
    id: `bucket-adds.${bucketAddsScenario.name}`,
    path: EPricePath.PerRowPerWrite,
    ours: `OIMChannelService.openSubframe(defaultChannelSlot); slotContentService.addBucketMemberSlot(bucketService.getSlotByKey(bucketStoreSlot, key), entitySlot) for `
        + `${bucketAddsScenario.what}; OIMChannelService.closeSubframe(defaultChannelSlot); then slotContentService.clearBucketMemberSlots(bucketSlot) `
        + 'per bucket',
    floor: 'the same adds into a Set per bucket found by Map.get, each landed add stamped when the bucket is held, '
        + `settled${bucketAddsScenario.hasListener ? ' and announced to the listener' : ''}; a release check per bucket `
        + 'at the close; then every bucket cleared, stamped, settled and checked the same way',
    caveat: [
        bucketAddsScenario.caveat,
        bucketAddsScenario.isHeld ? HELD_CAVEAT : UNHELD_CAVEAT,
        behaviourCaveatOf(bucketAddsScenario),
        COMMON_CAVEAT,
        POLICY_CAVEAT,
    ].join(' '),
    build: () => {
        const bucketMembers = bucketMembersOf(bucketAddsScenario.addsPerSubframe);
        const { db, slots } = priceCollectionFixture(bucketMembers);
        const floorBucketMembers = bucketMembers.map(bucketMember => ({ ...bucketMember }));
        return {
            ours: oursSide(bucketAddsScenario, db, slots),
            floor: floorSide(bucketAddsScenario, floorBucketMembers),
        };
    },
});

const oneBucketScenario = (adds: number): Omit<TBucketAddsScenario, 'isHeld'> => ({
    name: `one-bucket-${adds}-adds`,
    what: `${adds} adds to one bucket in one outer subframe`,
    caveat: 'Every add of a pass goes to ONE bucket inside one outer subframe opened on the channel; the id names how '
        + 'many adds a pass makes. No content-change listener.',
    addsPerSubframe: adds,
    bucketCount: 1,
    hasListener: false,
});

const listenerScenario = (adds: number): Omit<TBucketAddsScenario, 'isHeld'> => ({
    name: `one-bucket-${adds}-adds-with-a-listener`,
    what: `${adds} adds to one bucket in one outer subframe, one content-change listener`,
    caveat: 'Every add of a pass goes to ONE bucket inside one outer subframe opened on the channel, with one '
        + 'content-change listener added through OIMContentChangeListenerService.INSTANCE.addContentChangeListener(bucketStoreSlot, …); the id names how many '
        + 'adds a pass makes.',
    addsPerSubframe: adds,
    bucketCount: 1,
    hasListener: true,
});

const spreadScenario = (adds: number): Omit<TBucketAddsScenario, 'isHeld'> => ({
    name: `${adds}-buckets-one-add-each`,
    what: `${adds} adds, one to each of ${adds} buckets, in one outer subframe`,
    caveat: 'Each add of a pass goes to a DIFFERENT bucket inside one outer subframe opened on the channel, so every '
        + 'bucket takes exactly one add and there is nothing to coalesce; the id names how many buckets. No '
        + 'content-change listener.',
    addsPerSubframe: adds,
    bucketCount: adds,
    hasListener: false,
});

const SCENARIOS: readonly Omit<TBucketAddsScenario, 'isHeld'>[] = [
    ...[1, 8, 64].map(oneBucketScenario),
    ...[1, 8, 64].map(listenerScenario),
    ...[8, 64].map(spreadScenario),
];

export const pricePairsBucketAdds: readonly TPricePair[] = [
    ...SCENARIOS.map(bucketAddsScenario => pairOf({
        ...bucketAddsScenario, name: `held.${bucketAddsScenario.name}`, isHeld: true,
    })),
    ...SCENARIOS.map(bucketAddsScenario => pairOf({
        ...bucketAddsScenario, name: `unheld.${bucketAddsScenario.name}`, isHeld: false,
    })),
];
