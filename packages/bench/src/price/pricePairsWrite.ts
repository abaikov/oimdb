import {
    OIMDB,
    OIMSlotContentBucketServiceSetDriven,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
    createOIMIndexService,
    oimInsertEntityWithoutCopy,
} from '../../../core/src/index';
import type {
    IOIMEntityWriter,
    TOIMEntitySlot,
    TOIMStoreKey,
} from '../../../core/src/index';
import { EPricePath } from './EPricePath';
import { priceDataset } from './priceDataset';
import { priceFixture } from './priceFixture';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';
import { priceRoundSide } from './priceRoundSide';
import { priceCloseTrackedFrame, priceQueueOnce, priceTrackedFrame } from './priceTrackedFrame';
import type { TPriceTrackedFrame } from './priceTrackedFrame';

const strictEquality = (a: unknown, b: unknown): boolean => a === b;

const inertWriteSide: TPriceSide = { reset: () => undefined, run: () => undefined };

/**
 * A row of the hand-written store that TRACKS its own changes — the floor for
 * the two rows where a bare `Map` is not an honest comparison, because a bare
 * `Map` cannot wake anybody. A comparator gate, a per-frame stamp and a queue.
 *
 * BOTH ROWS ARE PRINTED. The bare one is the floor a reader imagines, the
 * tracked one is the floor that does the same job; the truth is between them,
 * and printing one would be a choice about which way to lean.
 */
type TTrackedRow = TPriceDataRow & { changedInFrame: number };

/** The hand-written store the tracked floors write into. */
type TTrackedStore = {
    readonly byId: Map<string, TTrackedRow>;
    readonly rows: TTrackedRow[];
    /** What a frame would deliver. Emptied when the frame closes. */
    readonly queued: TTrackedRow[];
    frame: number;
};

const makeTrackedStore = (): TTrackedStore => ({
    byId: new Map<string, TTrackedRow>(),
    rows: [],
    queued: [],
    frame: 0,
});

const TITLE_COLUMN: readonly 'title'[] = ['title'];

type TPriceFixture = ReturnType<typeof priceFixture>;
type TFixtureTitleRound = (fixture: TPriceFixture, upTo: number, title: string) => void;

const fixtureTitleRoundSide = (fixture: TPriceFixture, round: TFixtureTitleRound): TPriceSide =>
    priceRoundSide(fixture.rows.length, (upTo, index) => round(fixture, upTo, priceDataset.titles[index & 7]), () => fixture.db.flush());

const mapStoreByKeyRound: TFixtureTitleRound = (fixture, upTo, title) => {
    const rows = fixture.rows;
    const byId = fixture.byId;
    for (let i = 0; i < upTo; i++) {
        const row = byId.get(rows[i].id);
        if (row !== undefined) row.title = title;
    }
};

const columnDoorByKeyRound: TFixtureTitleRound = (fixture, upTo, title) => {
    const rows = fixture.rows;
    const entityService = fixture.entityService;
    const slotContentService = entityService.slotContentService;
    const entityStoreSlot = fixture.entityStoreSlot;
    for (let i = 0; i < upTo; i++) {
        slotContentService.updateEntityColumn(entityService.getSlotByKey(entityStoreSlot, rows[i].id), 'title', title);
    }
};

const inPlaceAndMarkByKeyRound: TFixtureTitleRound = (fixture, upTo, title) => {
    const rows = fixture.rows;
    const entityService = fixture.entityService;
    const slotContentService = entityService.slotContentService;
    const entityStoreSlot = fixture.entityStoreSlot;
    for (let i = 0; i < upTo; i++) {
        const slot = entityService.getSlotByKey(entityStoreSlot, rows[i].id);
        const entity = slot.entity;
        if (entity === undefined) continue;
        entity.title = title;
        slotContentService.markEntityChanged(slot, TITLE_COLUMN);
    }
};

const byKeySides = (oursRound: TFixtureTitleRound): { ours: TPriceSide; floor: TPriceSide } => {
    const fixture = priceFixture(priceDataset.batch);
    return { ours: fixtureTitleRoundSide(fixture, oursRound), floor: fixtureTitleRoundSide(fixture, mapStoreByKeyRound) };
};

type TTrackedStoreState = {
    readonly fixture: TPriceFixture;
    readonly entities: TPriceDataRow[];
    readonly trackedFrame: TPriceTrackedFrame;
};
type TTrackedStoreRound = (state: TTrackedStoreState, upTo: number, title: string) => void;

const trackedStoreRoundSide = (
    state: TTrackedStoreState,
    round: TTrackedStoreRound,
    close: (state: TTrackedStoreState) => void,
): TPriceSide =>
    priceRoundSide(state.entities.length, (upTo, index) => round(state, upTo, priceDataset.titles[index & 7]), () => close(state));

const trackedStoreFloorRound: TTrackedStoreRound = (state, upTo, title) => {
    const entities = state.entities;
    const trackedFrame = state.trackedFrame;
    for (let i = 0; i < upTo; i++) {
        const entity = entities[i];
        if (entity.title === title) continue;
        entity.title = title;
        priceQueueOnce(trackedFrame, i);
    }
};

const flushTrackedStoreChannel = (state: TTrackedStoreState): void => { state.fixture.db.flush(); };
const closeTrackedStoreFrame = (state: TTrackedStoreState): void => { priceCloseTrackedFrame(state.trackedFrame); };

const trackedStorePatch: { title: string } = { title: '' };

const patchDoorTrackedRound: TTrackedStoreRound = (state, upTo, title) => {
    const slots = state.fixture.slots;
    const slotContentService = state.fixture.entityService.slotContentService;
    trackedStorePatch.title = title;
    for (let i = 0; i < upTo; i++) slotContentService.updateEntity(slots[i], trackedStorePatch);
};

const columnDoorTrackedRound: TTrackedStoreRound = (state, upTo, title) => {
    const slots = state.fixture.slots;
    const slotContentService = state.fixture.entityService.slotContentService;
    for (let i = 0; i < upTo; i++) slotContentService.updateEntityColumn(slots[i], 'title', title);
};

const trackedStoreSides = (oursRound: TTrackedStoreRound): { ours: TPriceSide; floor: TPriceSide } => {
    const fixture = priceFixture(priceDataset.batch);
    const entities = fixture.rows.map(entity => ({ ...entity }));
    const state: TTrackedStoreState = { fixture, entities, trackedFrame: priceTrackedFrame(entities.length) };
    return {
        ours: trackedStoreRoundSide(state, oursRound, flushTrackedStoreChannel),
        floor: trackedStoreRoundSide(state, trackedStoreFloorRound, closeTrackedStoreFrame),
    };
};

