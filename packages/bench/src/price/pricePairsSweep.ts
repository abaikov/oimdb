import {
    OIMDB,
    OIMSlotContentBucketServiceArrayDriven,
    OIMSlotContentBucketServiceSetDriven,
    OIMSlotStoreServiceMapDriven,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
    createOIMEntityWriterReplacing,
    createOIMIndexService,
} from '../../../core/src/index';
import type {
    IOIMEntityWriter,
    OIMSlotContentBucketService,
    TOIMBucketSlotsArrayStore,
    TOIMBucketSlot,
    TOIMBucketSlotsSetStore,
    TOIMColumnSlot,
    TOIMEntitySlot,
    TOIMStoreKey,
} from '../../../core/src/index';
import { EPricePath } from './EPricePath';
import { priceDataset } from './priceDataset';
import { priceFixture } from './priceFixture';
import { priceGroupIndex } from './priceGroupIndex';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';

/**
 * THE STRATEGY SWEEP — one task, one floor, and every shipped combination that
 * can perform that task, measured against the same floor.
 *
 * THE QUESTION IS the house rule "reach the floor by strategy": for every typical
 * task there exists a combination of shipped strategies whose cost is at or below
 * the hand-written floor. Every other pair in this suite prices ONE call on the
 * defaults, which says NOTHING about that — the goal is about the best arm. So a
 * ratio above 1.00 HERE is a loss only if it is the LOWEST the task's arms
 * produced.
 *
 * ONE SENTENCE, AND THE FILE HAS FAILED IF THE OUTPUT DOES NOT YIELD IT:
 *
 *     "For <task>, the closest combination was <arm>, and it did / did not
 *      reach the floor."
 *
 * How to read it off the report:
 *
 *   - Select ONE task: `npm run price -- --only sweep.grouped-column`. Every arm
 *     of one task shares an id prefix for this reason; arms of different tasks
 *     answer different floors and are not comparable.
 *   - `formatPriceReport` prints WORST RATIO FIRST, so within one task's
 *     selection the LAST row printed is the closest arm.
 *   - "Reached the floor" means that row's ratio is at or below 1.00 PLUS THAT
 *     ROW'S OWN NOISE. Nearer 1.00 than the row's noise is not a reading that it
 *     reached the floor, it is a reading that this machine could not tell the two
 *     apart — the report's `=` marker says so on the row.
 *   - If the closest arm did NOT reach the floor, that is the finding, and it
 *     belongs in `packages/bench/WHY-EACH-ROW.md` as a MISSING STRATEGY or an
 *     HONEST LIMIT. The second owes a gap decomposition.
 *
 * WHY NO ROW HERE DECLARES `isolate`: the hazard is real and would be fatal —
 * every arm enters one compiled `upsertEntity`/`updateEntity` and reaches its strategies
 * through one call site each — BUT TWO ARMS ARE NEVER IN ONE PROCESS. Every
 * timing is a fresh Node process per pair and `price-worker.ts` calls `build` on
 * THAT PAIR ONLY, so the isolation is already there structurally. That OBLIGES
 * EVERY `build` HERE to CONSTRUCT EXACTLY ONE STRATEGY OF EACH KIND, which is why
 * `priceFixture` takes the write strategy as an argument. The other question
 * `isolate` answers, whether our side shares a compiled body with the FLOOR, is
 * `no` on every row: every floor is hand-written JavaScript over `Map`, `Set` and
 * plain objects.
 *
 * THE THREE TASKS, chosen because a floor can be written HONESTLY for each:
 *
 *   1. `sweep.insert-then-read`  — insert a population and read one row back by
 *      key. The task every load path is.
 *   2. `sweep.grouped-column`    — write one column of one row, with one index
 *      over that column, and read the group. The task every filtered list is.
 *   3. `sweep.poll-unchanged`    — re-send a row unchanged. The shape a server
 *      poll produces, and the one where the engine can win.
 *
 * ONE AXIS IS FIXED IN ALL THREE — THE IDENTITY STORE. The map-driven store takes
 * a SCALAR and the tree-driven one a key walked through a tree, and a task whose
 * key is one string has nothing for the tree to walk.
 */

