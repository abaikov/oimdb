// Prose: ./README.md#alternativepairsidentitystore
import { EPricePath } from './EPricePath';
import { priceDataset } from './priceDataset';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';
import { OIM_SLOT_FLAG_EMPTY } from '../../../core/src/engine/slot/constants/OIM_SLOT_FLAG_EMPTY';

const ROWS = priceDataset.batch;

type TStandingEffect = { ran: number };

type TShapeSlot = {
    effects: TStandingEffect[] | undefined;
    changedAtRevision: number;
    changedAtEpoch: number;
    effectEdges: number[] | undefined;
    holdCount: number;
    releaseDueAfterWriteMs: number;
    releaseDueAfterIdleMs: number;
    releaseDueAfterUnholdMs: number;
    slotFlags: number;
    owner: unknown;
    key: string;
    entity: TPriceDataRow | undefined;
    columnSlotStore: unknown;
    storeSlot: unknown;
    data: unknown;
    indexKeys: unknown;
};

const mintSlot = (key: string, entity: TPriceDataRow | undefined): TShapeSlot => ({
    effects: undefined, changedAtRevision: 0, changedAtEpoch: 0, effectEdges: undefined, holdCount: 0,
    releaseDueAfterWriteMs: -1, releaseDueAfterIdleMs: -1, releaseDueAfterUnholdMs: -1, slotFlags: entity === undefined ? OIM_SLOT_FLAG_EMPTY : 0,
    owner: null, key, entity, columnSlotStore: undefined, storeSlot: undefined, data: undefined, indexKeys: undefined,
});

const shapeClock = { revision: 0, epoch: 0 };

const stampAndDeliver = (slot: TShapeSlot): void => {
    shapeClock.revision++;
    slot.changedAtRevision = shapeClock.revision;
    slot.changedAtEpoch = shapeClock.epoch;
    const effects = slot.effects;
    if (effects === undefined) return;
    for (let i = 0; i < effects.length; i++) effects[i].ran++;
};

const makeVariants = (): TPriceDataRow[][] => {
    const base = priceDataset.makeRows(ROWS);
    const variants: TPriceDataRow[][] = [[], []];
    for (let v = 0; v < 2; v++) {
        for (let i = 0; i < base.length; i++) variants[v].push({ ...base[i], title: priceDataset.titles[v] });
    }
    return variants;
};

const loadOneMap = (rows: readonly TPriceDataRow[]): Map<string, TShapeSlot> => {
    const slots = new Map<string, TShapeSlot>();
    for (let i = 0; i < rows.length; i++) slots.set(rows[i].id, mintSlot(rows[i].id, rows[i]));
    return slots;
};

const loadRowMap = (rows: readonly TPriceDataRow[]): Map<string, TPriceDataRow> => {
    const byId = new Map<string, TPriceDataRow>();
    for (let i = 0; i < rows.length; i++) byId.set(rows[i].id, rows[i]);
    return byId;
};

const assertStoresAgree = (
    slots: Map<string, TShapeSlot>, byId: Map<string, TPriceDataRow>, keys: readonly string[],
): void => {
    for (let i = 0; i < keys.length; i++) {
        if (slots.get(keys[i])?.entity === byId.get(keys[i])) continue;
        throw new Error(`price: the one-map and two-map stores disagree on "${keys[i]}".`);
    }
};

