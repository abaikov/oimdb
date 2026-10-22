// Prose: ./README.md#alternativepairswritepath
import {
    OIMDB,
    OIMEffectService,
    OIMSlotStoreServiceMapDriven,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
    createOIMEntityWriterReplacing,
    oimSameValueZeroGuard,
} from '../../../core/src/index';
import type {
    IOIMEntityWriter,
    IOIMSlotOwner,
    TOIMColumnSlot,
    TOIMEntitySlot,
    TOIMSameValueGuard,
    TOIMSlotEditable,
    TOIMStoreKey,
    TOIMStoreSlot,
} from '../../../core/src/index';
// Deep on purpose: a floor must share the shipped walk's helpers and frozen empty list.
import { OIM_FROZEN_EMPTY_COLUMN_NAMES } from '../../../core/src/engine/entity/constants/OIM_FROZEN_EMPTY_COLUMN_NAMES';
import { OIM_SLOT_FLAG_EMPTY } from '../../../core/src/engine/slot/constants/OIM_SLOT_FLAG_EMPTY';
import { changedColumns } from './changedColumns';
import { oimIsPlain } from '../../../core/src/engine/entity/utils/oimIsPlain';
import { oimIsProtoKey } from '../../../core/src/engine/entity/utils/oimIsProtoKey';
import { oimOwnedColumnNames } from '../../../core/src/engine/entity/utils/oimOwnedColumnNames';
import { EPricePath } from './EPricePath';
import { priceDataset } from './priceDataset';
import { priceFixture } from './priceFixture';
import type { TPriceEntityService } from './priceFixture';
import { priceRoundSide } from './priceRoundSide';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';

const WIDE_COLUMN_COUNT = 16;

const WIDE_COLUMNS: readonly string[] = (() => {
    const names: string[] = [];
    for (let c = 0; c < WIDE_COLUMN_COUNT; c++) names.push(`c${c < 10 ? '0' : ''}${c}`);
    return names;
})();

type TWideRow = {
    id: string;
    c00: string; c01: string; c02: string; c03: string;
    c04: string; c05: string; c06: string; c07: string;
    c08: string; c09: string; c10: string; c11: string;
    c12: string; c13: string; c14: string; c15: string;
};

type TWideSlot = TOIMEntitySlot<TWideRow, TOIMStoreKey>;

type TWideEntityService = TPriceEntityService<TWideRow>;

type TWideStoreSlot = TOIMStoreSlot<Map<TOIMStoreKey, TWideSlot>, TWideSlot, Partial<TWideRow>>;

type TMakeWideEntityService = (db: OIMDB) => TWideEntityService;

const selectWideKey = (row: TWideRow): string => row.id;

const makeWideRows = (count: number): TWideRow[] => {
    const rows: TWideRow[] = [];
    for (let i = 0; i < count; i++) {
        const row: Record<string, string> = { id: `row-${i}` };
        for (let c = 0; c < WIDE_COLUMN_COUNT; c++) {
            row[WIDE_COLUMNS[c]] = priceDataset.titles[(i + c) & 7];
        }
        rows.push(row as TWideRow);
    }
    return rows;
};

const makeWideEntityService = (db: OIMDB, entityWriter?: IOIMEntityWriter): TWideEntityService =>
    createOIMEntityService<TWideRow>(db, {
        keyOf: selectWideKey,
        entityWriter,
        columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
    });

const shippedDefault: TMakeWideEntityService = db => makeWideEntityService(db);

const withWriter = (entityWriter: IOIMEntityWriter): TMakeWideEntityService =>
    db => makeWideEntityService(db, entityWriter);

type TWideWorld = {
    readonly db: OIMDB;
    readonly effectService: OIMEffectService;
    readonly entityService: TWideEntityService;
    readonly entityStoreSlot: TWideStoreSlot;
    readonly rows: readonly TWideRow[];
    readonly slots: readonly TWideSlot[];
};

const wideWorld = (
    makeEntityService: TMakeWideEntityService,
    count: number = priceDataset.batch,
): TWideWorld => {
    const rows = makeWideRows(count);
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const entityService = makeEntityService(db);
    const entityStoreSlot = entityService.createStoreSlot(db);
    entityService.slotContentService.upsertEntities(entityStoreSlot, rows);
    db.flush();
    const slots: TWideSlot[] = [];
    for (let i = 0; i < rows.length; i++) slots.push(entityService.getSlotByKey(entityStoreSlot, rows[i].id));
    return { db, effectService, entityService, entityStoreSlot, rows, slots };
};

const makeWidePatch = (): Record<string, string> => {
    const patch: Record<string, string> = {};
    for (let c = 0; c < WIDE_COLUMN_COUNT; c++) patch[WIDE_COLUMNS[c]] = '';
    return patch;
};

const fillWidePatch = (patch: Record<string, string>, round: number): void => {
    for (let c = 0; c < WIDE_COLUMN_COUNT; c++) {
        patch[WIDE_COLUMNS[c]] = priceDataset.titles[(round + c) & 7];
    }
};

const assertWideRowsHold = (world: TWideWorld, patch: Record<string, string>): void => {
    const probed = [world.slots[0], world.slots[world.slots.length - 1]];
    for (const slot of probed) {
        const entity = slot.entity as Record<string, string> | undefined;
        for (let c = 0; c < WIDE_COLUMN_COUNT; c++) {
            const name = WIDE_COLUMNS[c];
            if (entity !== undefined && entity[name] === patch[name]) continue;
            throw new Error(
                `alternatives: row "${String(slot.key)}" holds ${String(entity?.[name])} in ${name} ` +
                    `after a write of ${patch[name]}; this arm does not do the job the other one does.`,
            );
        }
    }
};

const inertSide: TPriceSide = {
    reset: () => undefined,
    run: () => undefined,
};

type TPatchAdvance = (patch: Record<string, string>, round: number) => void;

const resendUnchanged: TPatchAdvance = patch => fillWidePatch(patch, 0);

const moveEveryColumn: TPatchAdvance = (patch, round) => fillWidePatch(patch, round);

const moveOneColumn: TPatchAdvance = (patch, round) => {
    patch.c00 = priceDataset.titles[round & 7];
};

const primedUpdateSide = (
    makeEntityService: TMakeWideEntityService,
    advance: TPatchAdvance,
    reset: () => void = () => undefined,
): TPriceSide => {
    const patch = makeWidePatch();
    const world = wideWorld(makeEntityService);
    fillWidePatch(patch, 0);
    for (let i = 0; i < world.slots.length; i++) {
        world.entityService.slotContentService.updateEntity(world.slots[i], patch as Partial<TWideRow>);
    }
    world.db.flush();
    assertWideRowsHold(world, patch);
    let round = 1;
    return {
        reset,
        run: times => {
            const slotContentService = world.entityService.slotContentService;
            const slots = world.slots;
            const db = world.db;
            let done = 0;
            while (done < times) {
                const upTo = Math.min(slots.length, times - done);
                advance(patch, round++);
                for (let i = 0; i < upTo; i++) {
                    slotContentService.updateEntity(slots[i], patch as Partial<TWideRow>);
                }
                db.flush();
                done += upTo;
            }
        },
    };
};

/* ══ the strategies that were refused ════════════════════════════════════ */

const shippedInPlace = createOIMEntityWriterInPlace();
const shippedReplacing = createOIMEntityWriterReplacing();

type TColumnWalk = (slot: TOIMEntitySlot, patch: object) => string[] | undefined;