/**
 * EVERY PRICE THAT IS PAID WHEN SOMETHING CHANGES.
 *
 * The two hardest facts about this group, stated once rather than in every
 * caveat below:
 *
 * A `Map`-KEYED FLOOR PAYS A HASH THAT OUR IDENTITY PATH DOES NOT. Where our
 * side takes a slot and the floor takes a key, part of the floor's time is a
 * lookup we already paid for outside the clock. That pushes our ratio DOWN — it
 * flatters us — and the `updateByKey` row shows the same comparison with the
 * lookup on BOTH sides.
 *
 * OUR WRITE ADDITIONALLY MARKS A CHANNEL AND MAY ROUTE TO INDEXES. Even with no
 * index registered, `updateEntity` stamps the slot's frame number and the
 * collection's, tests the row for subscribed columns and the population for
 * listening indexes, and records what moved.
 * A field store does none of that and cannot. That pushes our ratio UP, and is
 * the honest half of the price — the tracked floors above are how much of it is
 * genuinely ours rather than genuinely the job's.
 */
export const pricePairsWrite: readonly TPricePair[] = [
    {
        id: 'upsert.insert-vs-map-set',
        path: EPricePath.PerRowPerWrite,
        ours: 'slotContentService.upsertEntity(entityStoreSlot, row) — a key this population has never seen',
        floor: 'map.set(row.id, { ...row })',
        caveat:
            'THE FLOOR DOES LESS, AND KNOWABLY SO. Ours mints an identity (a slot and an entry in ' +
            'the identity store — there is no per-index `links` cell, so a row carries nothing ' +
            'per index at all), copies ' +
            'the row, walks the ' +
            "copy's own names to refuse the ones a row may not carry, stamps the slot, stamps the " +
            'collection and records the row on the presence channel so every index and every ' +
            'whole-population reader hears about it. The floor allocates one copy and hashes one ' +
            'string. Direction: this inflates our ratio, and no three-line floor can close the gap ' +
            '— what the extra buys is that anything subscribed to this population, or indexing it, ' +
            'is woken by this insert. The tracked row below is the closest a few lines get. ' +
            'Both sides abandon their container between passes and both are collected outside the ' +
            'clock, so the GC of what each allocated is NOT inside either number; our allocation ' +
            'per row is roughly three objects to the floor\'s one, and that debt is paid later.',
        build: () => {
            const rows = priceDataset.makeRows(priceDataset.batch);
            const db = new OIMDB();
            const entityService = createOIMEntityService<TPriceDataRow>(db, { keyOf: row => row.id });
            const slotContentService = entityService.slotContentService;
            let entityStoreSlot = entityService.createStoreSlot(db);
            let map = new Map<string, TPriceDataRow>();
            return {
                ours: {
                    operationsPerPass: rows.length,
                    // A pass fills the population, so it has to be empty again:
                    // a second pass over the same collection would take the
                    // update branch and price a different call.
                    reset: () => {
                        entityStoreSlot = entityService.createStoreSlot(db);
                    },
                    run: times => {
                        for (let i = 0; i < times; i++) slotContentService.upsertEntity(entityStoreSlot, rows[i]);
                        // The frame the batch closes with — see `priceDataset.batch`.
                        db.flush();
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
                        priceSink.number = map.size;
                    },
                },
            };
        },
    },
    {
        id: 'upsert.insert-by-reference-vs-map-set',
        path: EPricePath.PerRowPerWrite,
        ours: 'slotContentService.upsertEntity(entityStoreSlot, row) with the entity stored without a copy (oimInsertEntityWithoutCopy) — a key this population has never seen',
        floor: 'if (map.get(row.id) === undefined) map.set(row.id, row)',
        caveat:
            'Neither side copies the row: both store the object they were handed, and both probe the key before '
            + 'filing it, as an upsert must. Ours still mints an identity, files it in the identity store, stamps it on the channel and runs the insert path of '
            + 'writeContentByKey; the floor hashes one string. A pass fills an empty world rebuilt outside the clock, '
            + 'and ours closes it with db.flush().',
        build: () => {
            const rows = priceDataset.makeRows(priceDataset.batch);
            const db = new OIMDB();
            const entityWriter = createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithoutCopy });
            const entityService = createOIMEntityService<TPriceDataRow>(db, { keyOf: row => row.id, entityWriter });
            const slotContentService = entityService.slotContentService;
            let entityStoreSlot = entityService.createStoreSlot(db);
            let map = new Map<string, TPriceDataRow>();
            return {
                ours: {
                    operationsPerPass: rows.length,
                    reset: () => {
                        entityStoreSlot = entityService.createStoreSlot(db);
                    },
                    run: times => {
                        for (let i = 0; i < times; i++) slotContentService.upsertEntity(entityStoreSlot, rows[i]);
                        db.flush();
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
                            if (map.get(row.id) === undefined) map.set(row.id, row);
                        }
                        priceSink.number = map.size;
                    },
                },
            };
        },
    },

    {
        id: 'upsert.insert-vs-tracked-store',
        path: EPricePath.PerRowPerWrite,
        ours: 'slotContentService.upsertEntity(entityStoreSlot, row) — a key this population has never seen',
        floor: 'map.set(id, copy) into a store that also queues what changed',
        caveat:
            'THE FAIRER FLOOR, and it is still not equal. The floor now keeps a per-row frame ' +
            'stamp and a queue, so something downstream could be told — which is the job our ' +
            'insert is doing and the bare Map is not. What the floor still does not have: an ' +
            'identity that outlives the value, a per-index cell on every row, a presence channel ' +
            'that tells indexes and whole-population readers separately from the row itself, or ' +
            'any means of recording WHICH columns moved. Direction: still inflates our ratio, by ' +
            'less than the bare-Map row above. The pair of ratios brackets the truth; neither ' +
            'number alone is it.',
        build: () => {
            const rows = priceDataset.makeRows(priceDataset.batch);
            const db = new OIMDB();
            const entityService = createOIMEntityService<TPriceDataRow>(db, { keyOf: row => row.id });
            const slotContentService = entityService.slotContentService;
            let entityStoreSlot = entityService.createStoreSlot(db);
            let store = makeTrackedStore();
            return {
                ours: {
                    operationsPerPass: rows.length,
                    reset: () => {
                        entityStoreSlot = entityService.createStoreSlot(db);
                    },
                    run: times => {
                        for (let i = 0; i < times; i++) slotContentService.upsertEntity(entityStoreSlot, rows[i]);
                        db.flush();
                    },
                },
                floor: {
                    operationsPerPass: rows.length,
                    reset: () => {
                        store = makeTrackedStore();
                    },
                    run: times => {
                        const byId = store.byId;
                        const queued = store.queued;
                        const frame = store.frame;
                        for (let i = 0; i < times; i++) {
                            const row = rows[i];
                            const copy: TTrackedRow = { ...row, changedInFrame: frame };
                            byId.set(copy.id, copy);
                            queued.push(copy);
                        }
                        // Closing the frame: what a delivery would have walked,
                        // dropped, as ours drops its pending list.
                        priceSink.number = queued.length;
                        queued.length = 0;
                        store.frame = frame + 1;
                    },
                },
            };
        },
    },

    {
        id: 'update.column-vs-field-store',
        path: EPricePath.PerWrite,
        ours: 'slotContentService.updateEntity(slot, patch) — one column, no index reads it',
        floor: 'row.title = value',
        caveat:
            'THE LOOKUP IS ON NEITHER SIDE — ours holds the slot, the floor holds the object, both ' +
            'resolved outside the clock. That is the comparison this row is for. What ours does ' +
            'that a store cannot: it walks the patch, refuses names a row may not carry, gates ' +
            'each column on the default equality, builds the list of what moved, stamps the slot ' +
            'and the collection, and tests the row\'s column store and the population\'s listener ' +
            'list so a column subscriber or an index could be told. THAT DEFAULT IS SAMEVALUEZERO AND WAS AN INLINE ' +
            '`===` WHEN 2026-08-20-price/write WAS RECORDED. The call was there under both — the ' +
            'predicate has always been reached through the strategy\'s captured parameter — so ' +
            'the delta is one comparison, and only on a column that moved, which is one per write ' +
            'here. `update.column-vs-the-strict-equality-default` is that delta on its own and is ' +
            'unrun; until it runs, this row\'s recorded figure is a figure for the older body. ' +
            'Direction: inflates our ratio; the tracked row below prices the part of that ' +
            'a person would have had to write anyway. The patch object is REUSED rather than ' +
            'written as a literal per call — a caller who writes { title } inline pays one more ' +
            'allocation per write than this row charges us for. The batch closes with one flush ' +
            'per eight thousand writes, which is why every write in it takes the marking path ' +
            'rather than the already-stamped early return. ' +
            'THE REUSED PATCH IS ALSO WHAT STOPS THIS ROW BEING SUBTRACTED FROM ' +
            '`update.unchanged-vs-field-store`, and that subtraction is the only way anyone has to ' +
            'split this number into the walk that decides and the tail that reports. The unchanged ' +
            'row hands `updateEntity` a DIFFERENT patch object per write and its floor reads the value ' +
            'out of that object; this row reuses one patch and its floor reads a local. Two ' +
            'differences, both on the wrong side of the subtraction. ' +
            '`update.column-vs-field-store-a-patch-per-write` is this row with the unchanged row\'s ' +
            'patch supply and the unchanged row\'s floor, and it exists so the split can be taken ' +
            'arm for arm instead of across two bodies that differ in three ways.',
        build: () => {
            const fixture = priceFixture(priceDataset.batch);
            const patch: { title: string } = { title: '' };
            let round = 0;
            let floorRound = 0;
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const slots = fixture.slots;
                        const slotContentService = fixture.entityService.slotContentService;
                        const db = fixture.db;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(slots.length, times - done);
                            patch.title = priceDataset.titles[round++ & 7];
                            for (let i = 0; i < upTo; i++) slotContentService.updateEntity(slots[i], patch);
                            db.flush();
                            done += upTo;
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const held = fixture.held;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(held.length, times - done);
                            const title = priceDataset.titles[floorRound++ & 7];
                            for (let i = 0; i < upTo; i++) held[i].title = title;
                            done += upTo;
                        }
                    },
                },
            };
        },
    },

    {
        id: 'update.column-vs-field-store-a-patch-per-write',
        path: EPricePath.PerWrite,
        ours: 'slotContentService.updateEntity(slot, patch) — one column, one patch object per row',
        floor: 'row.title = patch.title',
        caveat:
            'THE ROW ABOVE, ARM FOR ARM WITH `update.unchanged-vs-field-store`, AND THAT IS ITS ' +
            'WHOLE REASON. The only handle anybody has on how the row above\'s gap divides is the ' +
            'unchanged row, which times the same call up to the point where ' +
            'the comparator finds every column equal and returns before marking anything. ' +
            'Subtracting one from the other would give the walk and the tail — except that the two ' +
            'bodies differ in three ways at once: the row above REUSES one patch object where the ' +
            'unchanged row allocates eight thousand and hands a different one to every write, and ' +
            'its floor stores a local where the unchanged row\'s floor reads the value off the ' +
            'patch first. A fresh patch per write is a fresh receiver for `isPlain` and for the ' +
            '`for…in`, and the extra load is a real instruction on the floor. Both differences ' +
            'push the same way and neither is the thing being priced. ' +
            'THIS ROW REMOVES ALL THREE. The patch supply is the unchanged row\'s — one object per ' +
            'row, built outside the clock — and the floor is the unchanged row\'s floor to the ' +
            'character. What is left between this row\'s `ours` and the unchanged row\'s `ours` is ' +
            'exactly what a write that MOVES a column does and a write that moves nothing does ' +
            'not: one store into the entity, the moved-names array and its push, two ' +
            '`OIMChannelService.write` calls — the row and the population — one `columnSlotStoreService.get` ' +
            'probe for the moved column inside `OIMColumnOwner.markColumnsChanged`, and the frame ' +
            'that closes the ' +
            'batch. ' +
            'EIGHT PATCH ARRAYS, ONE PER TITLE, so this row moves the column on exactly the ' +
            'writes the row above moves it on. The title advances by one of eight per batch and ' +
            'every row in a batch is written with the same title, which is the row above\'s ' +
            'rotation with the shared object unpicked into one object per row. ' +
            'THE FLUSH IS ON THIS SIDE OF THE SUBTRACTION AND NOT ON THE UNCHANGED ROW\'S: nothing ' +
            'is marked there, so no frame is asked for. `flush.empty-vs-noop` ' +
            '[2026-08-20-price/frame] prices a frame with nothing queued, and over eight thousand ' +
            'writes it is four thousandths of a nanosecond each — named here because it belongs ' +
            'to the difference, not because it can be seen in it.',
        build: () => {
            const fixture = priceFixture(priceDataset.batch);
            // One patch object per row per title, built here. The object must
            // not be reused AND must not be allocated inside the clock — that
            // would charge ours an allocation the floor does not make.
            const patchesByTitle: { title: string }[][] = [];
            for (let t = 0; t < priceDataset.titles.length; t++) {
                const patches: { title: string }[] = [];
                for (let i = 0; i < fixture.rows.length; i++) {
                    patches.push({ title: priceDataset.titles[t] });
                }
                patchesByTitle.push(patches);
            }
            let round = 0;
            let floorRound = 0;
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const slots = fixture.slots;
                        const slotContentService = fixture.entityService.slotContentService;
                        const db = fixture.db;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(slots.length, times - done);
                            const patches = patchesByTitle[round++ & 7];
                            for (let i = 0; i < upTo; i++) slotContentService.updateEntity(slots[i], patches[i]);
                            db.flush();
                            done += upTo;
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const held = fixture.held;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(held.length, times - done);
                            const patches = patchesByTitle[floorRound++ & 7];
                            for (let i = 0; i < upTo; i++) held[i].title = patches[i].title;
                            done += upTo;
                        }
                    },
                },
            };
        },
    },

    {
        id: 'update.column-vs-field-store-and-the-listener-guards',
        path: EPricePath.PerWrite,
        ours: 'slotContentService.updateEntity(slot, patch) — one column, no index reads it',
        floor: 'test the row for a column store and the population for listeners, then row.title = value',
        caveat:
            'THE TWO "IS ANYBODY LISTENING" GUARDS, PUT ON THE FLOOR. A write that moves a column ' +
            'asks two questions before it can skip the routing: ' +
            '`OIMSlotContentEntityService.isOnFastPath` tests `entitySlot.columnSlotStore !== ' +
            'undefined` (no column of this row was ever subscribed to), and ' +
            'the content change listener check reads `slot.storeSlot` and then that store slot\'s ' +
            '`contentChangeListeners` and tests `length !== 0` (no index hears this ' +
            'population); isOnFastPath also reads updatesEmptinessOnColumnWrite, which the floor does not. Both hold on every row of this fixture. Inside ' +
            '`update.column-vs-field-store` they are two operations among thirty and nothing ' +
            'separates them; here the floor makes the identical two tests on an identically empty ' +
            'state, so THE ITEM IS THE DIFFERENCE BETWEEN THAT ROW\'S GAP AND THIS ROW\'S GAP. ' +
            'OUR ARM IS THAT ROW\'S ARM TO THE CHARACTER — the same fixture, the same reused ' +
            'patch, the same rotation of eight titles, the same flush per eight thousand writes. ' +
            'OPERATION COUNT, THE DIFFERENCE ONLY: per row, one field load and one `undefined` compare ' +
            'for the column store, one load of the row\'s store-slot pointer and one `undefined` compare, ' +
            'one load of that store slot\'s listeners array and one `undefined` compare, one length load ' +
            'and one compare. Expected inside the noise floor.',
        build: () => {
            const fixture = priceFixture(priceDataset.batch);
            const patch: { title: string } = { title: '' };
            const storeSlot: { contentChangeListeners: unknown[] | undefined } = { contentChangeListeners: [] };
            const columnStores: {
                columnSlotStore: unknown;
                storeSlot: { contentChangeListeners: unknown[] | undefined } | undefined;
            }[] = [];
            for (let i = 0; i < fixture.held.length; i++) columnStores.push({ columnSlotStore: undefined, storeSlot });
            let round = 0;
            let floorRound = 0;
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const slots = fixture.slots;
                        const slotContentService = fixture.entityService.slotContentService;
                        const db = fixture.db;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(slots.length, times - done);
                            patch.title = priceDataset.titles[round++ & 7];
                            for (let i = 0; i < upTo; i++) slotContentService.updateEntity(slots[i], patch);
                            db.flush();
                            done += upTo;
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const held = fixture.held;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(held.length, times - done);
                            const title = priceDataset.titles[floorRound++ & 7];
                            for (let i = 0; i < upTo; i++) {
                                const columnStore = columnStores[i];
                                if (columnStore.columnSlotStore !== undefined) continue;
                                const rowStoreSlot = columnStore.storeSlot;
                                if (rowStoreSlot === undefined) continue;
                                const contentChangeListeners = rowStoreSlot.contentChangeListeners;
                                if (contentChangeListeners !== undefined && contentChangeListeners.length !== 0) continue;
                                held[i].title = title;
                            }
                            done += upTo;
                        }
                    },
                },
            };
        },
    },

    {
        id: 'update.column-vs-the-strict-equality-default',
        path: EPricePath.PerWrite,
        ours: 'slotContentService.updateEntity(slot, patch) — the shipped default, which is SameValueZero',
        floor: 'the same update on a population built with createOIMEntityWriterInPlace({ sameValueGuard: (a, b) => a === b })',
        caveat:
            'THE ONE ITEM OF THE WRITE PATH THAT IS IN NO RECORDED NUMBER, BECAUSE IT POSTDATES ' +
            'THEM ALL. Every write row in `2026-08-20-price/write` was measured against a ' +
            'default equality that was an inline `a === b`. The default is `oimSameValueZeroGuard` now — ' +
            '`a === b || (a !== a && b !== b)` — and what that costs is not a call, since the ' +
            'predicate was already reached through the strategy\'s captured parameter on both ' +
            'designs. IT IS ONE COMPARISON, AND ONLY ON A COLUMN THAT MOVED: an equal column ' +
            'settles on the first clause and short-circuits, byte for byte what was there before, ' +
            'while a moved column then evaluates `a !== a` and short-circuits on that. ' +
            'BOTH ARMS ARE `entityService.updateEntity` ON THE SAME FIXTURE, one column moving per write, ' +
            'so the difference is that one comparison per write and the state of one inline ' +
            'cache. The floor\'s predicate is a different function object of the same shape as ' +
            'the shipped `oimSameValueZeroGuard` — module-level, monomorphic, one expression, no ' +
            'closure. ' +
            'THIS PAIR DECLARES `isolate` AND IT MUST. `changedColumns` is ONE compiled body ' +
            'however many writers the factory builds, so `sameValueGuard(entity[name], source[name])` ' +
            'inside it is one call site for the whole process. Building both arms in one process ' +
            'would make that site see two functions and would spoil BOTH of them equally, which ' +
            'is a measurement of nothing. The same reasoning, and the same declaration, is on ' +
            '`alt.equality-predicate.shared-default-vs-inlined.with-a-second-comparator-present`, ' +
            'where making the site polymorphic is the subject rather than the hazard. ' +
            'DO NOT BORROW `alt.equality-predicate.shared-default-vs-inlined.unchanged-resend` ' +
            'FOR THIS. That row prices the predicate\'s CALL FRAME against a walk with no ' +
            'parameter at all, on an UNCHANGED re-send where every column settles on the first ' +
            'clause — so the second comparison this row exists for never executes in it. The two ' +
            'rows are about the parameter and about the body, and they do not substitute. ' +
            'ONE COMPARISON PER WRITE IS BELOW WHAT THIS INSTRUMENT RESOLVED ON ITS OWN SCALE ' +
            'CONTROL, and that is the expected reading, stated in advance so a run can refute it: ' +
            'this pair should come back inside the noise floor. If it does, the argument in ' +
            '`oimSameValueZeroGuard.ts` — that the new answer is free on the hot path and spends only ' +
            'where it saves a report, a reindex and a wake-up — holds at the write. If it does ' +
            'NOT, there is a real cost on the hottest path in the engine and the `NaN` ' +
            'defect was bought with something.',
        isolate: true,
        build: wanted => {
            const side = (strategy: IOIMEntityWriter | undefined): TPriceSide => {
                const rows = priceDataset.makeRows(priceDataset.batch);
                const db = new OIMDB();
                const entityService = createOIMEntityService<TPriceDataRow>(db, { keyOf: row => row.id, entityWriter: strategy });
                const slotContentService = entityService.slotContentService;
                const entityStoreSlot = entityService.createStoreSlot(db);
                const slots = slotContentService.upsertEntities(entityStoreSlot, rows);
                db.flush();
                const patch: { title: string } = { title: '' };
                let round = 0;
                return {
                    reset: () => undefined,
                    run: times => {
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(slots.length, times - done);
                            patch.title = priceDataset.titles[round++ & 7];
                            for (let i = 0; i < upTo; i++) slotContentService.updateEntity(slots[i], patch);
                            db.flush();
                            done += upTo;
                        }
                    },
                };
            };
            return {
                ours: wanted === 'floor' ? inertWriteSide : side(undefined),
                floor: wanted === 'ours'
                    ? inertWriteSide
                    : side(createOIMEntityWriterInPlace({ sameValueGuard: strictEquality })),
            };
        },
    },

    {
        id: 'update.column-vs-tracked-store',
        path: EPricePath.PerWrite,
        ours: 'slotContentService.updateEntity(slot, patch) — one column, no index reads it',
        floor: 'gate on !==, store, then queue the entity once per frame by a stamp kept per position',
        caveat:
            'THE FLOOR NOW DOES THE JOB. It compares before it writes, so a re-send moves nothing; ' +
            'it keeps a frame stamp per entity position so ten writes to one entity queue it once; and ' +
            'it queues the entity so a frame could deliver it. Four lines. What it still does not do: ' +
            'record WHICH columns moved (so no field-granular subscription is possible), route to ' +
            'an index, or mark the collection separately from the entity. Direction: still inflates ' +
            'our ratio, and this is the number to quote when somebody asks what the engine costs ' +
            'over doing it properly by hand.',
        build: () => trackedStoreSides(patchDoorTrackedRound),
    },

    {
        id: 'update.entity-column-vs-tracked-store',
        path: EPricePath.PerWrite,
        ours: "slotContentService.updateEntityColumn(slot,'title', value) — one column, no index reads it",
        floor: 'gate on !==, store, then queue the entity once per frame by a stamp kept per position',
        caveat:
            'The same floor as update.column-vs-tracked-store, against the column door: no patch object and no walk over it. '
            + 'Both sides hand over one value per write and queue each entity at most once per frame.',
        build: () => trackedStoreSides(columnDoorTrackedRound),
    },

    {
        id: 'update.unchanged-vs-field-store',
        path: EPricePath.PerWrite,
        ours: 'slotContentService.updateEntity(slot, patch) with the value the row already holds',
        floor: 'row.title = value — a store that always happens',
        caveat:
            'THE TWO SIDES DO OPPOSITE THINGS, ON PURPOSE. Ours walks the patch, finds every column ' +
            'equal, returns before marking anything and wakes nobody; the floor stores ' +
            'unconditionally because it has nothing to protect. So this is not "which is faster at ' +
            'the same work" — it is what the comparator gate costs when it fires, against the ' +
            'cheapest possible thing that ignores the question. No flush closes this batch, ' +
            'because nothing was marked and there is nothing for a frame to deliver: that is the ' +
            'point of the row. Direction: inflates our ratio; what the gate buys is that a screen ' +
            're-sending a server payload it already holds does not repaint.',
        build: () => {
            const fixture = priceFixture(priceDataset.batch);
            // The value every row already holds, so the in-place writer finds it equal
            // on every column of every write.
            const patches: { title: string }[] = [];
            for (let i = 0; i < fixture.rows.length; i++) {
                patches.push({ title: fixture.rows[i].title });
            }
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const slots = fixture.slots;
                        const slotContentService = fixture.entityService.slotContentService;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(slots.length, times - done);
                            for (let i = 0; i < upTo; i++) slotContentService.updateEntity(slots[i], patches[i]);
                            done += upTo;
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const held = fixture.held;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(held.length, times - done);
                            for (let i = 0; i < upTo; i++) held[i].title = patches[i].title;
                            done += upTo;
                        }
                    },
                },
            };
        },
    },

    {
        id: 'updateByKey.vs-map-get-and-store',
        path: EPricePath.PerWrite,
        ours: 'slotContentService.updateEntity(entityService.getSlotByKey(entityStoreSlot, id), patch) — there is no update-by-key door, so the timed body is the slot lookup plus updateEntity',
        floor: 'const row = map.get(id); if (row !== undefined) row.title = value',
        caveat:
            'THE ONE WRITE ROW WHERE BOTH SIDES PAY THE LOOKUP, which is what makes it the fair ' +
            'comparison for a key that arrived from outside. Ours is one map read and then the ' +
            'identity path priced two rows up; the floor is one map read and a store. The ' +
            'difference between this ratio and the update.column ratio is the price of NOT having ' +
            'held the identity — the engine\'s own source puts that at 103-132 ns against 36-51 [NO RUN BEHIND THIS FIGURE], ' +
            'and this row is the independent check on that claim.',
        build: () => {
            const patch: { title: string } = { title: '' };
            return byKeySides((fixture, upTo, title) => {
                const rows = fixture.rows;
                const entityService = fixture.entityService;
                const slotContentService = entityService.slotContentService;
                const entityStoreSlot = fixture.entityStoreSlot;
                patch.title = title;
                for (let i = 0; i < upTo; i++) {
                    slotContentService.updateEntity(entityService.getSlotByKey(entityStoreSlot, rows[i].id), patch);
                }
            });
        },
    },

    {
        id: 'updateByKey.column-vs-map-get-and-store',
        path: EPricePath.PerWrite,
        ours: "slotContentService.updateEntityColumn(entityService.getSlotByKey(entityStoreSlot, id), 'title', value)",
        floor: 'const row = map.get(id); if (row !== undefined) row.title = value',
        caveat:
            'The column door by key: no patch object and no walk over one. Both sides pay the lookup; '
            + 'ours then compares the value, writes it in place and marks the entity changed once per frame.',
        build: () => byKeySides(columnDoorByKeyRound),
    },

    {
        id: 'updateByKey.in-place-and-mark-vs-map-get-and-store',
        path: EPricePath.PerWrite,
        ours: "const slot = entityService.getSlotByKey(entityStoreSlot, id); slot.entity.title = value; slotContentService.markEntityChanged(slot, ['title'])",
        floor: 'const row = map.get(id); if (row !== undefined) row.title = value',
        caveat:
            'The hand-mutation door by key: the caller writes the stored entity itself and names the column it moved. '
            + 'Both sides pay the lookup; ours runs no comparison, and markEntityChanged, with nothing reading `title` on this fixture, takes its flat path — the channel write and releaseWrittenSlotIfUnheld — and opens no subframe.',
        build: () => byKeySides(inPlaceAndMarkByKeyRound),
    },

    {
        id: 'upsert.whole-row-vs-five-stores',
        path: EPricePath.PerWrite,
        ours: 'slotContentService.upsertEntity(entityStoreSlot, row) — a key that already carries a value',
        floor: 'copy five columns onto the stored object, one store each',
        caveat:
            'THE FLOOR CANNOT EXPRESS ONE HALF OF WHAT UPSERT PROMISES. An upsert of an existing ' +
            'key also REMOVES the columns the new value does not carry, which means walking the ' +
            'stored row to find them; here both rows carry all five columns, so that walk finds ' +
            'nothing and the floor\'s five stores are the same net effect. Ours additionally gates ' +
            'each column on the default equality, so only the column that actually moved is ' +
            'written and reported, where the floor writes all five every time. THAT DEFAULT IS ' +
            'SAMEVALUEZERO AND WAS AN INLINE `===` WHEN THIS ROW WAS RECORDED: ' +
            'the four columns this fixture does not move settle on the first clause and cost what ' +
            'they cost before, and the one that moves carries one comparison this figure never ' +
            'saw. Direction: mixed — the gate saves us four ' +
            'stores and costs us five comparisons plus a moved-list allocation, and the marking ' +
            'and routing are ours alone. Read it beside update.column: the difference between the ' +
            'two is what sending a whole row costs over sending the column that changed. ' +
            'THE STRUCTURAL CAVEAT AT THE HEAD OF THIS REPORT RUNS BACKWARDS ON THIS ROW AND ON NO ' +
            'OTHER WRITE ROW. It says a Map-keyed floor pays a hash our identity path does not, ' +
            'which flatters us. Here it is the reverse: the floor is handed `held[i]` by its index ' +
            'and never looks anything up, while ours is handed a ROW and must resolve its key — ' +
            '`keyOf` and then the store lookup inside `writeContentByKey`, a `Map.get` over eight ' +
            'thousand string keys. That lookup is inside our number and outside the floor\'s, so this row overstates ' +
            'what the design costs a caller who already holds the identity. ' +
            '`upsert.whole-row-vs-map-get-and-five-stores` is the same measurement with the lookup ' +
            'on both sides; the difference between the two rows is the hash, and neither alone is ' +
            'the price of an upsert.',
        build: () => {
            const fixture = priceFixture(priceDataset.batch);
            // Two whole-row variants, alternated, so every pass moves the title
            // column on every row. Built here, never inside the clock.
            const variants: TPriceDataRow[][] = [[], []];
            for (let v = 0; v < 2; v++) {
                for (let i = 0; i < fixture.rows.length; i++) {
                    variants[v].push({ ...fixture.rows[i], title: priceDataset.titles[v] });
                }
            }
            let round = 0;
            let floorRound = 0;
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const slotContentService = fixture.entityService.slotContentService;
                        const entityStoreSlot = fixture.entityStoreSlot;
                        const db = fixture.db;
                        let done = 0;
                        while (done < times) {
                            const source = variants[round++ & 1];
                            const upTo = Math.min(source.length, times - done);
                            for (let i = 0; i < upTo; i++) slotContentService.upsertEntity(entityStoreSlot, source[i]);
                            db.flush();
                            done += upTo;
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const held = fixture.held;
                        let done = 0;
                        while (done < times) {
                            const source = variants[floorRound++ & 1];
                            const upTo = Math.min(source.length, times - done);
                            for (let i = 0; i < upTo; i++) {
                                const stored = held[i];
                                const next = source[i];
                                stored.id = next.id;
                                stored.group = next.group;
                                stored.rank = next.rank;
                                stored.title = next.title;
                                stored.note = next.note;
                            }
                            done += upTo;
                        }
                    },
                },
            };
        },
    },

    {
        id: 'upsert.whole-row-vs-map-get-and-five-stores',
        path: EPricePath.PerWrite,
        ours: 'slotContentService.upsertEntity(entityStoreSlot, row) — a key that already carries a value',
        floor: 'const stored = map.get(row.id); then copy five columns onto it',
        caveat:
            'THE ROW ABOVE, WITH THE LOOKUP PUT BACK ON THE FLOOR. `upsertEntity` is handed a ROW and not ' +
            'an identity, so it calls `keyOf` and then `writeContentByKey` — a `Map.get` over eight ' +
            'thousand string keys — before it can write anything. The floor of ' +
            '`upsert.whole-row-vs-five-stores` is handed `held[i]` by its loop index and never ' +
            'looks anything up, which makes that row the one write row in this suite where the ' +
            'hash falls on OUR side. Here the floor resolves the same key through its own `Map` ' +
            'first, so both sides pay one hash and the row is what a person doing this job by hand ' +
            'would actually have written. ' +
            'OUR SIDE IS THE SAME BODY AS THE ROW ABOVE, deliberately and to the line: the same ' +
            'fixture, the same two whole-row variants alternating so the title moves on every row ' +
            'of every pass, the same flush per eight thousand writes. Nothing about our arm ' +
            'differs, so the two rows\' `ours` columns should agree to within the between-pair ' +
            'disagreement of this piece, and the difference between the two FLOORS is one ' +
            '`Map.get` and one `undefined` test. READ THE PAIR OF ROWS, NOT EITHER ONE: the row ' +
            'above prices an upsert against a floor that already knows where the row is, this one ' +
            'against a floor that has to find out, and a caller sits at one or the other depending ' +
            'on whether the write came from a socket payload or from something they were holding. ' +
            'WHAT IS STILL NOT EQUAL. The floor\'s five stores are unconditional where ours gates ' +
            'each column on the default equality — SameValueZero — and writes ' +
            'the one that moved; ours walks the stored row for ' +
            'columns the new value does not carry (here it finds none, so the net effect matches); ' +
            'and the marking, the presence of a `columnSlotStoreService.get` probe per moved ' +
            'column and the frame ' +
            'that closes the batch are ours alone. All three are stated on the row above and are ' +
            'unchanged by moving the lookup — this row changes exactly one thing about that ' +
            'comparison, which is the point of it.',
        build: () => {
            const fixture = priceFixture(priceDataset.batch);
            const variants: TPriceDataRow[][] = [[], []];
            for (let v = 0; v < 2; v++) {
                for (let i = 0; i < fixture.rows.length; i++) {
                    variants[v].push({ ...fixture.rows[i], title: priceDataset.titles[v] });
                }
            }
            let round = 0;
            let floorRound = 0;
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const slotContentService = fixture.entityService.slotContentService;
                        const entityStoreSlot = fixture.entityStoreSlot;
                        const db = fixture.db;
                        let done = 0;
                        while (done < times) {
                            const source = variants[round++ & 1];
                            const upTo = Math.min(source.length, times - done);
                            for (let i = 0; i < upTo; i++) slotContentService.upsertEntity(entityStoreSlot, source[i]);
                            db.flush();
                            done += upTo;
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const byId = fixture.byId;
                        let done = 0;
                        while (done < times) {
                            const source = variants[floorRound++ & 1];
                            const upTo = Math.min(source.length, times - done);
                            for (let i = 0; i < upTo; i++) {
                                const next = source[i];
                                // The `undefined` test is the floor's, not a
                                // concession: a hand-written store reading a key
                                // it was handed has to make it.
                                const stored = byId.get(next.id);
                                if (stored === undefined) continue;
                                stored.id = next.id;
                                stored.group = next.group;
                                stored.rank = next.rank;
                                stored.title = next.title;
                                stored.note = next.note;
                            }
                            done += upTo;
                        }
                    },
                },
            };
        },
    },

    {
        id: 'upsert.whole-row-vs-five-stores-and-a-departure-walk',
        path: EPricePath.PerWrite,
        ours: 'slotContentService.upsertEntity(entityStoreSlot, row) — a key that already carries a value',
        floor: 'walk the stored row for columns the new one does not carry, then five stores',
        caveat:
            'THE DEPARTURE WALK, PUT ON THE FLOOR, WHICH IS THE ONLY WAY THIS HARNESS CAN PRICE ' +
            'AN OPERATION THAT NEITHER ARM OF AN EXISTING ROW ISOLATES. `upsert.whole-row-vs-' +
            'five-stores` charges our side a walk of the STORED row\'s own names, with a ' +
            '`hasOwnProperty` probe of the caller\'s row per name, and its floor makes neither — so the walk sits ' +
            'inside that row\'s residual with the marking, the routing and four extra columns of ' +
            'comparison, and nothing separates it from them. Here the floor makes the identical ' +
            'walk, to the line of `OIMSlotContentEntityService.writeEntity`, and stores five columns after ' +
            'it. THE ITEM IS THE DIFFERENCE BETWEEN THIS ROW\'S GAP AND THAT ROW\'S GAP, and ' +
            'nothing else about either arm changes. ' +
            'OUR ARM IS THAT ROW\'S ARM TO THE CHARACTER — the same fixture, the same two ' +
            'whole-row variants alternating so `title` moves on every row of every pass, the same ' +
            'flush per eight thousand writes, the same absence of an index, a subscriber and a ' +
            'projection. So the two rows\' `ours` columns should agree to within the between-pair ' +
            'disagreement of this piece, and a run where they do not is a run that has said ' +
            'something about the machine rather than about the walk. ' +
            'OPERATION COUNT, THE DIFFERENCE ONLY: one `for…in` over the five names the stored ' +
            'row carries, five `hasOwnProperty` probes of a five-property row, and one `??=` test that never ' +
            'fires — both rows of this fixture carry all five columns, so nothing ever leaves and ' +
            'no array is allocated on either arm. That is the walk at its CHEAPEST: it finds ' +
            'nothing, which is what a server re-sending whole rows always makes it do, and it is ' +
            'the case an upsert being a whole-row replace is charged for. A payload that ' +
            'genuinely drops a column would add a push, a `deleteColumns` call ' +
            'and an `undefined` write per departing name to our side and a `delete` to the floor. ' +
            'WHAT THIS ROW IS NOT. It is not a merge-versus-replace comparison — the floor here ' +
            'is not the rejected design, it is the shipped design with one item lifted out of it ' +
            'and set beside a hand-written store. The rejected design is `upsertEntity` WITHOUT the ' +
            'walk, which is `upsert.whole-row-vs-five-stores` with a floor that does less, and ' +
            'no row in this suite is that. Read this one as the price of the item, not as a ' +
            'verdict on the consequence.',
        build: () => {
            const fixture = priceFixture(priceDataset.batch);
            const variants: TPriceDataRow[][] = [[], []];
            for (let v = 0; v < 2; v++) {
                for (let i = 0; i < fixture.rows.length; i++) {
                    variants[v].push({ ...fixture.rows[i], title: priceDataset.titles[v] });
                }
            }
            let round = 0;
            let floorRound = 0;
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const slotContentService = fixture.entityService.slotContentService;
                        const entityStoreSlot = fixture.entityStoreSlot;
                        const db = fixture.db;
                        let done = 0;
                        while (done < times) {
                            const source = variants[round++ & 1];
                            const upTo = Math.min(source.length, times - done);
                            for (let i = 0; i < upTo; i++) slotContentService.upsertEntity(entityStoreSlot, source[i]);
                            db.flush();
                            done += upTo;
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const held = fixture.held;
                        let done = 0;
                        while (done < times) {
                            const source = variants[floorRound++ & 1];
                            const upTo = Math.min(source.length, times - done);
                            for (let i = 0; i < upTo; i++) {
                                const stored = held[i];
                                const next = source[i];
                                let leaving: string[] | undefined;
                                for (const name in stored) {
                                    if (!Object.prototype.hasOwnProperty.call(next, name)) {
                                        (leaving ??= []).push(name);
                                    }
                                }
                                // Read once to keep dead-code elimination off
                                // it; free while it is undefined, which it
                                // always is here.
                                if (leaving !== undefined) priceSink.number = leaving.length;
                                stored.id = next.id;
                                stored.group = next.group;
                                stored.rank = next.rank;
                                stored.title = next.title;
                                stored.note = next.note;
                            }
                            done += upTo;
                        }
                    },
                },
            };
        },
    },

    {
        id: 'update.indexed-column-vs-hand-index',
        path: EPricePath.PerWrite,
        ours: 'slotContentService.updateEntity(slot, { group }) — an OIMIndexService store slot over `group` re-files the row',
        floor: 'delete from the old Set, store the column, add to the new Set',
        caveat:
            'THE INDEX IS AUTOMATIC AGAIN, SO THIS IS THE ORIGINAL QUESTION. The `OIMIndexService` store slot hears its ' +
            'source collection through a content-change listener: `updateEntity` marks the row, the ' +
            'listener reads the key the row was last filed under from the row\'s own ' +
            '`indexKeys` cell, compares it with `keyOf(entity)` and moves the slot with ' +
            '`removeBucketMemberSlotByKey` + `addBucketMemberSlotByKey`. The caller writes one ' +
            'column and nothing else. All sixty-four buckets are held before the clock, because ' +
            'an index files only into buckets that exist. A reading recorded under this id while ' +
            'the move was the caller\'s (`removeSlotAt` + `appendSlot` on a positional bucket ' +
            'collection) priced a different body and must not be quoted against this one. ' +
            'WHERE THE TWO SIDES ARE NOT DOING THE SAME WORK. Ours resolves BOTH buckets by key ' +
            'through the bucket store (two `Map.get`), as the floor resolves both `Set`s; the ' +
            'unordered bucket is a `Set`, so leave and join are hashes on both sides. Ours ' +
            'additionally reads and writes the row\'s index cell, holds and unholds the row from ' +
            'the buckets, queues both buckets for the change-close flush that marks them on the ' +
            'channel so a subscriber can be woken, and marks the row itself — and the flush that ' +
            'closes the batch is inside the timed body. The floor can be read by iterating it and ' +
            'by nothing else. Direction: inflates our ratio.',
        build: () => {
            const fixture = priceFixture(priceDataset.batch);
            const indexService = createOIMIndexService(fixture.db, {
                entityService: fixture.entityService,
                slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TPriceDataRow>>(),
                keyOf: (row: TPriceDataRow) => row.group,
            });
            const names = priceDataset.groupNames();
            const indexStoreSlot = indexService.createIndexStoreSlot(fixture.entityStoreSlot);
            const buckets = indexService.holdSlotsByKeys(indexStoreSlot, names);
            fixture.db.flush();
            const byGroup = new Map<string, Set<TPriceDataRow>>();
            for (let i = 0; i < names.length; i++) byGroup.set(names[i], new Set<TPriceDataRow>());
            for (let i = 0; i < fixture.held.length; i++) {
                const row = fixture.held[i];
                const bucket = byGroup.get(row.group);
                if (bucket !== undefined) bucket.add(row);
            }
            for (let i = 0; i < names.length; i++) {
                if (indexService.slotContentService.getBucketMemberSlotCount(buckets[i]) === (byGroup.get(names[i])?.size ?? 0)) continue;
                throw new Error(`price: the index and the hand index disagree on "${names[i]}".`);
            }

            const patch: { group: string } = { group: '' };
            let shift = 0;
            let floorShift = 0;
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const slots = fixture.slots;
                        const slotContentService = fixture.entityService.slotContentService;
                        const db = fixture.db;
                        const groupMask = names.length - 1;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(slots.length, times - done);
                            // One step per pass, so every row's group differs
                            // from the one it holds and the move is always real.
                            shift++;
                            for (let i = 0; i < upTo; i++) {
                                patch.group = names[(i + shift) & groupMask];
                                slotContentService.updateEntity(slots[i], patch);
                            }
                            db.flush();
                            done += upTo;
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const held = fixture.held;
                        const groupMask = names.length - 1;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(held.length, times - done);
                            floorShift++;
                            for (let i = 0; i < upTo; i++) {
                                const row = held[i];
                                const next = names[(i + floorShift) & groupMask];
                                if (row.group === next) continue;
                                const from = byGroup.get(row.group);
                                if (from !== undefined) from.delete(row);
                                row.group = next;
                                let to = byGroup.get(next);
                                if (to === undefined) {
                                    to = new Set<TPriceDataRow>();
                                    byGroup.set(next, to);
                                }
                                to.add(row);
                            }
                            done += upTo;
                        }
                    },
                },
            };
        },
    },

    {
        id: 'remove.vs-map-delete',
        path: EPricePath.PerWrite,
        ours: 'slotContentService.deleteEntity(slot) — through the identity, no index registered',
        floor: 'map.delete(id)',
        caveat:
            'THE HASH IS ON THE FLOOR\'S SIDE ONLY: ours is handed the identity and the floor ' +
            'hashes a string, which flatters us — the deleteEntityByKey path is not priced here and ' +
            'would cost us that lookup too. Against that, ours clears the value through the ' +
            'writer, reports it on the channel, recomputes emptiness and asks whether anything ' +
            'holds or references the identity before it unfiles it from the store — an unheld, ' +
            'emptied slot is released at the call. The flush that closes the batch is inside the ' +
            'timed body. The floor\'s row is gone the instant delete returns and nothing can be ' +
            'subscribed to it. Both sides rebuild their population between passes, untimed.',
        build: () => {
            const rows = priceDataset.makeRows(priceDataset.batch);
            const db = new OIMDB();
            const entityService = createOIMEntityService<TPriceDataRow>(db, { keyOf: row => row.id });
            const slotContentService = entityService.slotContentService;
            let slots: TOIMEntitySlot<TPriceDataRow, TOIMStoreKey>[] = [];
            let map = new Map<string, TPriceDataRow>();
            return {
                ours: {
                    operationsPerPass: rows.length,
                    reset: () => {
                        slots = slotContentService.upsertEntities(entityService.createStoreSlot(db), rows);
                        db.flush();
                    },
                    run: times => {
                        for (let i = 0; i < times; i++) slotContentService.deleteEntity(slots[i]);
                        db.flush();
                    },
                },
                floor: {
                    operationsPerPass: rows.length,
                    reset: () => {
                        map = new Map<string, TPriceDataRow>();
                        for (let i = 0; i < rows.length; i++) map.set(rows[i].id, { ...rows[i] });
                    },
                    run: times => {
                        for (let i = 0; i < times; i++) map.delete(rows[i].id);
                        priceSink.number = map.size;
                    },
                },
            };
        },
    },

    {
        id: 'remove.indexed-vs-hand-index',
        path: EPricePath.PerWrite,
        ours: 'slotContentService.deleteEntity(slot) with one OIMIndexService store slot over `group`',
        floor: 'map.delete(id) and Set.delete(row) from the group it was in',
        caveat:
            'Ours finds the bucket to leave through the key the row\'s own `indexKeys` cell ' +
            'carries — one cell read and one bucket-store `Map.get` — where the floor hashes the ' +
            'id and then hashes the group name. Against that, ours clears the value, tells the ' +
            'index through its content listener, unholds the row from the bucket, queues the ' +
            'bucket for the change-close flush that marks it on the channel, and unfiles the ' +
            'emptied identity; the flush that closes this batch is inside the timed body. The ' +
            'buckets are held for the whole pass, so none is released under the clock. The floor ' +
            'leaves an empty Set behind for ever and tells nobody.',
        build: () => {
            const rows = priceDataset.makeRows(priceDataset.batch);
            const names = priceDataset.groupNames();
            const db = new OIMDB();
            const entityService = createOIMEntityService<TPriceDataRow>(db, { keyOf: row => row.id });
            const slotContentService = entityService.slotContentService;
            const indexService = createOIMIndexService(db, {
                entityService,
                slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TPriceDataRow>>(),
                keyOf: (row: TPriceDataRow) => row.group,
            });
            let slots: TOIMEntitySlot<TPriceDataRow, TOIMStoreKey>[] = [];
            let map = new Map<string, TPriceDataRow>();
            let byGroup = new Map<string, Set<TPriceDataRow>>();
            return {
                ours: {
                    operationsPerPass: rows.length,
                    reset: () => {
                        const entityStoreSlot = entityService.createStoreSlot(db);
                        slots = slotContentService.upsertEntities(entityStoreSlot, rows);
                        const indexStoreSlot = indexService.createIndexStoreSlot(entityStoreSlot);
                        const buckets = indexService.holdSlotsByKeys(indexStoreSlot, names);
                        if (indexService.slotContentService.getBucketMemberSlotCount(buckets[0]) !== rows.length / names.length) {
                            throw new Error('price: the index did not file the population it was built over.');
                        }
                        db.flush();
                    },
                    run: times => {
                        for (let i = 0; i < times; i++) slotContentService.deleteEntity(slots[i]);
                        db.flush();
                    },
                },
                floor: {
                    operationsPerPass: rows.length,
                    reset: () => {
                        map = new Map<string, TPriceDataRow>();
                        byGroup = new Map<string, Set<TPriceDataRow>>();
                        for (let i = 0; i < names.length; i++) {
                            byGroup.set(names[i], new Set<TPriceDataRow>());
                        }
                        for (let i = 0; i < rows.length; i++) {
                            const copy = { ...rows[i] };
                            map.set(copy.id, copy);
                            const bucket = byGroup.get(copy.group);
                            if (bucket !== undefined) bucket.add(copy);
                        }
                    },
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            const id = rows[i].id;
                            const row = map.get(id);
                            if (row === undefined) continue;
                            map.delete(id);
                            const bucket = byGroup.get(row.group);
                            if (bucket !== undefined) bucket.delete(row);
                        }
                        priceSink.number = map.size;
                    },
                },
            };
        },
    },
];
