import {
    OIMDB,
    OIMEffectService,
    OIMSlotContentBucketServiceArrayDriven,
    createOIMEntityService,
    createOIMSingleBucketService,
    oimOrderedListCommandsOfTransition,
} from '../../../../index';
import type {
    TOIMBucketSlot,
    TOIMEntitySlot,
    TOIMOrderedListCommand,
    TOIMBucketSlotsArrayStore,
    TOIMSlot,
} from '../../../../index';
import { assertConsistent,entitiesUnderTest } from '../../../../../tests/support/assertConsistent';
import type { TBucketsUnderTest } from '../../../../../tests/support/assertConsistent';

type TCard = { id: string; rank: number; label: string };
type TCardSlot = TOIMEntitySlot<TCard, string>;
type TSlots = TOIMBucketSlotsArrayStore<TCardSlot>;

const KEYS = 10;

const makeRandom = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
};

/** The consumer's half of the contract, and nothing else. */
const applyCommands = (
    list: TOIMSlot[], commands: readonly TOIMOrderedListCommand[],
): void => {
    for (const command of commands) {
        if (command.type === 'remove') { list.splice(command.index, 1); continue; }
        if (command.type === 'insert') { list.splice(command.index, 0, command.slot); continue; }
        if (command.type === 'reset') {
            list.length = 0;
            for (const slot of command.slots) list.push(slot);
            continue;
        }
        const [moved] = list.splice(command.from, 1);
        list.splice(command.to, 0, moved);
    }
};

const byRankThenId = (x: TCardSlot, y: TCardSlot): number => {
    const left = x.entity;
    const right = y.entity;
    if (left === undefined || right === undefined) return 0;
    return left.rank - right.rank || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
};

const idsOf = (list: readonly TOIMEntitySlot[]): string =>
    list.map(slot => (slot.entity as TCard | undefined)?.id ?? '<no value>').join(', ');

/**
 * A stream, the list a consumer of it is holding, and the deliveries it has
 * been given since the last time they were applied.
 */
type TFollower = {
    readonly name: string;
    readonly list: TOIMEntitySlot[];
    readonly deliveries: (readonly TOIMOrderedListCommand[])[];
    /**
     * Whether a `reset` is an answer this stream is allowed to give — a
     * property of the stream, decided where it is built, so no check below has
     * to ask what kind of stream it is holding. A stream given no `maxCommandsPerSlot`
     * reaches no branch that can produce one.
     */
    readonly mayReset: boolean;
    resets: number;
};

/**
 * The single bucket, presented to `assertConsistent` as the collection of one it
 * is: nothing filed it, so `index.all` is empty and every check that
 * helper makes about a bucket's slots would otherwise be skipped.
 */
const asCollectionOfOne = (
    membersService: OIMSlotContentBucketServiceArrayDriven<TCardSlot>,
    bucket: TOIMBucketSlot<TSlots, void>,
): TBucketsUnderTest => ({
    bucketSlots: [bucket],
    getBucketSlotByKey: (): TOIMBucketSlot => bucket,
    getBucketMemberSlots: (): Iterable<TOIMEntitySlot> => membersService.getBucketMemberSlots(bucket),
    getBucketMemberSlotCount: (): number => membersService.getBucketMemberSlotCount(bucket),
});