const writeInPlaceWalking = (walk: TColumnWalk): IOIMEntityWriter => ({
    fillEntity: shippedInPlace.fillEntity,
    clearEntity: shippedInPlace.clearEntity,
    patchColumn: shippedInPlace.patchColumn,
    putEntity: shippedInPlace.putEntity,
    deleteColumns: shippedInPlace.deleteColumns,
    patchEntity: (slot, patch, changedColumnNames) => {
        const changed = walk(slot, patch);
        if (changed === undefined) return false;
        const entity = slot.entity as Record<string, unknown>;
        const source = patch as Record<string, unknown>;
        for (let i = 0; i < changed.length; i++) entity[changed[i]] = source[changed[i]];
        if (changedColumnNames !== undefined) changedColumnNames.push(...changed);
        return true;
    },
});

const walkingObjectKeys: TColumnWalk = (slot, patch) => {
    const entity = slot.entity as Record<string, unknown> | undefined;
    if (entity === undefined) return undefined;
    const source = patch as Record<string, unknown>;
    let changed: string[] | undefined;
    const names = Object.keys(source);
    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        if (oimIsProtoKey(name)) continue;
        if (oimSameValueZeroGuard(entity[name], source[name])) continue;
        (changed ??= []).push(name);
    }
    return changed;
};

const probingEveryColumn: TColumnWalk = (slot, patch) => {
    const entity = slot.entity as Record<string, unknown> | undefined;
    if (entity === undefined) return undefined;
    const source = patch as Record<string, unknown>;
    let changed: string[] | undefined;
    for (const name in source) {
        if (oimIsProtoKey(name)) continue;
        if (!Object.prototype.hasOwnProperty.call(source, name)) continue;
        if (oimSameValueZeroGuard(entity[name], source[name])) continue;
        (changed ??= []).push(name);
    }
    return changed;
};

const FORBIDDEN_NAMES = new Set<string>(['__proto__']);

const askingASet: TColumnWalk = (slot, patch) => {
    const entity = slot.entity as Record<string, unknown> | undefined;
    if (entity === undefined) return undefined;
    const source = patch as Record<string, unknown>;
    let changed: string[] | undefined;
    const inherited = !oimIsPlain(source);
    for (const name in source) {
        if (FORBIDDEN_NAMES.has(name)) continue;
        if (inherited && !Object.prototype.hasOwnProperty.call(source, name)) continue;
        if (oimSameValueZeroGuard(entity[name], source[name])) continue;
        (changed ??= []).push(name);
    }
    return changed;
};

const comparingTheNameInline: TColumnWalk = (slot, patch) => {
    const entity = slot.entity as Record<string, unknown> | undefined;
    if (entity === undefined) return undefined;
    const source = patch as Record<string, unknown>;
    let changed: string[] | undefined;
    const inherited = !oimIsPlain(source);
    for (const name in source) {
        if (name === '__proto__') continue;
        if (inherited && !Object.prototype.hasOwnProperty.call(source, name)) continue;
        if (oimSameValueZeroGuard(entity[name], source[name])) continue;
        (changed ??= []).push(name);
    }
    return changed;
};

const withEqualityInlined: TColumnWalk = (slot, patch) => {
    const entity = slot.entity as Record<string, unknown> | undefined;
    if (entity === undefined) return undefined;
    const source = patch as Record<string, unknown>;
    let changed: string[] | undefined;
    const inherited = !oimIsPlain(source);
    for (const name in source) {
        if (oimIsProtoKey(name)) continue;
        if (inherited && !Object.prototype.hasOwnProperty.call(source, name)) continue;
        const prev = entity[name];
        const next = source[name];
        if (prev === next || (prev !== prev && next !== next)) continue;
        (changed ??= []).push(name);
    }
    return changed;
};

const withAComparatorPerColumn = (
    byColumn: ReadonlyMap<string, TOIMSameValueGuard>,
): TColumnWalk => (slot, patch) => {
    const entity = slot.entity as Record<string, unknown> | undefined;
    if (entity === undefined) return undefined;
    const source = patch as Record<string, unknown>;
    let changed: string[] | undefined;
    const inherited = !oimIsPlain(source);
    for (const name in source) {
        if (oimIsProtoKey(name)) continue;
        if (inherited && !Object.prototype.hasOwnProperty.call(source, name)) continue;
        const compare = byColumn.get(name);
        const same =
            compare === undefined
                ? entity[name] === source[name]
                : compare(entity[name], source[name]);
        if (same) continue;
        (changed ??= []).push(name);
    }
    return changed;
};

const caseInsensitiveEquality: TOIMSameValueGuard = (a, b) => {
    if (a === b) return true;
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    return a.toLowerCase() === b.toLowerCase();
};

const storeEntity = (slot: TOIMEntitySlot, entity: Record<string, unknown>): void => {
    (slot as TOIMSlotEditable<TOIMEntitySlot>).entity = entity;
};

const writeReplacingBuildingAsItWalks = (): IOIMEntityWriter => ({
    fillEntity: shippedReplacing.fillEntity,
    clearEntity: shippedReplacing.clearEntity,
    patchColumn: shippedReplacing.patchColumn,
    putEntity: shippedReplacing.putEntity,
    deleteColumns: shippedReplacing.deleteColumns,
    patchEntity: (slot, patch, changedColumnNames) => {
        const entity = slot.entity as Record<string, unknown> | undefined;
        if (entity === undefined) return false;
        let changed = false;
        const source = patch as Record<string, unknown>;
        const inherited = !oimIsPlain(source);
        const next: Record<string, unknown> = { ...entity };
        for (const name in source) {
            if (oimIsProtoKey(name)) continue;
            if (inherited && !Object.prototype.hasOwnProperty.call(source, name)) continue;
            if (oimSameValueZeroGuard(entity[name], source[name])) continue;
            next[name] = source[name];
            changed = true;
            if (changedColumnNames !== undefined) changedColumnNames.push(name);
        }
        storeEntity(slot, next);
        return changed;
    },
});

const writeReplacingSpreadingThePatch = (): IOIMEntityWriter => ({
    fillEntity: shippedReplacing.fillEntity,
    clearEntity: shippedReplacing.clearEntity,
    patchColumn: shippedReplacing.patchColumn,
    putEntity: shippedReplacing.putEntity,
    deleteColumns: shippedReplacing.deleteColumns,
    patchEntity: (slot, patch, changedColumnNames) => {
        const changed = changedColumns(slot, patch, oimSameValueZeroGuard);
        if (changed === undefined) return false;
        storeEntity(slot, { ...slot.entity as Record<string, unknown>, ...patch as Record<string, unknown> });
        if (changedColumnNames !== undefined) changedColumnNames.push(...changed);
        return true;
    },
});

const putByRemovingThenPatching = (
    deleteColumns: IOIMEntityWriter['deleteColumns'],
    patchEntity: IOIMEntityWriter['patchEntity'],
): IOIMEntityWriter['putEntity'] => (slot, entity, changedColumnNames) => {
    const prevEntity = slot.entity as Record<string, unknown> | undefined;
    let leaving: string[] | undefined;
    if (prevEntity !== undefined) {
        for (const name in prevEntity) {
            if (!Object.prototype.hasOwnProperty.call(entity, name)) (leaving ??= []).push(name);
        }
    }
    const removed = leaving === undefined ? OIM_FROZEN_EMPTY_COLUMN_NAMES : deleteColumns(slot, leaving);
    if (changedColumnNames !== undefined) changedColumnNames.push(...removed);
    const patched = patchEntity(slot, entity, changedColumnNames);
    return patched || removed.length > 0;
};