/**
 * The MIDDLE of the population, same subscript on both sides: not the first
 * (which a `Map` may answer out of a bucket the fill just touched) and not the
 * last (minted one operation ago on both sides).
 */
const readBackAt = priceDataset.batch >> 1;

/**
 * THE ADDRESS EVERY GROUPED ARM READS BACK, resolved once, outside the clock, on
 * both sides. The dataset spreads its rows evenly and every arm moves every row
 * by one group per pass, so no bucket ever empties.
 */
const READ_GROUP_AT = 0;

type TGroupPatch = { group: string };

const joined = (...parts: readonly string[]): string => parts.join('');

type TOrderedGroupSlots = TOIMBucketSlotsArrayStore<TOIMEntitySlot<TPriceDataRow>>;
type TUnorderedGroupSlots = TOIMBucketSlotsSetStore<TOIMEntitySlot<TPriceDataRow>>;
type TRowSlot = TOIMEntitySlot<TPriceDataRow, TOIMStoreKey>;

const groupedFloor = (held: readonly TPriceDataRow[], names: readonly string[]) => {
    const byGroup = new Map<string, Set<TPriceDataRow>>();
    for (let i = 0; i < names.length; i++) byGroup.set(names[i], new Set<TPriceDataRow>());
    for (let i = 0; i < held.length; i++) {
        const set = byGroup.get(held[i].group);
        if (set !== undefined) set.add(held[i]);
    }
    return byGroup;
};

/**
 * THE FLOOR BODY EVERY ARM OF TASK 2 IS MEASURED AGAINST — written once: several
 * arms, one floor.
 */
const groupedFloorRun = (
    held: readonly TPriceDataRow[],
    names: readonly string[],
    byGroup: Map<string, Set<TPriceDataRow>>,
    readSet: Set<TPriceDataRow>,
) => {
    let shift = 0;
    return (times: number): void => {
        const mask = names.length - 1;
        let done = 0;
        while (done < times) {
            const upTo = Math.min(held.length, times - done);
            shift++;
            for (let i = 0; i < upTo; i++) {
                const row = held[i];
                const next = names[(i + shift) & mask];
                if (row.group !== next) {
                    const from = byGroup.get(row.group);
                    if (from !== undefined) from.delete(row);
                    row.group = next;
                    const to = byGroup.get(next);
                    if (to !== undefined) to.add(row);
                }
            }
            for (const row of readSet) priceSink.floor = row;
            done += upTo;
        }
    };
};

const GROUPED_FLOOR_CAVEAT =
    'THE FLOOR IS THE SAME CODE FOR EVERY ARM OF THIS TASK, which is the property that makes ' +
    'the arms comparable at all. It moves the row between two `Set`s — the container our ' +
    'unordered bucket holds its members in, so this is the structural equal and not a cheaper ' +
    'shape — writes the column, and iterates one group. WHAT IT DOES LESS OF, and every item ' +
    'pushes our ratio UP: it keeps no identity that outlives the value, so nothing can be ' +
    'subscribed to a row or to a group; it stamps no clock; it records no moved columns; it keeps ' +
    'no hold count, so a group cannot be resolved by address and handed to a consumer; and its ' +
    'groups can be read by iterating them and by nothing else. WHAT IS ON BOTH SIDES AND CANCELS: ' +
    'the read group is held from outside the clock on both, and the read visits the same members ' +
    'on both. WHERE THE FLOOR IS CHARGED MORE THAN IT SHOULD BE, stated because it flatters us: ' +
    'it hashes `row.group` to find the departure set, where the index arm reads the previous key ' +
    'off the slot\'s own index-key cell.';

