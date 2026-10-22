import { createOIMEntityWriterInPlace, oimSameValueZeroGuard } from '../../../core/src/index';
import type { IOIMEntityWriter, TOIMEntitySlot } from '../../../core/src/index';
import { EPricePath } from './EPricePath';
import { priceDataset } from './priceDataset';
import { priceCollectionFixture, priceFixture } from './priceFixture';
import { priceRoundSide } from './priceRoundSide';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';

const ENTITIES = 1024;

type TPatchWalk = (slot: TOIMEntitySlot, patch: object, changedColumnNames: string[] | undefined) => boolean;

const patchByBareForIn: TPatchWalk = (slot, patch, changedColumnNames) => {
    const entity = slot.entity as Record<string, unknown> | undefined;
    if (entity === undefined) return false;
    const source = patch as Record<string, unknown>;
    let isWritten = false;
    for (const name in source) {
        if (oimSameValueZeroGuard(entity[name], source[name])) continue;
        entity[name] = source[name];
        isWritten = true;
        if (changedColumnNames !== undefined) changedColumnNames.push(name);
    }
    return isWritten;
};

const patchByObjectKeys: TPatchWalk = (slot, patch, changedColumnNames) => {
    const entity = slot.entity as Record<string, unknown> | undefined;
    if (entity === undefined) return false;
    const source = patch as Record<string, unknown>;
    const names = Object.keys(source);
    let isWritten = false;
    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        if (oimSameValueZeroGuard(entity[name], source[name])) continue;
        entity[name] = source[name];
        isWritten = true;
        if (changedColumnNames !== undefined) changedColumnNames.push(name);
    }
    return isWritten;
};

const putByBareWalks = (slot: TOIMEntitySlot, next: object, changedColumnNames: string[] | undefined): boolean => {
    const previous = slot.entity as Record<string, unknown> | undefined;
    if (previous === undefined) return false;
    let isWritten = patchByBareForIn(slot, next, changedColumnNames);
    for (const name in previous) {
        if (Object.prototype.hasOwnProperty.call(next, name)) continue;
        if (previous[name] === undefined) continue;
        previous[name] = undefined;
        isWritten = true;
        if (changedColumnNames !== undefined) changedColumnNames.push(name);
    }
    return isWritten;
};

const shippedInPlace = (): IOIMEntityWriter => createOIMEntityWriterInPlace();

const unguardedPatch = (patchEntity: TPatchWalk): IOIMEntityWriter => ({ ...createOIMEntityWriterInPlace(), patchEntity });

const unguardedPut = (): IOIMEntityWriter => ({
    ...createOIMEntityWriterInPlace(),
    patchEntity: patchByBareForIn,
    putEntity: putByBareWalks,
});

type TPatchOf = (round: number) => Partial<TPriceDataRow>;

const oneFieldPatches: TPatchOf = round => ({ title: priceDataset.titles[round & 7] });
const threeFieldPatches: TPatchOf = round => ({
    title: priceDataset.titles[round & 7],
    note: priceDataset.titles[(round + 3) & 7],
    rank: round,
});

type TCollectionFixture<TEntity extends { id: string }> = ReturnType<typeof priceCollectionFixture<TEntity>>;

const updateSide = <TEntity extends { id: string }>(
    fixture: TCollectionFixture<TEntity>,
    patches: readonly Partial<TEntity>[],
): TPriceSide => priceRoundSide(fixture.slots.length, (upTo, round) => {
    const slots = fixture.slots;
    const slotContentService = fixture.entityService.slotContentService;
    const patch = patches[round & 7];
    for (let i = 0; i < upTo; i++) slotContentService.updateEntity(slots[i], patch);
    priceSink.flag = slots[0].entity !== undefined;
}, () => fixture.db.flush());

const upsertSide = <TEntity extends { id: string }>(
    fixture: TCollectionFixture<TEntity>,
    versions: readonly (readonly TEntity[])[],
): TPriceSide => priceRoundSide(fixture.slots.length, (upTo, round) => {
    const { entityService, entityStoreSlot } = fixture;
    const slotContentService = entityService.slotContentService;
    const entities = versions[round & 7];
    for (let i = 0; i < upTo; i++) slotContentService.upsertEntity(entityStoreSlot, entities[i]);
    priceSink.flag = fixture.slots[0].entity !== undefined;
}, () => fixture.db.flush());

const narrowUpdateSide = (writer: IOIMEntityWriter, patchOf: TPatchOf): TPriceSide =>
    updateSide(priceFixture(ENTITIES, writer), [0, 1, 2, 3, 4, 5, 6, 7].map(patchOf));

const narrowUpsertSide = (writer: IOIMEntityWriter): TPriceSide => {
    const fixture = priceFixture(ENTITIES, writer);
    return upsertSide(fixture, [0, 1, 2, 3, 4, 5, 6, 7].map(version =>
        fixture.rows.map(row => ({ ...row, title: priceDataset.titles[version] }))));
};