const writeReplacingSpreadingAndDeleting = (): IOIMEntityWriter => {
    const deleteColumns: IOIMEntityWriter['deleteColumns'] = (slot, names) => {
        const removed = oimOwnedColumnNames(slot, names);
        if (removed === undefined) return OIM_FROZEN_EMPTY_COLUMN_NAMES;
        const next: Record<string, unknown> = { ...slot.entity as Record<string, unknown> };
        for (let i = 0; i < removed.length; i++) delete next[removed[i]];
        storeEntity(slot, next);
        return removed;
    };
    return {
        fillEntity: shippedReplacing.fillEntity,
        clearEntity: shippedReplacing.clearEntity,
        patchColumn: shippedReplacing.patchColumn,
            putEntity: putByRemovingThenPatching(deleteColumns, shippedReplacing.patchEntity),
        patchEntity: shippedReplacing.patchEntity,
        deleteColumns,
    };
};

const writeInPlaceBlanking = (): IOIMEntityWriter => {
    const deleteColumns: IOIMEntityWriter['deleteColumns'] = (slot, names) => {
        const removed = oimOwnedColumnNames(slot, names);
        if (removed === undefined) return OIM_FROZEN_EMPTY_COLUMN_NAMES;
        const entity = slot.entity as Record<string, unknown>;
        for (let i = 0; i < removed.length; i++) entity[removed[i]] = undefined;
        return removed;
    };
    return {
        fillEntity: shippedInPlace.fillEntity,
        clearEntity: shippedInPlace.clearEntity,
        patchColumn: shippedInPlace.patchColumn,
            putEntity: putByRemovingThenPatching(deleteColumns, shippedInPlace.patchEntity),
        patchEntity: shippedInPlace.patchEntity,
        deleteColumns,
    };
};

type TGrowingSlotContentStrategy = {
    createSlot: (key: TOIMStoreKey, storeSlot: TOIMStoreSlot | undefined, owner: IOIMSlotOwner) => TWideSlot;
};

const createGrowingSlot = (key: TOIMStoreKey, storeSlot: TOIMStoreSlot | undefined, owner: IOIMSlotOwner): TWideSlot => ({
    storeSlot,
    changedAtRevision: 0,
    changedAtEpoch: 0,
    holdCount: 0,
    releaseDueAfterWriteMs: -1,
    releaseDueAfterIdleMs: -1,
    releaseDueAfterUnholdMs: -1,
    slotFlags: OIM_SLOT_FLAG_EMPTY,
    owner,
    key,
} as unknown as TWideSlot);

const grownSlots: TMakeWideEntityService = db => {
    const entityService = makeWideEntityService(db);
    (entityService as unknown as { slotOwnerService: { slotContentStrategy: TGrowingSlotContentStrategy } })
        .slotOwnerService.slotContentStrategy.createSlot = createGrowingSlot;
    return entityService;
};

/* ══ the sentences several rows share ════════════════════════════════════ */

const ONE_COMPILED_WALK =
    'THIS PAIR DECLARES `isolate`, AND THE READING IS UNINTERPRETABLE WITHOUT IT. Both arms ' +
    'reach the engine through one compiled function — `OIMSlotContentEntityService.prototype.updateEntity`, ' +
    'whose single call site `this.entityWriter.patchEntity(entitySlot, patch, undefined)` would see both ' +
    'writers in one process. Neither would then be inlined, and inlining the column walk into the ' +
    'write is exactly where a walk\'s advantage lives; worse, the failure is invisible, because a ' +
    'ratio of 1.00 would be equally consistent with "the two walks cost the same" and "each arm ran ' +
    'through caches the other had already made polymorphic". Each side is therefore probed and ' +
    'timed in a process that has never constructed the other, and `build` declines to fill the ' +
    'population it was not asked for — merely FILLING the other design\'s population teaches V8 ' +
    'its shape, so declining to time it is not enough. What it costs: `noise` now includes ' +
    'process-to-process variation, which is the honest thing for it to include here.';

const THE_WRITE_AROUND_THE_WALK =
    'THE WRITE AROUND THE WALK IS IDENTICAL ON BOTH ARMS AND IS INSIDE BOTH NUMBERS: ' +
    '`assertWritable` with the channel\'s `assertNotFlushing`, `openSubframe`/`closeSubframe`, the ' +
    'writer dispatch, the `length > 0` test, and — on a write that moves something — the ' +
    'changed-names array, `markColumnsChanged`\'s column-store probe per moved column, ' +
    '`OIMChannelService.writeWithoutFlushCheck` and `markContentChanged`. That is a large constant added to ' +
    'the numerator and the denominator alike, so it pulls this ratio toward 1.00 and the printed ' +
    'ratio is a LOWER BOUND on the difference between the two walks. The two nanosecond columns ' +
    'beside it are not pulled anywhere: subtract them to get the per-write difference the row is ' +
    'actually about.';

const READ_ARMS_ARE_SEPARATE_BODIES =
    'THIS PAIR DOES NOT DECLARE `isolate`, AND THAT IS A DECISION RATHER THAN A DEFAULT. The ' +
    'timed body on each arm is a hand-written read loop belonging to that arm alone — no library ' +
    'code is entered by either, so there is no shared compiled function whose inline caches the ' +
    'two arms could spoil for each other. Each loop\'s property access therefore sees exactly the ' +
    'row shape its own design produces, for the life of the process, which is the whole thing ' +
    'being measured. The populations ARE built through the shipped `upsertEntity` with two different ' +
    'writers, and that build is outside the clock; nothing timed here touches it. Keeping the ' +
    'ordinary single-process form buys the floor-twice bracket, which is the stronger drift ' +
    'check and is what these rows want.';

const readColumn = (rows: readonly TWideRow[], at: number, mask: number): void => {
    priceSink.text = rows[at & mask].c07;
};

const populationThatLostAColumn = (
    write: IOIMEntityWriter | undefined,
    takeEveryNth: number,
): readonly TWideRow[] => {
    const world = wideWorld(db => makeWideEntityService(db, write));
    for (let i = 0; i < world.rows.length; i++) {
        if (i % takeEveryNth !== 0) continue;
        const short: Record<string, unknown> = { ...world.rows[i] };
        delete short.c15;
        world.entityService.slotContentService.upsertEntity(world.entityStoreSlot, short as TWideRow);
    }
    world.db.flush();
    const stored: TWideRow[] = [];
    for (let i = 0; i < world.slots.length; i++) {
        stored.push(world.slots[i].entity as TWideRow);
    }
    if (stored[0].c07 !== world.rows[0].c07 || stored[0].c15 !== undefined) {
        throw new Error(
            'alternatives: a row that lost `c15` does not read as having lost it and kept `c07`; ' +
                'this arm does not do the job the other one does.',
        );
    }
    return stored;
};

const readSides = (ourRows: readonly TWideRow[], floorRows: readonly TWideRow[]) => {
    const mask = priceDataset.batch - 1;
    let ourAt = 0;
    let floorAt = 0;
    return {
        ours: {
            reset: () => undefined,
            run: (times: number) => {
                let at = ourAt;
                for (let done = 0; done < times; done++) readColumn(ourRows, at++, mask);
                ourAt = at;
            },
        },
        floor: {
            reset: () => undefined,
            run: (times: number) => {
                let at = floorAt;
                for (let done = 0; done < times; done++) readColumn(floorRows, at++, mask);
                floorAt = at;
            },
        },
    };
};

/* ══ the catalogue ═══════════════════════════════════════════════════════ */