/**
 * TASK 1 — INSERT A POPULATION AND READ ONE ROW BACK BY KEY.
 *
 * WHAT VARIES IS THE WRITE STRATEGY, and the job here is to find out whether the
 * fork is FREE rather than to find a winner: both shipped writers fill a fresh
 * slot through the same `oimInsertEntityWithoutCopy`, and the insert branch of
 * `OIMSlotContentEntityService.insertEntity` (reached by `upsertEntity`) calls `fillEntity` and nothing else of the
 * writer.
 */
const insertThenReadPair = (id: string, arm: string, replacing: boolean): TPricePair => ({
    id,
    path: EPricePath.PerRowPerWrite,
    ours: `entityService.slotContentService.upsertEntity(entityStoreSlot, row) into an empty population, then slotContentService.findEntityByKey(entityStoreSlot, key) — ${arm}`,
    floor: 'map.set(row.id, { ...row }) per row, then map.get(key)',
    caveat:
        `THE ARM IS ${arm.toUpperCase()}, AND THE SWEEP'S QUESTION ON THIS TASK IS WHETHER THE ` +
        'FORK COSTS ANYTHING AT ALL HERE. `createOIMEntityWriterInPlace` and ' +
        '`createOIMEntityWriterReplacing` both default `fillEntity` to `oimInsertEntityWithoutCopy`, and ' +
        'the insert branch of `OIMSlotContentEntityService.insertEntity` (reached by `upsertEntity`) calls `fillEntity` and no other ' +
        'member of the writer — so the two arms should run the same code on this path. [FIGURE ' +
        'STATED IN ADVANCE] Expect the two arms to differ by less than each row\'s own noise; a ' +
        'difference larger than that is the finding. ' +
        'THE FLOOR ALLOCATES A COPY PER ROW AND OURS DOES NOT; it also hashes one string per row. Ours ' +
        'additionally mints a fourteen-field slot, stores the handed ' +
        'row, marks the slot on the channel and decides its emptiness; on this fixture the insert takes its fast path and opens no change window. ' +
        'Direction: inflates our ratio, on both arms, and nothing on this axis can close it. THE ' +
        'READ IS ONE PER POPULATION and is there to make the fill answerable rather than to be ' +
        'priced. THE FLUSH IS INSIDE OUR NUMBER and has no counterpart on the floor; it runs no ' +
        'effect, since nothing subscribes. BOTH SIDES ABANDON THEIR CONTAINER BETWEEN PASSES and ' +
        'both are collected outside the clock.',
    build: () => {
        const rows = priceDataset.makeRows(priceDataset.batch);
        const readKey = rows[readBackAt].id;
        const db = new OIMDB();
        const entityWriter: IOIMEntityWriter = replacing
            ? createOIMEntityWriterReplacing()
            : createOIMEntityWriterInPlace();
        const build = () =>
            createOIMEntityService<TPriceDataRow>(db, {
                keyOf: row => row.id,
                entityWriter,
                columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
            });
        let entityService = build();
        let entityStoreSlot = entityService.createStoreSlot(db);
        let map = new Map<string, TPriceDataRow>();
        return {
            ours: {
                operationsPerPass: rows.length,
                reset: () => {
                    entityService = build();
                    entityStoreSlot = entityService.createStoreSlot(db);
                },
                run: times => {
                    const slotContentService = entityService.slotContentService;
                    for (let i = 0; i < times; i++) slotContentService.upsertEntity(entityStoreSlot, rows[i]);
                    db.flush();
                    priceSink.ours = slotContentService.findEntityByKey(entityStoreSlot, readKey);
                },
            },
            floor: {
                operationsPerPass: rows.length,
                reset: () => {
                    map = new Map<string, TPriceDataRow>();
                },
                run: times => {
                    for (let i = 0; i < times; i++) {
                        const row = rows[i];
                        map.set(row.id, { ...row });
                    }
                    priceSink.floor = map.get(readKey);
                },
            },
        };
    },
});