const run = (seed: number, steps: number): void => {
    const random = makeRandom(seed);

    const db = new OIMDB();
    const cardsService = createOIMEntityService(db, { keyOf: (card: TCard) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMSlotContentBucketServiceArrayDriven<TCardSlot>();
    const singleBucketService = createOIMSingleBucketService<TCardSlot, TSlots, OIMSlotContentBucketServiceArrayDriven<TCardSlot>>(
        db, { slotContentService: membersService },
    );
    const singleBucket = singleBucketService.createStoreSlot(db);
    const bucket = singleBucketService.getSingleSlot(singleBucket);

    const updateByKey = (key: string, patch: Partial<TCard>): void => {
        const slot = cardsService.findSlotByKey(cards, key);
        if (slot !== undefined) cardsService.slotContentService.updateEntity(slot, patch);
    };

    /**
     * Which rows the population is holding — the script's own record, because
     * "every row that holds a value" is what the caller composes the response
     * from and the engine keeps no such list for it.
     */
    const alive = new Set<string>();
    const stateSlots = (): void => {
        membersService.writeBucketMemberSlots(singleBucketService.getSingleSlot(singleBucket), Array.from(alive, (id) => cardsService.getSlotByKey(cards, id)!).sort(byRankThenId));
    };

    cardsService.slotContentService.upsertEntities(cards, [
        { id: 'k0', rank: 3, label: 'a' },
        { id: 'k1', rank: 1, label: 'b' },
        { id: 'k2', rank: 2, label: 'c' },
    ]);
    for (const id of ['k0', 'k1', 'k2']) alive.add(id);
    stateSlots();
    db.flush();

    const followers: TFollower[] = [];
    /**
     * WHAT A CONSUMER OF THE DIFF WRITES, and there is nothing else to it: an
     * effect over the bucket, the list this stream believes it last handed out,
     * and one `oimOrderedListCommandsOfTransition` call between them.
     */
    const follow = (name: string, maxCommandsPerSlot: number | undefined): void => {
        const follower: TFollower = {
            name,
            list: [],
            deliveries: [],
            mayReset: maxCommandsPerSlot !== undefined,
            resets: 0,
        };
        /** What this stream last told its consumer it was holding. */
        let shown: TOIMEntitySlot[] = [];
        OIMEffectService.INSTANCE.createEffect(db, [bucket], [], () => {
            const settled = Array.from(membersService.getBucketMemberSlots(singleBucketService.getSingleSlot(singleBucket)));
            // Recorded whether or not it is empty: an effect that ran is a
            // consumer that was woken, and the silence asserted below is about
            // the wake-up, not about the script it produced.
            follower.deliveries.push(oimOrderedListCommandsOfTransition(shown, settled, maxCommandsPerSlot));
            shown = settled;
        });
        shown =Array.from(membersService.getBucketMemberSlots(singleBucketService.getSingleSlot(singleBucket)));
        for (const slot of shown) follower.list.push(slot);
        followers.push(follower);
    };
    follow('the patient stream', undefined);
    follow('the stream that resets above half', 0.5);

    let minted = 0;
    for (let step = 0; step < steps; step++) {
        for (const follower of followers) follower.deliveries.length = 0;

        const id = `k${Math.floor(random() * KEYS)}`;
        const choice = random();
        /**
         * Did this step touch anything the bucket keeps? If it did not, the
         * bucket cannot have moved, and a stream that delivered anything at all
         * has told a consumer to re-render a list that is exactly as it was.
         */
        let touchedTheList = true;
        let what: string;

        if (choice < 0.32) {
            what = `upsert ${id}`;
            cardsService.slotContentService.upsertEntity(cards, { id, rank: Math.floor(random() * 12), label: `l${Math.floor(random() * 4)}` });
            alive.add(id);
        } else if (choice < 0.46) {
            what = `rank of ${id}`;
            updateByKey(id, { rank: Math.floor(random() * 12) });
        } else if (choice < 0.58) {
            what = `label of ${id} — a column the caller's order does not read`;
            touchedTheList = false;
            updateByKey(id, { label: `l${Math.floor(random() * 4)}` });
            // NOT `alive.add(id)`: `updateByKey` on a key with no identity does
            // nothing at all, so a step naming an absent row changes neither the
            // population nor the bucket's slots.
        } else if (choice < 0.72) {
            what = `remove ${id}`;
            const removedSlot = cardsService.findSlotByKey(cards, id);
            if (removedSlot !== undefined) cardsService.slotContentService.deleteEntity(removedSlot);
            alive.delete(id);
        } else if (choice < 0.82) {
            // Several ranks in one batch: one frame, many moves.
            what = 'a batch of ranks';
            for (let i = 0; i < 4; i++) {
                const moved = `k${Math.floor(random() * KEYS)}`;
                updateByKey(moved, { rank: Math.floor(random() * 12) });
            }
        } else if (choice < 0.91) {
            // Reverse everything. Nothing joins or leaves and every slot the
            // bucket holds moves, which is the case a diff describes at its
            // most expensive and the one a threshold exists to give up on.
            what = 'reverse every rank';
            for (const key of Array.from(alive)) {
                const slot = cardsService.getSlotByKey(cards, key);
                const card = slot.entity;
                if (card === undefined) continue;
                cardsService.slotContentService.updateEntity(slot,{ rank: 20 - card.rank });
            }
        } else {
            // A wholesale replacement — nothing in common with what was there.
            // `clear` empties every value and leaves every slot in the bucket standing,
            // so the response the caller states below is what actually evicts
            // them — and what lets the emptied identities go.
            what = 'a wholesale replacement';
            cardsService.slotContentService.clearAllEntities(cards);
            alive.clear();
            for (let i = 0; i < 4; i++) {
                minted++;
                cardsService.slotContentService.upsertEntity(cards, { id: `w${minted}`, rank: Math.floor(random() * 12), label: 'w' });
                alive.add(`w${minted}`);
            }
        }

        stateSlots();

        db.flush();

        const where = `seed ${seed}, step ${step}, ${what}`;
        assertConsistent(entitiesUnderTest(cardsService, cards), [asCollectionOfOne(membersService, bucket)], where);

        const settled = Array.from(membersService.getBucketMemberSlots(singleBucketService.getSingleSlot(singleBucket)));
        for (const follower of followers) {
            if (!touchedTheList && follower.deliveries.length > 0) {
                throw new Error(
                    `${where}: ${follower.name} was woken ${follower.deliveries.length} time(s) by a write ` +
                    'that moved a column the caller\'s order does not read, into a bucket whose slots did not change. ' +
                    'Nothing joined, left or reordered, so a consumer was handed work for a list that did not ' +
                    'change.',
                );
            }
            for (const commands of follower.deliveries) {
                for (const command of commands) if (command.type === 'reset') follower.resets++;
                applyCommands(follower.list, commands);
            }
            // The half that makes the reset assertion at the bottom mean
            // something; see the header.
            if (!follower.mayReset && follower.resets > 0) {
                throw new Error(
                    `${where}: ${follower.name} handed its consumer a reset. It was built with no ` +
                    'threshold, so it has no branch that may give up and answer with the new list — a ' +
                    'consumer that chose this stream chose it to be told what changed.',
                );
            }
            if (follower.list.length !== settled.length) {
                throw new Error(
                    `${where}: ${follower.name} left its consumer holding ${follower.list.length} row(s) ` +
                    `[${idsOf(follower.list)}] where the bucket holds ${settled.length} ` +
                    `[${idsOf(settled)}].`,
                );
            }
            for (let i = 0; i < settled.length; i++) {
                if (follower.list[i] === settled[i]) continue;
                throw new Error(
                    `${where}: ${follower.name} put a different identity at position ${i}. Its consumer holds ` +
                    `[${idsOf(follower.list)}], the bucket holds [${idsOf(settled)}]. A command stream that ` +
                    'is wrong once is wrong for every frame after it.',
                );
            }
        }
    }

    // Found by the property rather than by position, which is the same thing
    // the per-step check above asks: whether a reset is an answer this stream
    // may give. Read off `mayReset` so the two halves cannot come to disagree
    // about which stream is which.
    const resetting = followers.find(follower => follower.mayReset) as TFollower;
    if (resetting.resets === 0) {
        throw new Error(
            `seed ${seed}: ${resetting.name} never emitted one, so the reset path was not exercised at all ` +
            'and this run proves nothing about it.',
        );
    }
};

describe('the ordered command stream against the consumer that applies it', () => {
    for (const seed of [1, 2, 3, 7, 11, 42, 1337, 90210]) {
        it(`reproduces the bucket exactly, frame after frame (seed ${seed})`, () => {
            run(seed, 200);
        });
    }
});
