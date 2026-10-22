import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OIMDB, createOIMEntityService } from '../src/index';
import type { TOIMEntitySlot, TOIMStoreKey } from '../src/index';
import type { TOIMStoreSlot } from '../src/engine/slot/types/TOIMStoreSlot';

const SRC = join(__dirname, '..', 'src');

/** `tag` is optional so an upsert can take it away, which is a DISPLACED column. */
type TSource = { id: string; n: number; tag?: string };
type TMiddle = { id: string; doubled: number; tag: string };

const deriveMiddle = (item: TSource): TMiddle =>
    ({ id: item.id, doubled: item.n * 2, tag: item.tag ?? 'none' });

/** Every row a collection is actually holding, keyed by its own key. */
const rowsOf = <TEntity extends object>(
    entityService: ReturnType<typeof createOIMEntityService<TEntity>>,
    storeSlot: TOIMStoreSlot<Map<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>, TOIMEntitySlot<TEntity, TOIMStoreKey>, Partial<TEntity>>,
): Map<TOIMStoreKey, TEntity> => {
    const found = new Map<TOIMStoreKey, TEntity>();
    for (const slot of entityService.getSlots(storeSlot)) {
        const entity = slot.entity;
        // A reserved identity is not a row: the key is spoken for, nothing is
        // there. The model has no such notion and must not be asked about one.
        if (entity === undefined) continue;
        found.set(entityService.slotContentService.keyOf(entity), entity);
    }
    return found;
};

const sourceServiceOn = (db: OIMDB): ReturnType<typeof createOIMEntityService<TSource>> =>
    createOIMEntityService<TSource>(db, { keyOf: (source: TSource) => source.id });

const middleServiceOn = (db: OIMDB): ReturnType<typeof createOIMEntityService<TMiddle>> =>
    createOIMEntityService<TMiddle>(db, { keyOf: (middle: TMiddle) => middle.id });

const everySourceFile = (dir: string): string[] => {
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) found.push(...everySourceFile(path));
        else if (entry.name.endsWith('.ts')) found.push(path);
    }
    return found;
};

describe('the projection layer, and that it is not here', () => {
    it('publishes no projection door and declares no project() method', () => {
        // The WORD appears in `src/index.ts`, in comments describing what a
        // consumer builds out of computed buckets — so the test is about
        // exports and not about the string.
        const surface = readFileSync(join(SRC, 'index.ts'), 'utf8');
        expect(surface.match(/^export .*[Pp]roject/gm)).toBeNull();

        const offenders: string[] = [];
        expect(everySourceFile(SRC).length).toBeGreaterThan(200);
        for (const file of everySourceFile(SRC)) {
            const source = readFileSync(file, 'utf8');
            if (/\brunProjections\b/.test(source)) offenders.push(`${file}: runProjections`);
            if (/^\s*(public |private |protected )?project\s*[(<]/m.test(source)) {
                offenders.push(`${file}: a project() method`);
            }
            if (/^\s*projected\s*[?:]/m.test(source)) offenders.push(`${file}: a projected field`);
        }
        expect(offenders).toEqual([]);
    });
});

describe('a second population is the caller\'s, and a write reaches only the one it was made on', () => {
    it('leaves a second collection empty however much is written into the first', () => {
        const db = new OIMDB();
        const sourceService = sourceServiceOn(db);
        const middleService = middleServiceOn(db);
        const sourceStoreSlot = sourceService.createStoreSlot(db);
        const middleStoreSlot = middleService.createStoreSlot(db);

        sourceService.slotContentService.upsertEntities(sourceStoreSlot, [
            { id: 'k1', n: 1, tag: 'red' },
            { id: 'k2', n: 2, tag: 'blue' },
        ]);
        const firstSlot = sourceService.findSlotByKey(sourceStoreSlot, 'k1');
        if (firstSlot !== undefined) sourceService.slotContentService.updateEntity(firstSlot, { n: 9 });
        db.flush();

        expect(rowsOf(sourceService, sourceStoreSlot).size).toBe(2);
        expect(rowsOf(middleService, middleStoreSlot).size).toBe(0);
        expect(middleService.getSlotCount(middleStoreSlot)).toBe(0);
    });

    it('leaves a second population of the same service empty however much is written into the first', () => {
        const db = new OIMDB();
        const sourceService = sourceServiceOn(db);
        const sourceStoreSlot = sourceService.createStoreSlot(db);
        const otherSourceStoreSlot = sourceService.createStoreSlot(db);

        sourceService.slotContentService.upsertEntities(sourceStoreSlot, [
            { id: 'k1', n: 1, tag: 'red' },
            { id: 'k2', n: 2, tag: 'blue' },
        ]);
        db.flush();

        expect(rowsOf(sourceService, sourceStoreSlot).size).toBe(2);
        expect(sourceService.getSlotCount(otherSourceStoreSlot)).toBe(0);
    });

    it('is the caller who writes the derived row, and it is an ordinary write', () => {
        const db = new OIMDB();
        const sourceService = sourceServiceOn(db);
        const middleService = middleServiceOn(db);
        const sourceStoreSlot = sourceService.createStoreSlot(db);
        const middleStoreSlot = middleService.createStoreSlot(db);

        sourceService.slotContentService.upsertEntity(sourceStoreSlot, { id: 'k1', n: 5, tag: 'red' });
        middleService.slotContentService.upsertEntity(middleStoreSlot, deriveMiddle({ id: 'k1', n: 5, tag: 'red' }));
        db.flush();
        expect(rowsOf(middleService, middleStoreSlot).get('k1')).toStrictEqual({ id: 'k1', doubled: 10, tag: 'red' });

        // A COLUMN THAT LEAVES THE SOURCE LEAVES THE DERIVED ROW. `upsertEntity`
        // writes a WHOLE row: it walks the stored entity for the names the new
        // one does not carry and takes them away, so a derived `tag` cannot
        // outlive the source column it was derived from.
        sourceService.slotContentService.upsertEntity(sourceStoreSlot, { id: 'k1', n: 0 });
        middleService.slotContentService.upsertEntity(middleStoreSlot, deriveMiddle({ id: 'k1', n: 0 }));
        db.flush();
        expect(rowsOf(middleService, middleStoreSlot).get('k1')).toStrictEqual({ id: 'k1', doubled: 0, tag: 'none' });
    });
});