/**
 * TASK 2 — WRITE ONE COLUMN OF ONE ROW, MOVE THE ROW BETWEEN TWO GROUPS, AND
 * READ THE GROUP.
 *
 * WHAT VARIES IS WHO MOVES THE ROW: the auto-index (`OIMIndex`, which hears the
 * write and re-files the row itself), or the caller through one of the two
 * bucket doors — the whole-bucket `writeBucketMemberSlots`, or the positional pair
 * `removeBucketMemberSlotAt` + `insertBucketMemberSlotAt` on an array-driven service. Plus
 * the write strategy, on the index arm.
 */
const MANUAL_MEMBERSHIP_CAVEAT =
    'THE MEMBERSHIP IS THE CALLER\'S ON THIS ARM: the bucket collection is not an index and hears ' +
    'no write, so the move is made in the same statement sequence as the write, inside the timed ' +
    'body. WHAT THE ARM PAYS THAT THE FLOOR DOES NOT: `updateEntity` walks the patch, gates the column, ' +
    'builds the moved-column list and marks the row on the channel; then the move marks both ' +
    'buckets and keeps the slot\'s hold count. THE ADDRESS IS RESOLVED THE SAME WAY ON BOTH SIDES: ' +
    'one `getSlotByKey` per end of the move, which is the hash the floor pays as `byGroup.get(next)`. ' +
    'THE OLD GROUP IS READ OFF THE STORED ROW BEFORE THE WRITE LANDS, which a caller holding the ' +
    'slot can always do. ';

type TGroupedWorld<TSlots> = {
    readonly fixture: ReturnType<typeof priceFixture>;
    readonly names: readonly string[];
    readonly membersOf: Map<string, TRowSlot[]>;
    readonly readBucket: TOIMBucketSlot<TSlots, TOIMStoreKey>;
    readonly byGroup: Map<string, Set<TPriceDataRow>>;
    readonly readSet: Set<TPriceDataRow>;
};

const groupedFloorOf = (fixture: ReturnType<typeof priceFixture>, names: readonly string[]) => {
    const byGroup = groupedFloor(fixture.held, names);
    const readSet = byGroup.get(names[READ_GROUP_AT]) as Set<TPriceDataRow>;
    return { byGroup, readSet };
};

const membersOfFixture = (fixture: ReturnType<typeof priceFixture>, names: readonly string[]) => {
    const membersOf = new Map<string, TRowSlot[]>();
    for (let g = 0; g < names.length; g++) membersOf.set(names[g], []);
    for (let i = 0; i < fixture.rows.length; i++) {
        const list = membersOf.get(fixture.rows[i].group);
        if (list !== undefined) list.push(fixture.slots[i]);
    }
    return membersOf;
};

const groupedManualWorld = <TSlots>(
    slotContentService: OIMSlotContentBucketService<TOIMEntitySlot<TPriceDataRow>, TSlots>,
) => {
    const fixture = priceFixture(priceDataset.batch);
    const names = priceDataset.groupNames();
    const { bucketService, bucketStoreSlot } = priceGroupIndex<TSlots>(fixture.db, fixture.slots, slotContentService);
    fixture.db.flush();
    const world: TGroupedWorld<TSlots> = {
        fixture,
        names,
        membersOf: membersOfFixture(fixture, names),
        readBucket: bucketService.getSlotByKey(bucketStoreSlot, names[READ_GROUP_AT]),
        ...groupedFloorOf(fixture, names),
    };
    return { world, bucketService, bucketStoreSlot };
};

const groupIndexOf = (fixture: ReturnType<typeof priceFixture>, names: readonly string[]) => {
    const indexService = createOIMIndexService(fixture.db, {
        entityService: fixture.entityService,
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TPriceDataRow>>(),
        keyOf: (row: TPriceDataRow) => row.group,
        columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
    });
    const indexStoreSlot = indexService.createIndexStoreSlot(fixture.entityStoreSlot);
    indexService.holdSlotsByKeys(indexStoreSlot, names);
    fixture.db.flush();
    return { indexService, indexStoreSlot };
};

