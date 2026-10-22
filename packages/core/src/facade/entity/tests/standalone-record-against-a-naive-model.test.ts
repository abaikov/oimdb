import { OIMDB, OIMEffectService, createOIMSingleEntityService } from '../../../index';

type TSettings = { alpha?: number; beta?: number; gamma?: number; delta?: number };

const FIELDS = ['alpha', 'beta', 'gamma', 'delta'] as const;
type TField = typeof FIELDS[number];

const definedColumnsOf = (entity: object | undefined): Record<string, unknown> =>
    Object.fromEntries(Object.entries(entity ?? {}).filter(([, value]) => value !== undefined));

const makeRandom = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
};

const run = (seed: number, steps: number): void => {
    const random = makeRandom(seed);
    /**
     * A small range on purpose: writing the value that is already there has to
     * be a COMMON step, because "a patch that changes nothing wakes nobody" is
     * only tested by the steps that change nothing.
     */
    const value = (): number => Math.floor(random() * 3);
    const someFields = (): TField[] => {
        const chosen: TField[] = [];
        const wanted = 1 + Math.floor(random() * 3);
        while (chosen.length < wanted) {
            const name = FIELDS[Math.floor(random() * FIELDS.length)];
            if (chosen.indexOf(name) < 0) chosen.push(name);
        }
        return chosen;
    };

    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const model: TSettings = { alpha: 1, beta: 2 };
    // A copy: the record holds what it is given and writes THROUGH it, so
    // handing it the model object would make the two agree by aliasing.
    const recordService = createOIMSingleEntityService<TSettings>(db);
    const record = recordService.createStoreSlot(db);
    recordService.slotContentService.upsertEntity(record, { ...model });

    let recordWoke = 0;
    const fieldWoke: Record<string, number> = {};
    // Every column effect is in place before the first write, so every column
    // identity exists from the start and nothing is credited to an effect born
    // behind a write of the open batch.
    for (const name of FIELDS) {
        fieldWoke[name] = 0;
        const column = recordService.holdColumn(recordService.getSingleSlot(record), name);
        effectService.createEffect(db, [column], [], () => { fieldWoke[name]++; });
    }
    effectService.createEffect(db, [recordService.getSingleSlot(record)], [], () => { recordWoke++; });

    for (let step = 0; step < steps; step++) {
        recordWoke = 0;
        for (const name of FIELDS) fieldWoke[name] = 0;

        const before: TSettings = { ...model };
        const choice = random();
        let what: string;

        if (choice < 0.34) {
            const patch: TSettings = {};
            for (const name of someFields()) patch[name] = value();
            what = `record.update(${JSON.stringify(patch)})`;
            recordService.slotContentService.updateEntity(recordService.getSingleSlot(record), patch);
            Object.assign(model, patch);
        } else if (choice < 0.46) {
            // The values that are already there. Nothing changed, so nobody may
            // be told anything did.
            const patch: TSettings = {};
            for (const name of someFields()) {
                if (model[name] !== undefined) patch[name] = model[name];
            }
            what = `record.update(${JSON.stringify(patch)}) — the values already held`;
            recordService.slotContentService.updateEntity(recordService.getSingleSlot(record), patch);
            Object.assign(model, patch);
        } else if (choice < 0.66) {
            const names = someFields();
            what = `record.deleteEntityColumns([${names.join(', ')}])`;
            recordService.slotContentService.deleteEntityColumns(recordService.getSingleSlot(record), names);
            for (const name of names) delete model[name];
        } else if (choice < 0.76) {
            // Names that are demonstrably not there.
            const names = FIELDS.filter(name => model[name] === undefined);
            what = `record.deleteEntityColumns([${names.join(', ')}]) — none of them present`;
            recordService.slotContentService.deleteEntityColumns(recordService.getSingleSlot(record), names);
        } else {
            const next: TSettings = {};
            for (const name of someFields()) next[name] = value();
            what = `record.replace(${JSON.stringify(next)})`;
            recordService.slotContentService.writeEntity(recordService.getSingleSlot(record), next);
            for (const name of FIELDS) delete model[name];
            Object.assign(model, next);
        }

        const where = `seed ${seed}, step ${step}, ${what}`;

        // A write to a record is immediate — there is no deferred half — so the
        // record already holds the answer, before any frame.
        expect({ where, when: 'before flush', record: definedColumnsOf(recordService.getSingleSlot(record).entity) })
            .toStrictEqual({ where, when: 'before flush', record: { ...model } });

        db.flush();

        expect({ where, when: 'after flush', record: definedColumnsOf(recordService.getSingleSlot(record).entity) })
            .toStrictEqual({ where, when: 'after flush', record: { ...model } });

        // An absent field reads `undefined` and no value generated here is
        // `undefined`, so one comparison answers "changed, arrived or left".
        const moved = FIELDS.filter(name => before[name] !== model[name]);

        if (recordWoke > 0 && moved.length === 0) {
            throw new Error(
                `${where}: the record woke its subscriber ${recordWoke} time(s) and holds exactly what it ` +
                'held before. A write that moved nothing is a render for nothing.',
            );
        }
        if (recordWoke === 0 && moved.length > 0) {
            throw new Error(
                `${where}: ${moved.join(', ')} moved and the record's subscriber was never told.`,
            );
        }
        for (const name of FIELDS) {
            const told = fieldWoke[name] > 0;
            const changed = before[name] !== model[name];
            if (told && !changed) {
                throw new Error(
                    `${where}: the subscriber on "${name}" was woken ${fieldWoke[name]} time(s) and that ` +
                    `field still holds ${String(model[name])}. A field subscription exists to be told about ` +
                    'that field and nothing else.',
                );
            }
            if (!told && changed) {
                throw new Error(
                    `${where}: "${name}" went from ${String(before[name])} to ${String(model[name])} and its ` +
                    'subscriber was never told.',
                );
            }
        }
    }
};