const lookupSides = (
    oursOf: (fixture: ReturnType<typeof priceFixture>, id: string, patch: { title: string }) => void,
    floorOf: (slotById: Map<string, TOIMEntitySlot<TPriceDataRow, TOIMStoreKey>>, fixture: ReturnType<typeof priceFixture>, id: string, patch: { title: string }) => void,
    isFlushed: boolean,
) => {
    const fixture = priceFixture(priceDataset.batch);
    const slotById = new Map(fixture.slots.map(slot => [slot.entity!.id, slot]));
    const sideOf = (step: (id: string, patch: { title: string }) => void): TPriceSide => {
        const patch = { title: '' };
        return priceRoundSide(fixture.rows.length, (upTo, round) => {
            const rows = fixture.rows;
            patch.title = priceDataset.titles[round & 7];
            for (let i = 0; i < upTo; i++) step(rows[i].id, patch);
        }, isFlushed ? () => fixture.db.flush() : undefined);
    };
    return {
        ours: sideOf((id, patch) => oursOf(fixture, id, patch)),
        floor: sideOf((id, patch) => floorOf(slotById, fixture, id, patch)),
    };
};

const LOOKUP =
    'Both sides run on the same population of priceDataset.batch entities and visit the same ids in the same order. '
    + 'The floor reaches the same slots through a hand-built Map<id, slot>; the engine reaches them through its store service.';

const lookupPairs: readonly TPricePair[] = [
    {
        id: 'alt.update-by-key.engine-lookup-vs-map-get',
        path: EPricePath.PerWrite,
        ours: 'entityService.slotContentService.updateEntity(entityService.getSlotByKey(entityStoreSlot, id), patch)',
        floor: 'entityService.updateEntity(slotById.get(id), patch) — the same engine write, the slot found by a bare Map.get',
        caveat: `${LOOKUP} Ours finds the slot in the store with getSlotByKey and then runs updateEntity; the floor calls updateEntity on a slot it found itself. `
            + 'The lookup alone is priced by alt.lookup.get-slot-by-key-vs-map-get, so what this ratio adds over that one is the by-key door around the same write.',
        build: () => lookupSides(
            (fixture, id, patch) => { fixture.entityService.slotContentService.updateEntity(fixture.entityService.getSlotByKey(fixture.entityStoreSlot, id), patch); },
            (slotById, fixture, id, patch) => {
                const slot = slotById.get(id);
                if (slot !== undefined) fixture.entityService.slotContentService.updateEntity(slot, patch);
            },
            true,
        ),
    },
    {
        id: 'alt.lookup.get-slot-by-key-vs-map-get',
        path: EPricePath.PerRead,
        ours: 'entityService.getSlotByKey(entityStoreSlot, id).entity',
        floor: 'slotById.get(id).entity — a bare Map.get over the same slots',
        caveat: `${LOOKUP} No write and no flush: only the lookup and one property read.`,
        build: () => lookupSides(
            (fixture, id) => { priceSink.flag = fixture.entityService.getSlotByKey(fixture.entityStoreSlot, id).entity !== undefined; },
            (slotById, _fixture, id) => { priceSink.flag = slotById.get(id)?.entity !== undefined; },
            false,
        ),
    },
];