const assertSameReadGroup = (
    members: Iterable<TOIMEntitySlot<TPriceDataRow>>, readSet: Set<TPriceDataRow>,
): void => {
    let count = 0;
    for (const member of members) {
        if (member.entity === undefined || member.entity.group !== priceDataset.groupNames()[READ_GROUP_AT]) {
            throw new Error('price: the grouped arm reads a member that is not in the read group.');
        }
        count++;
    }
    if (count !== readSet.size) {
        throw new Error(`price: the grouped arm reads ${count} members, the floor ${readSet.size}.`);
    }
};

const groupedIndexPair = (id: string, arm: string, replacing: boolean): TPricePair => ({
    id,
    path: EPricePath.PerWrite,
    ours: `entityService.slotContentService.updateEntity(slot, { group }) with an index store slot over group, then indexService.slotContentService.getBucketMemberSlots(bucket) — ${arm}`,
    floor: 'move the row between two Sets, write the column, iterate one Set',
    caveat: joined(
        `THE ARM IS ${arm.toUpperCase()}. THE MOVE IS THE ENGINE'S: the index listens to the `,
        'collection\'s content changes, so `updateEntity` alone re-files the row — `updateIndexKeyForSlot` reads the ',
        'previous key off the slot\'s index-key cell, runs `keyOf` on the new entity, writes the ',
        'cell, and calls `findSlotByKey` then `addBucketMemberSlot` for the new key and `findSlotByKey` then `removeBucketMemberSlot` for the old, each a hash ',
        'of the address, a `Set` edit, a hold or an unhold and a channel mark queued to the change ',
        'close. A caller writes one call and cannot forget to move a row. [FIGURE STATED IN ',
        'ADVANCE] Expect this to be the closest arm of the task; if a manual door comes out ',
        'closer, the listener path costs more than the caller writing the move. ',
        GROUPED_FLOOR_CAVEAT,
    ),
    build: () => {
        const fixture = priceFixture(
            priceDataset.batch,
            replacing ? createOIMEntityWriterReplacing() : createOIMEntityWriterInPlace(),
        );
        const names = priceDataset.groupNames();
        const { indexService, indexStoreSlot } = groupIndexOf(fixture, names);
        const slotContentService = indexService.slotContentService;
        const readBucket = indexService.getSlotByKey(indexStoreSlot, names[READ_GROUP_AT]);
        const { byGroup, readSet } = groupedFloorOf(fixture, names);
        assertSameReadGroup(slotContentService.getBucketMemberSlots(readBucket), readSet);
        const patch: TGroupPatch = { group: '' };
        let shift = 0;
        return {
            ours: {
                reset: () => undefined,
                run: times => {
                    const slots = fixture.slots;
                    const entitySlotContentService = fixture.entityService.slotContentService;
                    const db = fixture.db;
                    const mask = names.length - 1;
                    let done = 0;
                    while (done < times) {
                        const upTo = Math.min(slots.length, times - done);
                        shift++;
                        for (let i = 0; i < upTo; i++) {
                            patch.group = names[(i + shift) & mask];
                            entitySlotContentService.updateEntity(slots[i], patch);
                        }
                        db.flush();
                        for (const member of slotContentService.getBucketMemberSlots(readBucket)) priceSink.ours = member.entity;
                        done += upTo;
                    }
                },
            },
            floor: {
                reset: () => undefined,
                run: groupedFloorRun(fixture.held, names, byGroup, readSet),
            },
        };
    },
});