describe('a standalone record against a plain object', () => {
    for (const seed of [1, 2, 3, 7, 11, 42, 1337, 90210]) {
        it(`holds what the object holds, and wakes exactly what moved (seed ${seed})`, () => {
            run(seed, 200);
        });
    }
});

/**
 * The named case, spelled out rather than left to the script to stumble into:
 * a state saved before a key was deleted, loaded back afterwards.
 */
describe('replace', () => {
    it('leaves the record equal to what it was given — nothing resurrected, nothing left behind', () => {
        const db = new OIMDB();
        const recordService = createOIMSingleEntityService<TSettings>(db);
        const record = recordService.createStoreSlot(db);
        recordService.slotContentService.upsertEntity(record, { alpha: 1, beta: 2, gamma: 3 });

        recordService.slotContentService.writeEntity(recordService.getSingleSlot(record), { beta: 9, delta: 4 });

        expect(definedColumnsOf(recordService.getSingleSlot(record).entity)).toStrictEqual({ beta: 9, delta: 4 });
        expect(recordService.getSingleSlot(record).entity?.alpha).toBeUndefined();
        expect(recordService.getSingleSlot(record).entity?.gamma).toBeUndefined();
    });

    it('wakes nobody when it is handed exactly what the record already holds', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const recordService = createOIMSingleEntityService<TSettings>(db);
        const record = recordService.createStoreSlot(db);
        recordService.slotContentService.upsertEntity(record, { alpha: 1, beta: 2 });
        let runCount = 0;
        effectService.createEffect(db, [recordService.getSingleSlot(record)], [], () => { runCount++; });

        recordService.slotContentService.writeEntity(recordService.getSingleSlot(record), { alpha: 1, beta: 2 });
        db.flush();

        expect({ ...recordService.getSingleSlot(record).entity }).toStrictEqual({ alpha: 1, beta: 2 });
        expect(runCount).toBe(0);
    });
});
