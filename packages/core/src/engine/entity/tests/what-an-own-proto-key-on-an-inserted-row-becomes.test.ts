import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMEntityWriterInPlace } from '../../../factories/createOIMEntityWriterInPlace';
import { createOIMEntityWriterReplacing } from '../../../factories/createOIMEntityWriterReplacing';
import { oimInsertEntityWithoutCopy } from '../utils/oimInsertEntityWithoutCopy';
import { oimInsertEntityWithSanitizedCopy } from '../utils/oimInsertEntityWithSanitizedCopy';
import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import type { TOIMEntityInsertStrategy } from '../types/TOIMEntityInsertStrategy';
import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';

type TRow = { id: string; n: number; label?: string };

const PROTO_KEY = '__proto__';

const reachedThroughTheChain = { polluted: true };

const ownProtoKey = (entity: object): object => {
    Object.defineProperty(entity, PROTO_KEY, {
        value: reachedThroughTheChain, enumerable: true, writable: true, configurable: true,
    });
    return entity;
};

type TCase = { named: string; handed: () => TRow; handedCarriesTheKey: boolean };

const cases: readonly TCase[] = [
    {
        named: 'an own __proto__ defined on a plain object',
        handed: () => ownProtoKey({ id: 'r1', n: 1 }) as TRow,
        handedCarriesTheKey: true,
    },
    {
        named: 'an own __proto__ parsed out of a payload',
        handed: () => JSON.parse(`{"id":"r1","n":1,"${PROTO_KEY}":{"polluted":true}}`) as TRow,
        handedCarriesTheKey: true,
    },
    {
        named: 'a prototype set on the object handed in',
        handed: () => Object.setPrototypeOf({ id: 'r1', n: 1 }, reachedThroughTheChain) as TRow,
        handedCarriesTheKey: false,
    },
    {
        named: 'a null-prototype object carrying an own __proto__',
        handed: () => {
            const handed = Object.create(null) as TRow;
            handed.id = 'r1';
            handed.n = 1;
            return ownProtoKey(handed) as TRow;
        },
        handedCarriesTheKey: true,
    },
    {
        named: 'a null-prototype object carrying nothing but its columns',
        handed: () => {
            const handed = Object.create(null) as TRow;
            handed.id = 'r1';
            handed.n = 1;
            return handed;
        },
        handedCarriesTheKey: false,
    },
];

const spreadWithoutDeletingTheKey: TOIMEntityInsertStrategy = <TEntity extends object>(
    slot: TOIMEntitySlot<TEntity>, entity: TEntity,
): void => {
    (slot as TOIMSlotEditable<TOIMEntitySlot<TEntity>>).entity = { ...entity };
};

const rowsFilledBy = (entityInsertStrategy: TOIMEntityInsertStrategy) => {
    const db = new OIMDB();
    const rowsService = createOIMEntityService<TRow>(db, {
        keyOf: (row: TRow) => row.id,
        entityWriter: createOIMEntityWriterInPlace({ entityInsertStrategy }),
    });
    return { rowsService, rows: rowsService.createStoreSlot(db) };
};

const replacingRowsFilledBy = (entityInsertStrategy: TOIMEntityInsertStrategy) => {
    const db = new OIMDB();
    const rowsService = createOIMEntityService<TRow>(db, {
        keyOf: (row: TRow) => row.id,
        entityWriter: createOIMEntityWriterReplacing({ entityInsertStrategy }),
    });
    return { rowsService, rows: rowsService.createStoreSlot(db) };
};

const storedBy = (entityInsertStrategy: TOIMEntityInsertStrategy, handed: TRow): TRow => {
    const { rowsService, rows } = rowsFilledBy(entityInsertStrategy);
    return rowsService.slotContentService.upsertEntity(rows, handed).entity as TRow;
};

describe('what an own __proto__ key on an inserted row becomes', () => {
    it.each(cases)('leaves the stored row on Object.prototype either way: $named', (one: TCase) => {
        const shipped = storedBy(oimInsertEntityWithSanitizedCopy, one.handed());
        const withoutTheDelete = storedBy(spreadWithoutDeletingTheKey, one.handed());

        expect(Object.getPrototypeOf(shipped)).toBe(Object.prototype);
        expect(Object.getPrototypeOf(withoutTheDelete)).toBe(Object.prototype);
    });

    it.each(cases)('keeps the stored row\'s own keys to its columns: $named', (one: TCase) => {
        const shipped = storedBy(oimInsertEntityWithSanitizedCopy, one.handed());
        const withoutTheDelete = storedBy(spreadWithoutDeletingTheKey, one.handed());

        expect(Object.getOwnPropertyNames(shipped)).toEqual(['id', 'n']);
        expect(Object.hasOwn(shipped, PROTO_KEY)).toBe(false);
        expect(Object.hasOwn(withoutTheDelete, PROTO_KEY)).toBe(one.handedCarriesTheKey);
    });

    it.each(cases)('cannot become a prototype on a copy assigned by name: $named', (one: TCase) => {
        const shipped = storedBy(oimInsertEntityWithSanitizedCopy, one.handed());
        const withoutTheDelete = storedBy(spreadWithoutDeletingTheKey, one.handed());

        expect(Object.getPrototypeOf(Object.assign({}, shipped))).toBe(Object.prototype);
        expect(Object.getPrototypeOf(Object.assign({}, withoutTheDelete)))
            .toEqual(one.handedCarriesTheKey ? reachedThroughTheChain : Object.prototype);
    });

    it.each(cases)('is kept as handed by the shipped default, which stores the very object: $named', (one: TCase) => {
        const handed = one.handed();

        expect(storedBy(oimInsertEntityWithoutCopy, handed)).toBe(handed);
    });

    it('is absent after a PATCH on a row inserted through the sanitized copy', () => {
        const { rowsService, rows } = replacingRowsFilledBy(oimInsertEntityWithSanitizedCopy);
        rowsService.slotContentService.upsertEntity(rows,JSON.parse(`{"id":"r1","n":1,"label":"l","${PROTO_KEY}":{"polluted":true}}`) as TRow);

        const stored = rowsService.slotContentService.updateEntity(rowsService.findSlotByKey(rows, 'r1')!, { n: 2 }).entity as TRow;

        expect(Object.hasOwn(stored, PROTO_KEY)).toBe(false);
        expect(Object.getPrototypeOf(stored)).toBe(Object.prototype);
        expect(Object.getPrototypeOf(Object.assign({}, stored))).toBe(Object.prototype);
    });

    it('is gone from the row the sanitized arm stores, and from every write after it', () => {
        const { rowsService, rows } = replacingRowsFilledBy(oimInsertEntityWithSanitizedCopy);
        rowsService.slotContentService.upsertEntity(rows,JSON.parse(`{"id":"r1","n":1,"label":"l","${PROTO_KEY}":{"polluted":true}}`) as TRow);

        const stored = rowsService.slotContentService.upsertEntity(rows,{ id: 'r1', n: 2 }).entity as TRow;

        expect(Object.getOwnPropertyNames(stored)).toEqual(['id', 'n', 'label']);
        expect(stored.label).toBeUndefined();
        expect(Object.getPrototypeOf(stored)).toBe(Object.prototype);
        expect(Object.getPrototypeOf(Object.assign({}, stored))).toBe(Object.prototype);
    });
});