const groupedManualPositionalPair: TPricePair = {
    id: 'sweep.grouped-column.manual-positional',
    path: EPricePath.PerWrite,
    ours: 'entityService.slotContentService.updateEntity(slot, { group }), slotContentService.removeBucketMemberSlotAt + insertBucketMemberSlotAt at the end, then slotContentService.getBucketMemberSlots(bucket)',
    floor: 'move the row between two Sets, write the column, iterate one Set',
    caveat: joined(
        'THE ARM IS THE POSITIONAL DOOR, IN PLACE. ',
        MANUAL_MEMBERSHIP_CAVEAT,
        'THIS ARM TAKES THE POSITIONAL DOOR on an `OIMSlotContentBucketServiceArrayDriven`, so ',
        'the caller owns the order: `getBucketMemberSlotPosition` finds the member in the bucket it is leaving — ',
        'an `indexOf` over that group — `removeBucketMemberSlotAt` splices it out, and `insertBucketMemberSlotAt` at ',
        '`getBucketMemberSlotCount` appends it to the one it joins. It is O(members of the group being left) ',
        'against the floor\'s hash, and that is the largest single term on this row. ',
        GROUPED_FLOOR_CAVEAT,
    ),
    build: () => {
        const slotContentService = new OIMSlotContentBucketServiceArrayDriven<TOIMEntitySlot<TPriceDataRow>>();
        const { world, bucketService, bucketStoreSlot } = groupedManualWorld<TOrderedGroupSlots>(slotContentService);
        assertSameReadGroup(slotContentService.getBucketMemberSlots(world.readBucket), world.readSet);
        const patch: TGroupPatch = { group: '' };
        let shift = 0;
        return {
            ours: {
                reset: () => undefined,
                run: times => {
                    const slots = world.fixture.slots;
                    const entitySlotContentService = world.fixture.entityService.slotContentService;
                    const db = world.fixture.db;
                    const names = world.names;
                    const mask = names.length - 1;
                    let done = 0;
                    while (done < times) {
                        const upTo = Math.min(slots.length, times - done);
                        shift++;
                        for (let i = 0; i < upTo; i++) {
                            const slot = slots[i];
                            const stored = slot.entity;
                            if (stored === undefined) continue;
                            const from = bucketService.getSlotByKey(bucketStoreSlot, stored.group);
                            const next = names[(i + shift) & mask];
                            patch.group = next;
                            entitySlotContentService.updateEntity(slot, patch);
                            const to = bucketService.getSlotByKey(bucketStoreSlot, next);
                            slotContentService.removeBucketMemberSlotAt(
                                from, slotContentService.getBucketMemberSlotPosition(from, slot),
                            );
                            slotContentService.insertBucketMemberSlotAt(
                                to, slotContentService.getBucketMemberSlotCount(to), slot,
                            );
                        }
                        db.flush();
                        for (const member of slotContentService.getBucketMemberSlots(world.readBucket)) {
                            priceSink.ours = member.entity;
                        }
                        done += upTo;
                    }
                },
            },
            floor: {
                reset: () => undefined,
                run: groupedFloorRun(world.fixture.held, world.names, world.byGroup, world.readSet),
            },
        };
    },
};