export const alternativePairsIdentityStore: readonly TPricePair[] = [
    {
        id: 'alt.identity-store.one-map-vs-two.write-with-nobody-subscribed',
        path: EPricePath.PerRowPerWrite,
        ours: 'map.set(key, slot) — mint the identity and put the row on it, one map',
        floor: 'rows.set(key, row) — and skip an identity map that is still empty',
        caveat:
            'A FIRST LOAD INTO AN EMPTY STORE, THE ROW THE TWO-MAP SHAPE WINS. Ours mints a slot ' +
            'per row and files it; the floor files the bare row and tests the identity map\'s ' +
            'size, which is zero, so it mints nothing. Both stores are rebuilt between passes, ' +
            'untimed, and the minted slots are collected outside the clock. Above one is expected ' +
            'and is the case for the rejected shape; read it with the overwrite row.',
        build: () => {
            const rows = priceDataset.makeRows(ROWS);
            let slots = new Map<string, TShapeSlot>();
            let byId = new Map<string, TPriceDataRow>();
            let identities = new Map<string, TShapeSlot>();
            return {
                ours: {
                    operationsPerPass: ROWS,
                    reset: () => { slots = new Map<string, TShapeSlot>(); },
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            const row = rows[i];
                            slots.set(row.id, mintSlot(row.id, row));
                        }
                        priceSink.number = slots.size;
                    },
                },
                floor: {
                    operationsPerPass: ROWS,
                    reset: () => {
                        byId = new Map<string, TPriceDataRow>();
                        identities = new Map<string, TShapeSlot>();
                    },
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            const row = rows[i];
                            byId.set(row.id, row);
                            if (identities.size === 0) continue;
                            const slot = identities.get(row.id);
                            if (slot !== undefined) stampAndDeliver(slot);
                        }
                        priceSink.number = byId.size;
                    },
                },
            };
        },
    },

    {
        id: 'alt.identity-store.one-map-vs-two.read-the-row-by-key',
        path: EPricePath.PerRead,
        ours: 'map.get(key)?.entity',
        floor: 'rows.get(key)',
        caveat:
            'ONE INDIRECTION MORE ON OUR SIDE: the row sits on the slot, so a read by key is a ' +
            'hash and a field load where the two-map store answers with the hash alone. Every key ' +
            'hits on both sides, and both stores were checked to hand back the same row object ' +
            'for every key before the clock started.',
        build: () => {
            const rows = priceDataset.makeRows(ROWS);
            const keys = rows.map(row => row.id);
            const slots = loadOneMap(rows);
            const byId = loadRowMap(rows);
            assertStoresAgree(slots, byId, keys);
            const mask = ROWS - 1;
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) priceSink.ours = slots.get(keys[i & mask])?.entity;
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) priceSink.floor = byId.get(keys[i & mask]);
                    },
                },
            };
        },
    },

    {
        id: 'alt.identity-store.one-map-vs-two.overwrite-while-one-subscriber-stands',
        path: EPricePath.PerRowPerWrite,
        ours: 'slot = map.get(key); slot.entity = row; stamp and deliver',
        floor: 'rows.set(key, row); then identities.get(key) because that map is no longer empty',
        caveat:
            'WHERE THE BILL FOR TWO MAPS ARRIVES. One subscriber stands on one key, mounted before ' +
            'the clock, so the identity map is not empty and EVERY write on the floor pays a ' +
            'second hash to learn whether its key is watched; ours resolved the slot with the ' +
            'one hash it needed to write, and the subscriber list is a field on it. Exactly one ' +
            'write per pass lands on the watched row and is delivered on both sides, so the ' +
            'difference is the per-row probe and not the delivery. Values alternate between two ' +
            'prepared sets, so no write re-sends what the store holds. Below one is the shipped ' +
            'shape winning.',
        build: () => {
            const variants = makeVariants();
            const keys = variants[0].map(row => row.id);
            const slots = loadOneMap(variants[0]);
            const byId = loadRowMap(variants[0]);
            const identities = new Map<string, TShapeSlot>();
            const watchedKey = keys[0];
            const oursEffect: TStandingEffect = { ran: 0 };
            const floorEffect: TStandingEffect = { ran: 0 };
            const watchedSlot = slots.get(watchedKey);
            if (watchedSlot === undefined) throw new Error('price: the watched row was never loaded.');
            watchedSlot.effects = [oursEffect];
            const floorIdentity = mintSlot(watchedKey, undefined);
            floorIdentity.effects = [floorEffect];
            identities.set(watchedKey, floorIdentity);
            assertStoresAgree(slots, byId, keys);
            let round = 0;
            let floorRound = 0;
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        let done = 0;
                        while (done < times) {
                            const source = variants[++round & 1];
                            const upTo = Math.min(source.length, times - done);
                            for (let i = 0; i < upTo; i++) {
                                const row = source[i];
                                const slot = slots.get(row.id);
                                if (slot === undefined) continue;
                                slot.entity = row;
                                stampAndDeliver(slot);
                            }
                            done += upTo;
                        }
                        priceSink.number = oursEffect.ran;
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        let done = 0;
                        while (done < times) {
                            const source = variants[++floorRound & 1];
                            const upTo = Math.min(source.length, times - done);
                            for (let i = 0; i < upTo; i++) {
                                const row = source[i];
                                byId.set(row.id, row);
                                if (identities.size === 0) continue;
                                const slot = identities.get(row.id);
                                if (slot !== undefined) stampAndDeliver(slot);
                            }
                            done += upTo;
                        }
                        priceSink.number = floorEffect.ran;
                    },
                },
            };
        },
    },

    {
        id: 'alt.identity-store.one-map-vs-two.resolve-a-key-to-an-identity',
        path: EPricePath.PerRelationship,
        ours: 'map.get(key) — the identity already exists, the row is on it',
        floor: 'identities.get(key) ?? mint and file one — the first subscription to that key',
        caveat:
            'A SUBSCRIPTION TURNING A KEY INTO AN IDENTITY, the first time each key is asked. Ours ' +
            'minted every identity at the load, so a resolve is one hash; the two-map store mints ' +
            'on demand, so the first resolve of a key is a miss, a mint and a second `Map.set`. ' +
            'The floor\'s identity map is emptied between passes, untimed, so every pass is that ' +
            'first resolve; a key resolved twice would cost the floor one hash, as ours. The mint ' +
            'ours paid at the load is priced by the write row, not here.',
        build: () => {
            const rows = priceDataset.makeRows(ROWS);
            const keys = rows.map(row => row.id);
            const slots = loadOneMap(rows);
            let identities = new Map<string, TShapeSlot>();
            return {
                ours: {
                    operationsPerPass: ROWS,
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) priceSink.ours = slots.get(keys[i]);
                    },
                },
                floor: {
                    operationsPerPass: ROWS,
                    reset: () => { identities = new Map<string, TShapeSlot>(); },
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            const key = keys[i];
                            let slot = identities.get(key);
                            if (slot === undefined) {
                                slot = mintSlot(key, undefined);
                                identities.set(key, slot);
                            }
                            priceSink.floor = slot;
                        }
                    },
                },
            };
        },
    },
];