const GUARDS =
    'The guards are the `__proto__` key check and the own-key check (`hasOwnProperty`) the shipped walk runs on every key of the patch. '
    + 'Both sides write through the shipped OIMSlotContentEntityService (entityService.slotContentService) with no index and no subscriber, so the write is one channel write and opens no subframe; '
    + 'only the writer differs. The same-value guard stays on both sides: it is a strategy already (`sameValueGuard`), not part of what is priced here.';

const patchGuardPair = (fields: string, patchOf: TPatchOf, walkName: string, walk: TPatchWalk): TPricePair => ({
    id: `alt.patch-guards.for-in-guarded-vs-${walkName}.${fields}`,
    path: EPricePath.PerWrite,
    ours: `entityService.updateEntity(slot, patch) with the shipped in-place writer — ${fields}, guarded for…in`,
    floor: `the same update with a writer whose patch walk is ${walkName === 'bare' ? 'a for…in with no guard' : 'Object.keys with no guard'}`,
    caveat: GUARDS,
    build: () => ({ ours: narrowUpdateSide(shippedInPlace(), patchOf), floor: narrowUpdateSide(unguardedPatch(walk), patchOf) }),
});

type TWideEntity = Record<string, unknown> & { id: string };

const wideColumnNames = (columns: number): string[] => Array.from({ length: columns }, (_, i) => `c${i}`);

const wideEntity = (id: string, names: readonly string[], version: number): TWideEntity => {
    const entity: TWideEntity = { id };
    for (let i = 0; i < names.length; i++) entity[names[i]] = priceDataset.titles[(version + i) & 7];
    return entity;
};

const WIDE_IDS = Array.from({ length: ENTITIES }, (_, i) => `w${i}`);

const wideUpdateSide = (columns: number, writer: IOIMEntityWriter): TPriceSide => {
    const names = wideColumnNames(columns);
    return updateSide(
        priceCollectionFixture(WIDE_IDS.map(id => wideEntity(id, names, 0)), writer),
        [1, 2, 3, 4, 5, 6, 7, 8].map(version => {
            const { id: _id, ...patch } = wideEntity('', names, version);
            return patch;
        }),
    );
};

const wideUpsertSide = (columns: number, writer: IOIMEntityWriter): TPriceSide => {
    const names = wideColumnNames(columns);
    return upsertSide(
        priceCollectionFixture(WIDE_IDS.map(id => wideEntity(id, names, 0)), writer),
        [1, 2, 3, 4, 5, 6, 7, 8].map(version => WIDE_IDS.map(id => wideEntity(id, names, version))),
    );
};

const wideGuardPairs = (columns: number): TPricePair[] => [
    {
        id: `alt.patch-guards.for-in-guarded-vs-bare.${columns}-column-entity`,
        path: EPricePath.PerWrite,
        ours: `entityService.updateEntity(slot, patch) on a ${columns}-column entity, the patch moving every column — shipped in-place writer, guarded for…in`,
        floor: 'the same update with a writer whose patch walk is a for…in with no guard',
        caveat: GUARDS,
        build: () => ({ ours: wideUpdateSide(columns, shippedInPlace()), floor: wideUpdateSide(columns, unguardedPatch(patchByBareForIn)) }),
    },
    {
        id: `alt.put-guards.guarded-vs-bare.${columns}-column-entity`,
        path: EPricePath.PerWrite,
        ours: `entityService.upsertEntity(storeSlot, entity) on a key holding a ${columns}-column entity, every column moving — shipped in-place writer, guarded walks`,
        floor: 'the same upsert with a writer whose patch and departure walks run no guard',
        caveat: `${GUARDS} A put runs two walks: the new columns, then the stored columns the new value does not carry.`,
        build: () => ({ ours: wideUpsertSide(columns, shippedInPlace()), floor: wideUpsertSide(columns, unguardedPut()) }),
    },
];

export const alternativePairsWriteGuards: readonly TPricePair[] = [
    ...wideGuardPairs(10),
    ...wideGuardPairs(30),
    ...wideGuardPairs(100),
    patchGuardPair('1-field', oneFieldPatches, 'bare', patchByBareForIn),
    patchGuardPair('3-field', threeFieldPatches, 'bare', patchByBareForIn),
    patchGuardPair('1-field', oneFieldPatches, 'object-keys', patchByObjectKeys),
    patchGuardPair('3-field', threeFieldPatches, 'object-keys', patchByObjectKeys),
    {
        id: 'alt.put-guards.guarded-vs-bare',
        path: EPricePath.PerWrite,
        ours: 'entityService.upsertEntity(storeSlot, row) on a key that holds a value — the shipped in-place writer, guarded walks',
        floor: 'the same upsert with a writer whose patch and departure walks run no guard',
        caveat: `${GUARDS} A put runs two walks: the new columns, then the stored columns the new value does not carry.`,
        build: () => ({ ours: narrowUpsertSide(shippedInPlace()), floor: narrowUpsertSide(unguardedPut()) }),
    },
];