const groupedManualSetMembersPair: TPricePair = {
    id: 'sweep.grouped-column.manual-set-members',
    path: EPricePath.PerWrite,
    ours: 'entityService.slotContentService.updateEntity(slot, { group }), slotContentService.writeBucketMemberSlots on both buckets, then slotContentService.getBucketMemberSlots(bucket)',
    floor: 'move the row between two Sets, write the column, iterate one Set',
    caveat: joined(
        'THE ARM IS THE WHOLE-BUCKET DOOR, IN PLACE. ',
        MANUAL_MEMBERSHIP_CAVEAT,
        '`writeBucketMemberSlots` is handed each bucket\'s new membership, asks the bucket content service whether the ' +
        'bucket already holds exactly those slots, and — since it does not — replaces the set and ' +
        'reports who arrived and who left. Moving one row is therefore TWO FULL BUCKET REWRITES, ' +
        'plus the caller\'s own `indexOf` and `splice` on the array it keeps beside them, on ' +
        'groups of a hundred and twenty-eight. THIS IS THE DOOR A RE-HYDRATED SERVER LIST USES and ' +
        'pricing it on a one-row move is pricing it on its worst task; the distance between it and ' +
        'the other arms is what the finer doors are worth. ',
        GROUPED_FLOOR_CAVEAT,
    ),
    build: () => {
        const slotContentService = new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TPriceDataRow>>();
        const { world, bucketService, bucketStoreSlot } = groupedManualWorld<TUnorderedGroupSlots>(slotContentService);
        assertSameReadGroup(slotContentService.getBucketMemberSlots(world.readBucket), world.readSet);
        const patch: TGroupPatch = { group: '' };
        let shift = 0;
        return {
            ours: {
                reset: () => undefined,
                run: times => {
                    const slots = world.fixture.slots;
                    const entitySlotContentService = world.fixture.entityService.slotContentService;
                    const db = world.fixture.db;
                    const names = world.names;
                    const membersOf = world.membersOf;
                    const mask = names.length - 1;
                    let done = 0;
                    while (done < times) {
                        const upTo = Math.min(slots.length, times - done);
                        shift++;
                        for (let i = 0; i < upTo; i++) {
                            const slot = slots[i];
                            const stored = slot.entity;
                            if (stored === undefined) continue;
                            const was = stored.group;
                            const next = names[(i + shift) & mask];
                            patch.group = next;
                            entitySlotContentService.updateEntity(slot, patch);
                            const left = membersOf.get(was);
                            const arrivedAt = membersOf.get(next);
                            if (left === undefined || arrivedAt === undefined) continue;
                            const at = left.indexOf(slot);
                            if (at >= 0) left.splice(at, 1);
                            arrivedAt.push(slot);
                            slotContentService.writeBucketMemberSlots(bucketService.getSlotByKey(bucketStoreSlot, was), left);
                            slotContentService.writeBucketMemberSlots(bucketService.getSlotByKey(bucketStoreSlot, next), arrivedAt);
                        }
                        db.flush();
                        for (const member of slotContentService.getBucketMemberSlots(world.readBucket)) {
                            priceSink.ours = member.entity;
                        }
                        done += upTo;
                    }
                },
            },
            floor: {
                reset: () => undefined,
                run: groupedFloorRun(world.fixture.held, world.names, world.byGroup, world.readSet),
            },
        };
    },
};

/**
 * TASK 3 — RE-SEND A ROW UNCHANGED, WHICH IS WHAT A SERVER POLL DOES.
 *
 * WHAT VARIES: the WRITE STRATEGY, and WHETHER AN INDEX LISTENS — does carrying
 * one tax a poll? See `README.md#pricepairssweep` for where the floor does less.
 */