export const alternativePairsWritePath: readonly TPricePair[] = [
    ...lookupPairs,
    /* ── 1. the column walk: `for…in` with one probe, or `Object.keys` ──── */

    {
        id: 'alt.column-walk.for-in-vs-object-keys.unchanged-resend',
        path: EPricePath.PerWrite,
        ours: 'updateEntity(slot, patch) on the shipped walk — for…in, own-property-ness proved once',
        floor: 'REJECTED: the same write with Object.keys(source) and a walk of that array',
        caveat:
            'THE SCENARIO THE SOURCE\'S OLD FIGURE NAMED, GIVEN A DIRECTORY. The in-place writer\'s ' +
            'source once put the array-allocating form at 1.099 ms against 479 µs on "ten thousand ' +
            'rows rewritten with the values they already hold" [NO RUN BEHIND THIS FIGURE]. ' +
            'This row is that scenario: ONE OPERATION IS ONE `updateEntity` OF A ROW WITH A PATCH IT ' +
            'ALREADY MATCHES IN ALL SIXTEEN COLUMNS. The population is primed outside the clock so ' +
            'every row holds round zero\'s values, and the timed patch is round zero\'s — so every ' +
            'write enumerates sixteen columns, compares sixteen times, moves nothing, and returns ' +
            'having marked nothing. OPERATION COUNT, both arms: 16 `oimIsProtoKey` compares, 16 ' +
            '`oimSameValueZeroGuard` calls, 16 pairs of property loads, and no changed-names array. ' +
            'Ours additionally pays ONE `oimIsPlain` — one `getPrototypeOf` and two reference compares, ' +
            'per write. The floor pays ONE `Object.keys` — a sixteen-element array allocated, filled ' +
            'and abandoned per write. THE DIFFERENCE IS ONE PROTOTYPE PROBE AGAINST ONE ' +
            'SIXTEEN-ELEMENT ARRAY, plus whatever the two enumerations cost each other. ' +
            'THIS IS THE MOST FAVOURABLE SCENARIO THE SHIPPED WALK HAS, and that is why the row ' +
            'beside it exists. Read the two rows together or neither. ' +
            'A FLUSH CLOSES EACH PASS ON BOTH ARMS and is an empty one — nothing was marked. ' +
            `${THE_WRITE_AROUND_THE_WALK} ${ONE_COMPILED_WALK}`,
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor' ? inertSide : primedUpdateSide(shippedDefault, resendUnchanged),
            floor: wanted === 'ours'
                ? inertSide
                : primedUpdateSide(withWriter(writeInPlaceWalking(walkingObjectKeys)), resendUnchanged),
        }),
    },

    {
        id: 'alt.column-walk.for-in-vs-object-keys.every-column-moved',
        path: EPricePath.PerWrite,
        ours: 'updateEntity(slot, patch) on the shipped walk — sixteen columns, all of them moving',
        floor: 'REJECTED: the same write with Object.keys(source) — sixteen columns, all moving',
        caveat:
            'THE COUNTERWEIGHT TO THE ROW ABOVE, AND IT IS OWED. An unchanged re-send is the one ' +
            'write on which the shipped walk allocates nothing whatever, so measuring the rejected ' +
            'design only there would report its worst case as its case. Here every write moves all ' +
            'sixteen columns: BOTH arms allocate a changed-names array and push sixteen names into ' +
            'it, both assign sixteen columns, and both mark the row and its columns. The floor\'s ' +
            'names array is then one allocation among several rather than its only one, and if the ' +
            'shipped walk\'s advantage is really the allocation, this ratio is markedly closer to ' +
            '1.00 than the unchanged row\'s. ' +
            'ONE OPERATION IS ONE `updateEntity` CARRYING SIXTEEN COLUMNS. The values advance by one of ' +
            'eight per pass and column `c` takes `titles[(round + c) & 7]`, so no write is ever ' +
            'handed a value the row already holds. ' +
            `${THE_WRITE_AROUND_THE_WALK} ${ONE_COMPILED_WALK}`,
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor' ? inertSide : primedUpdateSide(shippedDefault, moveEveryColumn),
            floor: wanted === 'ours'
                ? inertSide
                : primedUpdateSide(withWriter(writeInPlaceWalking(walkingObjectKeys)), moveEveryColumn),
        }),
    },

    {
        id: 'alt.column-walk.probe-once-vs-hasownproperty-per-column.unchanged-resend',
        path: EPricePath.PerWrite,
        ours: 'updateEntity(slot, patch) — one oimIsPlain per write, and a bare for…in after it',
        floor: 'REJECTED: hasOwnProperty.call per column, with no oimIsPlain probe at all',
        caveat:
            'THE SECOND DESIGN THE SAME DECISION REFUSED. The writer\'s old source put the ' +
            'per-column probe at "a quarter of" an unchanged re-send — a share of a scenario, not a ' +
            'ratio, and no directory. This row is that scenario at sixteen columns. ' +
            'ONE OPERATION IS ONE UNCHANGED `updateEntity`, primed exactly as the first row of this file. ' +
            'OPERATION COUNT, ours: 1 `getPrototypeOf` and 2 reference compares, then 16 ' +
            '`oimIsProtoKey` compares and 16 equality calls. Floor: 16 `oimIsProtoKey` compares, 16 ' +
            '`Object.prototype.hasOwnProperty.call` invocations and 16 equality calls. THE ' +
            'DIFFERENCE IS ONE PROTOTYPE PROBE AGAINST SIXTEEN BUILTIN CALLS, per write. ' +
            'WHAT THE FLOOR BUYS IS NOT VISIBLE IN THIS NUMBER: unconditional correctness with no ' +
            'probe of the patch and no second rule for the non-plain payload. THE PATCH HERE IS A ' +
            'PLAIN OBJECT, the case the shipped design optimises for; on a class-instance patch ours ' +
            'takes the filtered walk and pays what the floor pays plus the probe. ' +
            `${THE_WRITE_AROUND_THE_WALK} ${ONE_COMPILED_WALK}`,
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor' ? inertSide : primedUpdateSide(shippedDefault, resendUnchanged),
            floor: wanted === 'ours'
                ? inertSide
                : primedUpdateSide(withWriter(writeInPlaceWalking(probingEveryColumn)), resendUnchanged),
        }),
    },

    /* ── 2. the forbidden name: a comparison, a Set, or inline ───────────── */

    {
        id: 'alt.forbidden-name.comparison-vs-set.unchanged-resend',
        path: EPricePath.PerWrite,
        ours: 'updateEntity(slot, patch) — oimIsProtoKey(name), whose whole body is one comparison',
        floor: 'REJECTED: a Set of forbidden names, asked once per enumerated column',
        caveat:
            'WHAT THE RULE WOULD COST IF IT COULD GROW. The forbidden-name rule is one comparison ' +
            'against `OIM_PROTO_KEY`; a membership test against a collection is the shape it would ' +
            'take the day a second name joins it, and nothing has ever measured that. ' +
            'ONE OPERATION IS ONE UNCHANGED `updateEntity` OF A SIXTEEN-COLUMN ROW, primed outside the ' +
            'clock, so the predicate is asked sixteen times and the equality gate then ends every ' +
            'column — the arrangement that gives the predicate the largest share of a write it will ' +
            'ever have. OPERATION COUNT, ours: 16 monomorphic calls each doing one string compare. ' +
            'Floor: 16 `Set.prototype.has` calls, each probing a table of ONE entry. ' +
            'THE SET IS AT ITS BEST HERE AND THE READING IS THEREFORE THE REJECTED DESIGN\'S FLOOR, ' +
            'NOT ITS TYPICAL COST. THE STRINGS ARE INTERNED ON BOTH ARMS, so the floor never pays a ' +
            'fresh hash and only pays a probe — in the floor\'s favour. ' +
            `${THE_WRITE_AROUND_THE_WALK} ${ONE_COMPILED_WALK}`,
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor' ? inertSide : primedUpdateSide(shippedDefault, resendUnchanged),
            floor: wanted === 'ours'
                ? inertSide
                : primedUpdateSide(withWriter(writeInPlaceWalking(askingASet)), resendUnchanged),
        }),
    },

    {
        id: 'alt.forbidden-name.call-vs-inlined.unchanged-resend',
        path: EPricePath.PerWrite,
        ours: 'updateEntity(slot, patch) — one shared predicate called from the walk',
        floor: 'REJECTED: name !== "__proto__" written into the walk, with no call at all',
        caveat:
            'THE ROW WHOSE EXPECTED ANSWER IS 1.00, STATED IN ADVANCE SO A RUN CAN REFUTE IT. ' +
            '`oimIsProtoKey` is module-level, monomorphic, one expression, no closure — the shape an ' +
            'optimiser removes — which is a claim that this ratio comes back inside the noise floor. ' +
            'If it does, centralising the rule is free; if it does not, the centralisation was ' +
            'bought with something. ' +
            'ONE OPERATION IS ONE UNCHANGED `updateEntity` OF SIXTEEN COLUMNS, so the difference is ' +
            'sixteen call frames per write against none. THE FLOOR IS NOT A DESIGN ANYBODY SHOULD ' +
            'SHIP: it is the duplicated comparison the rule was centralised out of, here as a ' +
            'measurement instrument — the isolated cost of a call level. ' +
            `${THE_WRITE_AROUND_THE_WALK} ${ONE_COMPILED_WALK}`,
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor' ? inertSide : primedUpdateSide(shippedDefault, resendUnchanged),
            floor: wanted === 'ours'
                ? inertSide
                : primedUpdateSide(withWriter(writeInPlaceWalking(comparingTheNameInline)), resendUnchanged),
        }),
    },

    /* ── 3. what counts as a change: a parameter, or the comparison inline ─ */

    {
        id: 'alt.equality-predicate.shared-default-vs-inlined.unchanged-resend',
        path: EPricePath.PerWrite,
        ours: 'updateEntity(slot, patch) — the shared default predicate, asked once per column',
        floor: 'REJECTED: SameValueZero written into the walk, with no parameter',
        caveat:
            'THE NEGATIVE READING A CALL-SITE DECISION IS OWED. The equality predicate is a ' +
            'parameter (`sameValueGuard`) so a caller can say what a change MEANS for their rows, ' +
            'and the argument for putting it on the hottest walk in the engine was that a shared ' +
            'default keeps the site monomorphic and therefore free. That is a ratio, and this row ' +
            'takes it. ' +
            'ONE OPERATION IS ONE UNCHANGED `updateEntity` OF A SIXTEEN-COLUMN ROW, primed outside the ' +
            'clock. Ours: 16 calls to `oimSameValueZeroGuard` through the shipped default writer\'s ' +
            'captured parameter. Floor: the same comparison — `a === b || (a !== a && b !== b)` — ' +
            '16 times inline. Both: 16 `oimIsProtoKey` calls, one `oimIsPlain`, no allocation, and the ' +
            'early return. THE UNCHANGED WRITE IS WHERE THE PREDICATE IS THE WHOLE COLUMN; read this ' +
            'as the predicate\'s largest share of a write and not as its typical one. ' +
            `${THE_WRITE_AROUND_THE_WALK} ${ONE_COMPILED_WALK}`,
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor' ? inertSide : primedUpdateSide(shippedDefault, resendUnchanged),
            floor: wanted === 'ours'
                ? inertSide
                : primedUpdateSide(withWriter(writeInPlaceWalking(withEqualityInlined)), resendUnchanged),
        }),
    },

    {
        id: 'alt.equality-predicate.shared-default-vs-inlined.with-a-second-comparator-present',
        path: EPricePath.PerWrite,
        ours: 'the same write, in a process where one other population has its own comparator',
        floor: 'REJECTED: SameValueZero written into the walk — nothing can spoil it',
        caveat:
            'THE HALF OF THE ALTERNATIVE THE ROW ABOVE CANNOT SEE. `createOIMEntityWriterInPlace` ' +
            'returns a closure over ONE compiled `patchEntityInPlace` and ONE `changedColumns`, so the ' +
            '`sameValueGuard(entity[name], source[name])` inside it is one call site for the whole ' +
            'process — and one population built with its own comparator makes it polymorphic for ' +
            'every population that did not. A design with no parameter cannot be spoiled that way. ' +
            'HOW THE SPOILER IS APPLIED, outside the clock: a second population of 64 rows is built ' +
            'with `createOIMEntityWriterInPlace({ sameValueGuard: caseInsensitiveEquality })` and ' +
            'written to in this side\'s `reset`, which is never timed. The timed body touches only ' +
            'the measured population, so the WORK on the two arms is identical and the difference ' +
            'from the row above is the state of one inline cache. THE FLOOR IS THE SAME FLOOR AS THE ' +
            'ROW ABOVE, deliberately. ' +
            'A CAVEAT AGAINST THIS ROW: nothing here forces V8 to keep the site polymorphic; if the ' +
            'two rows come back identical within the noise floor, that is the first thing to ' +
            'suspect and the second is that polymorphism at this site is genuinely free. ' +
            `${THE_WRITE_AROUND_THE_WALK} ${ONE_COMPILED_WALK}`,
        isolate: true,
        build: wanted => {
            const spoiledSide = (): TPriceSide => {
                const spoiler = wideWorld(
                    withWriter(createOIMEntityWriterInPlace({ sameValueGuard: caseInsensitiveEquality })),
                    64,
                );
                const spoilerPatch = makeWidePatch();
                let spoilRound = 0;
                return primedUpdateSide(shippedDefault, resendUnchanged, () => {
                    fillWidePatch(spoilerPatch, spoilRound++);
                    for (let i = 0; i < spoiler.slots.length; i++) {
                        spoiler.entityService.slotContentService.updateEntity(spoiler.slots[i], spoilerPatch as Partial<TWideRow>);
                    }
                    spoiler.db.flush();
                });
            };
            return {
                ours: wanted === 'floor' ? inertSide : spoiledSide(),
                floor: wanted === 'ours'
                    ? inertSide
                    : primedUpdateSide(withWriter(writeInPlaceWalking(withEqualityInlined)), resendUnchanged),
            };
        },
    },

    {
        id: 'alt.equality-predicate.row-comparator-vs-column-comparators.one-column-of-sixteen',
        path: EPricePath.PerWrite,
        ours: 'a population built with one comparator for the whole row — asked on all sixteen',
        floor: 'REJECTED: a map from column name to predicate, plain === for the other fifteen',
        caveat:
            'WHAT A CALLER REACHING FOR THE PARAMETER ALMOST ALWAYS ACTUALLY WANTS: the one column ' +
            'holding a value that needs more than `===` gets the comparison it needs without every ' +
            'other column of every row paying for it. Sixteen columns, one of which needs an ' +
            'equality that is not `===`, written both ways. ' +
            'ONE OPERATION IS ONE UNCHANGED `updateEntity` OF SIXTEEN COLUMNS. Ours: 16 calls to the row ' +
            'comparator, of which 15 return on its `a === b` first line and one runs the expensive ' +
            'body. Floor: 16 `Map.prototype.get` probes, 15 inline `===` comparisons, and one call ' +
            'into the same expensive body. THE DIFFERENCE IS FIFTEEN CALLS AGAINST SIXTEEN MAP ' +
            'PROBES; the expensive comparison is charged once to both arms and cancels. ' +
            'THE EXPENSIVE COMPARATOR IS A CASE-INSENSITIVE STRING COMPARE AND NOT A DEEP EQUAL, on ' +
            'purpose: a deeper comparator would raise both nanosecond columns by the same amount ' +
            'and pull the ratio toward 1.00, so this row is the map design\'s best case. ' +
            `${THE_WRITE_AROUND_THE_WALK} ${ONE_COMPILED_WALK}`,
        isolate: true,
        build: wanted => {
            const byColumn = new Map<string, TOIMSameValueGuard>([['c00', caseInsensitiveEquality]]);
            return {
                ours: wanted === 'floor'
                    ? inertSide
                    : primedUpdateSide(
                        withWriter(createOIMEntityWriterInPlace({ sameValueGuard: caseInsensitiveEquality })),
                        resendUnchanged,
                    ),
                floor: wanted === 'ours'
                    ? inertSide
                    : primedUpdateSide(
                        withWriter(writeInPlaceWalking(withAComparatorPerColumn(byColumn))),
                        resendUnchanged,
                    ),
            };
        },
    },

    /* ── 4. the slot literal: complete at birth, or grown on first use ──── */

    {
        id: 'alt.slot-literal.complete-vs-grown.mint-a-population',
        path: EPricePath.PerRelationship,
        ours: 'upsertEntity of a key that has none — the shipped fifteen-field entity slot literal',
        floor: 'REJECTED: a slot minted with its ten valued fields, the rest added on first use',
        caveat:
            'THE FIRST OF THE TWO READINGS THIS DECISION ASKS FOR, AND IT IS THE ONE THAT SHOULD GO ' +
            'AGAINST US. `createOIMEntitySlot` returns fifteen fields, five of them born' +
            '`undefined` — `effects`, `entity`, `columnSlotStore`, `data`, `indexKeys` — and the ' +
            'rejected design (a subclass overriding `createSlot`) leaves all five out and lets the ' +
            'engine add each on first assignment. So ours pays five stores per identity the floor ' +
            'does not, and if this row does not come back ABOVE 1.00 the two designs do not differ ' +
            'where the argument says they do. ' +
            'ONE OPERATION IS ONE `upsertEntity` OF A KEY THAT HAS NO VALUE — the whole first-load path: ' +
            '`writeContentByKey` minting the identity, the copying writer strategy, the store, the marks. ' +
            'The pass CONSUMES its fixture, so both sides declare `operationsPerPass` and rebuild an ' +
            'empty population in the untimed `reset`. ' +
            'ONE DIFFERENCE THAT IS NOT THE LITERAL, in the FLOOR\'S disfavour: on the floor ' +
            '`slot.entity =` ADDS a property rather than storing into one, a map transition per row ' +
            '— which is what "added on first use" means. ' +
            'WHAT THIS ROW CANNOT SAY is what the unused fields COST in bytes; that is ' +
            '`npm run retained`, and this pair does not stand in for it. ' +
            `${ONE_COMPILED_WALK}`,
        isolate: true,
        build: wanted => {
            const rows = makeWideRows(priceDataset.batch);
            const side = (makeEntityService: TMakeWideEntityService): TPriceSide => {
                let db = new OIMDB();
                let entityService = makeEntityService(db);
                let entityStoreSlot = entityService.createStoreSlot(db);
                return {
                    reset: () => {
                        db = new OIMDB();
                        entityService = makeEntityService(db);
                        entityStoreSlot = entityService.createStoreSlot(db);
                    },
                    operationsPerPass: rows.length,
                    run: times => {
                        for (let i = 0; i < times; i++) entityService.slotContentService.upsertEntity(entityStoreSlot, rows[i]);
                        db.flush();
                        priceSink.number = entityService.getSlotCount(entityStoreSlot);
                    },
                };
            };
            return {
                ours: wanted === 'floor' ? inertSide : side(shippedDefault),
                floor: wanted === 'ours' ? inertSide : side(grownSlots),
            };
        },
    },

    {
        id: 'alt.slot-literal.complete-vs-grown.write-a-partly-subscribed-population',
        path: EPricePath.PerWrite,
        ours: 'updateEntity on a loaded population whose every slot has one shape',
        floor: 'REJECTED: the same write where a slot’s shape depends on what has happened to it',
        caveat:
            'WHERE THE SHIPPED LITERAL IS SUPPOSED TO EARN THE FIVE STORES THE ROW ABOVE CHARGES IT ' +
            'FOR. "Every slot of a population settles on a single hidden class" is only worth ' +
            'anything if something later reads those slots through a site that would otherwise go ' +
            'polymorphic — which is the write path: `OIMChannelService.writeWithoutFlushCheck` reads ' +
            '`effects`, `changedAtRevision` and `changedAtEpoch`, and the collection reads `entity` ' +
            'and `isReleased`, all through one compiled body per method. ' +
            'THE POPULATION IS DELIBERATELY HETEROGENEOUS THE WAY A SCREEN MAKES IT SO: one row in ' +
            'eight carries an effect (`effectService.createEffect([slot], [], body)`), which is what a mounted ' +
            'view of a list looks like. On ours that changes no shape — `effects` was there from ' +
            'birth. On the floor the subscribed slots gain a property the rest do not have, so the ' +
            'population holds two shapes and every one of those reads sees both. ' +
            'ONE OPERATION IS ONE `updateEntity` MOVING ONE COLUMN of a sixteen-column row, and the ' +
            'subscribed eighth really is woken — both arms subscribe the same rows to the same ' +
            'shared body, so the delivery is inside both numbers and cancels. ' +
            'THE FLOOR IS AT ITS BEST WITH TWO SHAPES; a column hold (`columnSlotStore`) or an index ' +
            '(`indexKeys`) adds another at the same sites, so this reading is a LOWER BOUND on what ' +
            'the shipped literal buys. ' +
            `${ONE_COMPILED_WALK}`,
        isolate: true,
        build: wanted => {
            const onChange = (): void => {
                priceSink.number++;
            };
            const side = (makeEntityService: TMakeWideEntityService): TPriceSide => {
                const world = wideWorld(makeEntityService);
                for (let i = 0; i < world.slots.length; i += 8) {
                    world.effectService.createEffect(world.db, [world.slots[i]], [], onChange);
                }
                world.db.flush();
                let round = 1;
                return {
                    reset: () => undefined,
                    run: times => {
                        const slotContentService = world.entityService.slotContentService;
                        const slots = world.slots;
                        const db = world.db;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(slots.length, times - done);
                            const c00 = priceDataset.titles[round++ & 7];
                            for (let i = 0; i < upTo; i++) slotContentService.updateEntity(slots[i], { c00 });
                            db.flush();
                            done += upTo;
                        }
                    },
                };
            };
            return {
                ours: wanted === 'floor' ? inertSide : side(shippedDefault),
                floor: wanted === 'ours' ? inertSide : side(grownSlots),
            };
        },
    },

    /* ── 5. the replacing build: decide first, or build as you walk ─────── */

    {
        id: 'alt.replacing-build.decide-first-vs-build-as-you-walk.unchanged-resend',
        path: EPricePath.PerWrite,
        ours: 'the replacing writer: walk, find nothing moved, allocate nothing',
        floor: 'REJECTED: copy the row up front, assign what moved, store the copy regardless',
        caveat:
            'THE WRITE THE SHIPPED ORDER EXISTS FOR. "Decide before you allocate" only differs from ' +
            '"build as you walk" on a write that moves NOTHING, and there it differs completely: ' +
            'ours returns false having allocated neither a row nor a names ' +
            'array, and the floor has already spread the row before it could know. ' +
            'ONE OPERATION IS ONE UNCHANGED `updateEntity` OF A SIXTEEN-COLUMN ROW, primed outside the ' +
            'clock. Both arms: 16 `oimIsProtoKey` calls, 16 equality calls, one `oimIsPlain`, no mark. The ' +
            'floor allocates one seventeen-property record, copies seventeen values into it and ' +
            'stores it on the slot — per write, abandoned. THE COPY IS STORED, so it escapes and V8 ' +
            'cannot elide it; storing it is also the faithful reading of the rejected design, which ' +
            'has no decision point at which to withhold the copy — and so hands readers a new ' +
            'reference on an unchanged write. THIS ROW MEASURES WHAT THAT COSTS AND NOT WHETHER IT ' +
            'IS ACCEPTABLE. Read with the `every-column-moved` row beside it. ' +
            `${THE_WRITE_AROUND_THE_WALK} ${ONE_COMPILED_WALK}`,
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor'
                ? inertSide
                : primedUpdateSide(withWriter(createOIMEntityWriterReplacing()), resendUnchanged),
            floor: wanted === 'ours'
                ? inertSide
                : primedUpdateSide(withWriter(writeReplacingBuildingAsItWalks()), resendUnchanged),
        }),
    },

    {
        id: 'alt.replacing-build.decide-first-vs-build-as-you-walk.every-column-moved',
        path: EPricePath.PerWrite,
        ours: 'the replacing writer: walk to decide, then one spread and one store per moved column',
        floor: 'REJECTED: one spread of the entity up front, then assign each column as it is found',
        caveat:
            'WHAT THE SHIPPED ORDER COSTS WHEN THE WRITE REALLY CHANGES SOMETHING — a re-hydration, ' +
            'where every write changes something. ' +
            'ONE OPERATION IS ONE `updateEntity` MOVING ALL SIXTEEN COLUMNS. Both arms: 16 `oimIsProtoKey` ' +
            'calls, 16 equality calls, one changed-names array with 16 pushes, the marks, and ' +
            'exactly ONE record allocated with 17 values spread and 16 stored. The difference is ' +
            'that ours walks the patch to decide and then loops the 16 recorded names a second time ' +
            'to store them, where the floor stores as it walks. ' +
            'IF IT COMES BACK NEAR 1.00 the second loop is worth nothing and the rejected design ' +
            'loses on its own ground as well as on the unchanged-write contract. ' +
            `${THE_WRITE_AROUND_THE_WALK} ${ONE_COMPILED_WALK}`,
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor'
                ? inertSide
                : primedUpdateSide(withWriter(createOIMEntityWriterReplacing()), moveEveryColumn),
            floor: wanted === 'ours'
                ? inertSide
                : primedUpdateSide(withWriter(writeReplacingBuildingAsItWalks()), moveEveryColumn),
        }),
    },

    {
        id: 'alt.replacing-build.assign-the-moved-vs-spread-the-patch.one-column-of-sixteen',
        path: EPricePath.PerWrite,
        ours: 'the replacing writer: { ...entity }, then one store per column the walk recorded',
        floor: 'REJECTED: { ...entity, ...source } — the whole patch spread over the copy',
        caveat:
            'THE ARMS OF THIS QUESTION SWAPPED SIDES. The shipped replacing writer used to spread ' +
            'the whole patch over the copy; `createOIMEntityWriterReplacing` now assigns only the ' +
            'names `changedColumns` recorded, so the spread is the rejected arm. ONE OPERATION IS ONE ' +
            '`updateEntity` CARRYING SIXTEEN COLUMNS OF WHICH EXACTLY ONE HAS MOVED — the shape a socket ' +
            're-sending a whole row produces, and the shape that makes the two designs differ most. ' +
            'OPERATION COUNT. Both arms: the same `changedColumns` walk — 16 `oimIsProtoKey` calls, 16 ' +
            'equality calls, one names array with ONE push — the marks, and one record allocated. ' +
            'Ours then copies 17 values from the entity and does ONE store. The floor copies 17 from ' +
            'the entity and 16 from the patch — 33 stores, 15 of them writing a value the copy ' +
            'already held. THE DIFFERENCE IS SIXTEEN PROPERTY COPIES AGAINST ONE, per write. ' +
            'WHAT THE SPREAD WOULD BUY, and it is not a number: a caller\'s `sameValueGuard` may ' +
            'call two different objects equal, and the spread then stores the NEWER one while ' +
            'reporting nothing moved, where the shipped form keeps the older one. ' +
            'ONLY `c00` ADVANCES, by one of eight per pass; the other fifteen columns hold the values ' +
            'the population was primed with. ' +
            `${THE_WRITE_AROUND_THE_WALK} ${ONE_COMPILED_WALK}`,
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor'
                ? inertSide
                : primedUpdateSide(withWriter(createOIMEntityWriterReplacing()), moveOneColumn),
            floor: wanted === 'ours'
                ? inertSide
                : primedUpdateSide(withWriter(writeReplacingSpreadingThePatch()), moveOneColumn),
        }),
    },

    /* ── 6. a replaced row: rebuilt from survivors, or spread and deleted ─ */

    {
        id: 'alt.replacement-rebuild.survivors-vs-spread-and-delete.the-removal',
        path: EPricePath.PerWrite,
        ours: 'upsertEntity of a row missing one column — the replacement is built from the survivors',
        floor: 'REJECTED: { ...entity }, then delete the departing column off the copy',
        caveat:
            'The shipped side is the replacing `putEntity`: one pass over the stored row with a ' +
            '`hasOwnProperty` on the incoming value per column, and ONE new object built from the ' +
            'survivors. The rejected side keeps the two-step put the engine used to run — its ' +
            'spread-and-`delete` removal, then the shipped replacing `patchEntity`, which spreads a ' +
            'second copy — so it pays two objects where ours pays one. ' +
            'ONE OPERATION IS ONE `upsertEntity` OF A ROW THE POPULATION ALREADY HAS, and the passes ' +
            'ALTERNATE: a value without `c15`, then the whole value again — a column can only leave ' +
            'a row once. Both sides write the row to the channel once per upsert. ' +
            'THE SURROUNDING `upsertEntity` IS INSIDE BOTH NUMBERS — the marks and the ' +
            'content-change call — so the ratio is a LOWER BOUND on the difference between the two ' +
            'rebuilds. READINGS TAKEN BEFORE THE ENGINE HAD `putEntity` priced a different shipped ' +
            'side and do not describe this one. ' +
            'WHAT THIS ROW DOES NOT MEASURE is what the shipped side buys, which falls on every ' +
            'later READ of a row the `delete` took out of its shape. That is the row below. ' +
            `${ONE_COMPILED_WALK}`,
        isolate: true,
        build: wanted => {
            const side = (write: IOIMEntityWriter): TPriceSide => {
                const world = wideWorld(withWriter(write));
                const shortRows: TWideRow[] = [];
                for (let i = 0; i < world.rows.length; i++) {
                    const short: Record<string, unknown> = { ...world.rows[i] };
                    delete short.c15;
                    shortRows.push(short as TWideRow);
                }
                world.entityService.slotContentService.upsertEntity(world.entityStoreSlot, shortRows[0]);
                world.entityService.slotContentService.upsertEntity(world.entityStoreSlot, world.rows[0]);
                world.db.flush();
                if (world.slots[0].entity?.c15 !== world.rows[0].c15) {
                    throw new Error('alternatives: a column that left and came back did not come back.');
                }
                let whole = false;
                return {
                    reset: () => undefined,
                    run: times => {
                        const { entityService, entityStoreSlot } = world;
                        const rows = world.rows;
                        const db = world.db;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(rows.length, times - done);
                            whole = !whole;
                            if (whole) {
                                for (let i = 0; i < upTo; i++) entityService.slotContentService.upsertEntity(entityStoreSlot, rows[i]);
                            } else {
                                for (let i = 0; i < upTo; i++) entityService.slotContentService.upsertEntity(entityStoreSlot, shortRows[i]);
                            }
                            db.flush();
                            done += upTo;
                        }
                    },
                };
            };
            return {
                ours: wanted === 'floor' ? inertSide : side(createOIMEntityWriterReplacing()),
                floor: wanted === 'ours' ? inertSide : side(writeReplacingSpreadingAndDeleting()),
            };
        },
    },

    {
        id: 'alt.replacement-rebuild.survivors-vs-spread-and-delete.read-after',
        path: EPricePath.PerRead,
        ours: 'read a surviving column off a replacement built empty and filled with survivors',
        floor: 'REJECTED: the same read off a replacement spread and then deleted from',
        caveat:
            'THE SECOND READING, AND THE ONE THE SHIPPED SIDE IS BUYING. `delete` on a plain object ' +
            'takes it out of the shape its population shares, and the rejected rebuild would hand ' +
            'readers a replacement born in that state on every removal. That cost is paid PER READ, ' +
            'for the life of the row. ' +
            'ONE OPERATION IS ONE PROPERTY READ of a SURVIVING column (`c07`) off one stored row, ' +
            'walked through the whole population with a mask. Every row of both populations has been ' +
            'through the same whole-row `upsertEntity` missing `c15`; ours built the replacement in the ' +
            'shipped replacing `putEntity`, the rejected one spread it and `delete`d `c15`. THE WORK IS ' +
            'IDENTICAL AND THE SHAPES ARE NOT. A SURVIVING COLUMN AND NOT THE REMOVED ONE, ' +
            'deliberately: `c15` reads `undefined` on both sides and would measure a miss. EVERY ROW ' +
            'LOST THE COLUMN, so each arm sees exactly one shape — the conservative form. ' +
            `${READ_ARMS_ARE_SEPARATE_BODIES}`,
        build: () => readSides(
            populationThatLostAColumn(createOIMEntityWriterReplacing(), 1),
            populationThatLostAColumn(writeReplacingSpreadingAndDeleting(), 1),
        ),
    },

    /* ── 7. a column that left: deleted, or blanked ─────────────────────── */

    {
        id: 'alt.column-left.delete-vs-blank.read-every-row-lost-a-column',
        path: EPricePath.PerRead,
        ours: 'read a surviving column off an in-place row the engine deleted a column from',
        floor: 'REJECTED: the same read off a row whose departed column was set to undefined',
        caveat:
            'EXPECTED TO GO AGAINST THE SHIPPED DESIGN. The blanked form keeps the hidden class its ' +
            'population settled on; the shipped in-place `putEntity` `delete`s and every later ' +
            'read pays for it. ' +
            'ONE OPERATION IS ONE PROPERTY READ of a SURVIVING column (`c07`) off one stored row, ' +
            'walked through the whole population with a mask. Both populations were loaded ' +
            'identically and given the same whole-row `upsertEntity` missing `c15`; ours ran the shipped ' +
            'in-place `putEntity`, which `delete`s it, the rejected one set it to `undefined`. The stored ' +
            'object is the SAME OBJECT on the in-place path on both arms. ' +
            'WHAT THE BLANKED FORM CANNOT DO, and it is not visible in this number: `c15` stays an ' +
            'own property, so the next whole-row `upsertEntity` finds the same column leaving again, ' +
            'reports it removed again and wakes its subscribers again — and a column a caller ' +
            'deliberately stored as `undefined` would stop being distinguishable from one that left. ' +
            `${READ_ARMS_ARE_SEPARATE_BODIES}`,
        build: () => readSides(
            populationThatLostAColumn(undefined, 1),
            populationThatLostAColumn(writeInPlaceBlanking(), 1),
        ),
    },

    {
        id: 'alt.column-left.delete-vs-blank.read-one-row-in-eight-lost-a-column',
        path: EPricePath.PerRead,
        ours: 'the same read where one row in eight was deleted from — two shapes in one population',
        floor: 'REJECTED: the same population blanked instead — one shape throughout',
        caveat:
            'THE POPULATION AN APPLICATION ACTUALLY HAS, AND THE SECOND THING THE SHIPPED `delete` ' +
            'COSTS. Here one row in eight has lost a column and seven have not, so ours reads ' +
            'through a site that sees two shapes while the floor\'s sees one — a blanked population ' +
            'cannot fragment. ' +
            'ONE OPERATION IS ONE PROPERTY READ of `c07` off one stored row, over the whole ' +
            'population with a mask. Both arms read the same column of the same rows in the same ' +
            'order and differ only in what the removal did. READ AGAINST THE ROW ABOVE: that one ' +
            'isolates the cost of the shape, this one adds the cost of two shapes at one site. ' +
            `${READ_ARMS_ARE_SEPARATE_BODIES}`,
        build: () => readSides(
            populationThatLostAColumn(undefined, 8),
            populationThatLostAColumn(writeInPlaceBlanking(), 8),
        ),
    },
];