const pollUnchangedPair = (
    id: string, arm: string, replacing: boolean, indexed: boolean,
): TPricePair => ({
    id,
    path: EPricePath.PerWrite,
    ours: `entityService.slotContentService.upsertEntity(entityStoreSlot, row) with the values the row already holds — ${arm}`,
    floor: 'map.get(id), then compare each column and assign only what moved',
    caveat:
        `THE ARM IS ${arm.toUpperCase()}. NOTHING MOVES ON EITHER SIDE, which is the point of the ` +
        'task: `upsertEntity` finds the key populated, `insertEntity` hands it to `writeEntity`, ' +
        'whose writer `putEntity` patches the columns the row carries, walks the stored row for columns it does not carry ' +
        '(there are none), is told nothing moved, and returns before it marks anything or tells any listener. The ' +
        'floor gets the row and compares. ' +
        'THIS IS THE FAIREST FLOOR IN THE SUITE: a hand-written store that wanted to wake anybody ' +
        'would need the same decision this write makes. WHERE THE FLOOR STILL DOES LESS, both ' +
        'pushing our ratio UP: it compares four columns named at compile time where `patchEntity` ' +
        'enumerates whatever the patch carries, and it never looks for columns the stored row has ' +
        'that the new one does not, where `putEntity` walks the stored row with a ' +
        '`hasOwnProperty` per column first. On the indexed arm ours also opens and closes a change window per row; ' +
        'the un-indexed arm takes the flat path and opens none. ' +
        'THE HASH IS ON BOTH SIDES: ours calls `keyOf` and the store\'s `get`, the floor calls ' +
        '`byId.get`. THE FLUSH IS INSIDE OUR NUMBER and closes a batch that queued nothing. ' +
        `${indexed
            ? 'AN INDEX LISTENS AND IS NEVER REACHED. This arm carries one `OIMIndexService` store slot over `group` ' +
              'with every bucket held, so the collection has a content-change listener; a write ' +
              'that lands nothing never calls it. [FIGURE STATED IN ADVANCE] Expect this arm to be ' +
              'indistinguishable from the un-indexed one within both rows\' noise. The floor keeps ' +
              'no groups on this arm either, so the index is charged entirely to us. '
            : 'NO INDEX IS BUILT on this arm, which is the baseline the indexed arm is read ' +
              'against. '}` +
        'THE SAME SOURCE ROWS ARE RE-SENT EVERY PASS, so no pass can drift into being a real write.',
    build: () => {
        const fixture = priceFixture(
            priceDataset.batch,
            replacing ? createOIMEntityWriterReplacing() : createOIMEntityWriterInPlace(),
        );
        if (indexed) groupIndexOf(fixture, priceDataset.groupNames());
        return {
            ours: {
                reset: () => undefined,
                run: times => {
                    const rows = fixture.rows;
                    const slotContentService = fixture.entityService.slotContentService;
                    const entityStoreSlot = fixture.entityStoreSlot;
                    const db = fixture.db;
                    let done = 0;
                    while (done < times) {
                        const upTo = Math.min(rows.length, times - done);
                        for (let i = 0; i < upTo; i++) slotContentService.upsertEntity(entityStoreSlot, rows[i]);
                        db.flush();
                        done += upTo;
                    }
                },
            },
            floor: {
                reset: () => undefined,
                run: times => {
                    const rows = fixture.rows;
                    const byId = fixture.byId;
                    let done = 0;
                    while (done < times) {
                        const upTo = Math.min(rows.length, times - done);
                        let changed = false;
                        for (let i = 0; i < upTo; i++) {
                            const next = rows[i];
                            const row = byId.get(next.id);
                            if (row === undefined) continue;
                            if (row.group !== next.group) { row.group = next.group; changed = true; }
                            if (row.rank !== next.rank) { row.rank = next.rank; changed = true; }
                            if (row.title !== next.title) { row.title = next.title; changed = true; }
                            if (row.note !== next.note) { row.note = next.note; changed = true; }
                        }
                        priceSink.flag = changed;
                        done += upTo;
                    }
                },
            },
        };
    },
});

export const pricePairsSweep: readonly TPricePair[] = [
    insertThenReadPair('sweep.insert-then-read.in-place-default', 'the shipped default, in place', false),
    insertThenReadPair('sweep.insert-then-read.replacing', 'createOIMEntityWriterReplacing', true),

    groupedIndexPair('sweep.grouped-column.index-in-place', 'the auto-index, in place', false),
    groupedIndexPair('sweep.grouped-column.index-replacing', 'the auto-index, replacing', true),
    groupedManualSetMembersPair,
    groupedManualPositionalPair,

    pollUnchangedPair('sweep.poll-unchanged.in-place-default', 'the shipped default, no index', false, false),
    pollUnchangedPair('sweep.poll-unchanged.replacing', 'createOIMEntityWriterReplacing, no index', true, false),
    pollUnchangedPair('sweep.poll-unchanged.one-index-declared', 'the shipped default, one index', false, true),
];
