import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { OIMDB } from '../OIMDB';
import { OIMDefaults } from '../OIMDefaults';
import { createOIMReplacingEntityWriter } from '../../entity/createOIMReplacingEntityWriter';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import type { OIMSlotContentEntityService } from '../../entity/OIMSlotContentEntityService';

type TCard = { id: string; title: string };

const SRC = join(__dirname, '..', '..');

const codeOf = (path: string): string =>
    readFileSync(join(SRC, path), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');

const ROOT = 'db/OIMDB.ts';
const DEFAULTS = 'db/OIMDefaults.ts';

const ENTITY_DOOR = 'entity/createOIMSlotContentEntityService.ts';
const DOORS = [
    ENTITY_DOOR,
    'index/createOIMSlotCollectionIndexService.ts',
    'index/createOIMSlotCollectionSortedArrayIndexService.ts',
    'computed/createOIMComputedService.ts',
    'computed/createOIMSingleComputedService.ts',
    'computed/createOIMSortedComputedService.ts',
    'computed/createOIMBucketMemoComputedService.ts',
    'slot/createOIMSlotCollectionService.ts',
    'slot/createOIMSingleSlotService.ts',
] as const;

const OPTION_TYPES_A_DOOR_TAKES: Readonly<Record<string, readonly string[]>> = {
    'index/createOIMSlotCollectionIndexService.ts': ['index/types/TOIMIndexKeyOptions.ts'],
};

const HELPERS_A_DOOR_CALLS: Readonly<Record<string, string>> = {
    'return createOIMSlotCollectionService': 'slot/createOIMSlotCollectionService.ts',
    'return createOIMSingleSlotService': 'slot/createOIMSingleSlotService.ts',
    'slotContentService: createOIMSlotContentEntityService': 'entity/createOIMSlotContentEntityService.ts',
    'oimResolveSlotOwnerServiceOptions(': 'slot/utils/oimResolveSlotOwnerServiceOptions.ts',
    'oimResolveSlotStoreService(': 'store/utils/oimResolveSlotStoreService.ts',
    'oimResolveColumnSlotOwnerOptions(': 'column/utils/oimResolveColumnSlotOwnerOptions.ts',
    'oimResolveSlotCollectionIndexServiceOptions(': 'index/utils/oimResolveSlotCollectionIndexServiceOptions.ts',
};


const occurrencesOf = (pattern: RegExp, text: string): number => (text.match(pattern) ?? []).length;

const namesAfter = (pattern: RegExp, text: string): string[] => {
    const found = new Set<string>();
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match !== null) {
        found.add(match[1]);
        match = pattern.exec(text);
    }
    return [...found].sort();
};

const codeOfDoor = (door: string): string => {
    const doorText = codeOf(door);
    const helperTexts = Object.entries(HELPERS_A_DOOR_CALLS)
        .filter(([call]) => doorText.includes(call))
        .map(([, path]) => codeOf(path));
    return [doorText, ...helperTexts].join('\n');
};

const signatureOf = (text: string): string => text.slice(text.indexOf('options'), text.search(/\n\): /));

const bodyOf = (text: string): string => text.slice(text.search(/\n\): /));

const OPTION_KEY = /(?:^\s+|\{\s*)(\w+)\??:/gm;

const optionKeysOf = (door: string): string[] => {
    const keys = new Set(namesAfter(OPTION_KEY, signatureOf(codeOf(door))));
    for (const path of OPTION_TYPES_A_DOOR_TAKES[door] ?? []) {
        for (const key of namesAfter(OPTION_KEY, codeOf(path).slice(codeOf(path).indexOf('= {')))) keys.add(key);
    }
    return [...keys].sort();
};

const readsOptionKey = (text: string, key: string): boolean => new RegExp(String.raw`options\.${key}\b`).test(text);

const helpersHandedTheOptions = (doorText: string): string[] => Object.entries(HELPERS_A_DOOR_CALLS)
    .filter(([call]) => new RegExp(String.raw`${call.replace('(', String.raw`\(`)}[^;]*\boptions[,)]`).test(doorText))
    .map(([, path]) => codeOf(path));

const isCarried = (door: string, body: string, key: string): boolean =>
    body.includes('...options') || readsOptionKey(body, key)
    || helpersHandedTheOptions(codeOf(door)).some(helperText => readsOptionKey(helperText, key));

const constructorlessMintedBy = (door: string): string[] =>
    namesAfter(/new (OIM[A-Za-z]*)/g, codeOfDoor(door))
        .filter(className => !codeOf(classPathOf(className)).includes('constructor('));

const CLASS_PATHS: Readonly<Record<string, string>> = {
    OIMSlotMapStoreService: 'store/OIMSlotMapStoreService.ts',
    OIMSingleSlotStoreService: 'store/OIMSingleSlotStoreService.ts',
    OIMSlotTreeStoreService: 'store/OIMSlotTreeStoreService.ts',
    OIMSlotAtUnholdReleasePolicy: 'collector/OIMSlotAtUnholdReleasePolicy.ts',
    OIMSlotOwnerService: 'slot/OIMSlotOwnerService.ts',
    OIMSlotContentEntityService: 'entity/OIMSlotContentEntityService.ts',
    OIMSlotCollectionService: 'slot/OIMSlotCollectionService.ts',
    OIMWritableSlotCollectionService: 'slot/OIMSlotCollectionService.ts',
    OIMWritableSingleSlotService: 'slot/OIMSingleSlotService.ts',
    OIMSingleComputedService: 'computed/OIMSingleComputedService.ts',
    OIMSingleSlotService: 'slot/OIMSingleSlotService.ts',
    OIMBucketCommands: 'bucket/OIMBucketCommands.ts',
    OIMSlotContentPositionalArrayBucketService: 'bucket/OIMSlotContentPositionalArrayBucketService.ts',
    OIMSlotContentSortedArrayBucketService: 'bucket/OIMSlotContentSortedArrayBucketService.ts',
    OIMSlotCollectionIndexService: 'index/OIMSlotCollectionIndexService.ts',
    OIMSlotCollectionSortedArrayIndexService: 'index/OIMSlotCollectionSortedArrayIndexService.ts',
    OIMComputedService: 'computed/OIMComputedService.ts',
    OIMSortedComputedService: 'computed/OIMSortedComputedService.ts',
    OIMBucketMemoComputedService: 'computed/OIMBucketMemoComputedService.ts',
};

const classPathOf = (className: string): string => {
    const path = CLASS_PATHS[className];
    if (path === undefined) throw new Error(`a door mints ${className}, which this census has no path for`);
    return path;
};

type TInjected = {
    entityWriter: unknown;
    slotEmptinessPolicy: unknown;
    columnSlotStoreService: unknown;
};

const injectedInto = (cardsService: ReturnType<typeof createOIMSlotCollectionService<OIMSlotContentEntityService<TCard>>>, db: OIMDB): TInjected => {
    const cards = cardsService.createStoreSlot(db);
    cardsService.columnSlotService.getColumn(cardsService.writeSlotContentByKey(cards, (card => card.id)({ id: 'c1', title: 't' }), { id: 'c1', title: 't' }), 'title');
    const slotOwnerService = Reflect.get(cardsService, 'slotOwnerService') as { columnSlotOwner: object };
    return {
        entityWriter: Reflect.get(cardsService.slotContentService, 'entityWriter'),
        slotEmptinessPolicy: Reflect.get(cardsService.slotContentService, 'slotEmptinessPolicy'),
        columnSlotStoreService: Reflect.get(slotOwnerService.columnSlotOwner, 'columnSlotStoreService'),
    };
};

describe('which answer a collection the root mints gets', () => {
    it.each(DOORS)('%s forwards every option it can take', door => {
        const body = bodyOf(codeOf(door));

        expect(optionKeysOf(door).filter(key => !isCarried(door, body, key))).toEqual([]);
    });

    it('no class outside the factories reaches for a global default', () => {
        const classPaths = Object.values(CLASS_PATHS);

        expect(classPaths.filter(path => /OIM_DEFAULT_\w+|OIMDefaults\./.test(codeOf(path)))).toEqual([]);
    });

    it('the entity door answers from the globals the options a caller may leave out', () => {
        expect(namesAfter(/options\.(\w+)\s*\?\?[^;\n]*OIM_DEFAULT_\w+\.getValue\(\)/g, codeOfDoor(ENTITY_DOOR)))
            .toEqual(['entityWriter', 'slotEmptinessPolicy']);
    });

    it('the root mints only its channel slot and its collector slot, and names no global default', () => {
        expect(namesAfter(/new (OIM[A-Za-z]*)/g, codeOf(ROOT))).toEqual([]);
        expect(namesAfter(/create(OIM[A-Za-z]*)\(/g, codeOf(ROOT))).toEqual(['OIMChannelSlot', 'OIMCollectorSlot']);
        expect(occurrencesOf(/OIM_DEFAULT_\w+|OIMDefaults\./g, codeOf(ROOT))).toBe(0);
    });

    it('the root declares what it owns and not one door', () => {
        expect(namesAfter(/^ {4}public (?:readonly )?(\w+)/gm, codeOf(ROOT))).toEqual([
            'clock', 'collectorSlot', 'constructor', 'defaultChannelSlot', 'flush',
        ]);
    });

    it.each(DOORS)('%s mints nothing stateless: every class it builds takes a constructor', door => {
        expect(constructorlessMintedBy(door)).toEqual([]);
    });

    it('each door reads each global it needs once, so it settles each question once', () => {
        for (const door of DOORS) {
            const text = codeOfDoor(door);
            expect({ door, read: occurrencesOf(/OIM_DEFAULT_[A-Z_]+\.getValue\(\)/g, text) })
                .toEqual({ door, read: namesAfter(/OIM_DEFAULT_([A-Z_]+)\.getValue\(\)/g, text).length });
        }
    });

    it('places every global default behind a door', () => {
        const everyGlobalDefault = readdirSync(join(SRC, 'db', 'constants'))
            .map(file => file.replace(/^OIM_DEFAULT_/, '').replace(/\.ts$/, ''))
            .sort();
        const readByTheDoors = new Set<string>();
        for (const door of DOORS) {
            for (const name of namesAfter(/OIM_DEFAULT_([A-Z_]+)\.getValue\(\)/g, codeOfDoor(door))) {
                readByTheDoors.add(name);
            }
        }

        expect([...readByTheDoors].sort()).toEqual(everyGlobalDefault);
    });

    it('reads every field of a defaults instance in some door', () => {
        const everyField = namesAfter(/^ {4}public readonly (\w+):/gm, codeOf(DEFAULTS));
        const readByTheDoors = new Set<string>();
        for (const door of DOORS) {
            for (const name of namesAfter(/defaults\??\.(\w+)/g, codeOfDoor(door))) readByTheDoors.add(name);
        }

        expect(everyField.filter(field => !readByTheDoors.has(field))).toEqual([]);
    });

    it('hands a collection what its defaults instance holds, and the global answer for what it leaves out', () => {
        const entityWriter = createOIMReplacingEntityWriter();
        const defaults = new OIMDefaults({ entityWriter });
        const injected = injectedInto(createOIMSlotCollectionService({
            defaults, slotContentService: createOIMSlotContentEntityService<TCard, string>({ defaults }),
        }), new OIMDB());
        const plain = injectedInto(createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard, string>() }), new OIMDB());

        expect(injected.entityWriter).toBe(entityWriter);
        expect(plain.entityWriter).not.toBe(entityWriter);
        expect(injected.slotEmptinessPolicy).toBe(plain.slotEmptinessPolicy);
        expect(injected.columnSlotStoreService).toBe(plain.columnSlotStoreService);
    });

    it('hands a collection its own answer and never lets the class reach for one', () => {
        const db = new OIMDB();
        const injected = injectedInto(createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard, string>() }), db);

        expect(injected.entityWriter).toBeDefined();
        expect(injected.columnSlotStoreService).toBeDefined();
        expect(injected.slotEmptinessPolicy).toBeDefined();
    });

    it('reads each global once, so two roots in one process hand out the same answer', () => {
        const oneDb = new OIMDB();
        const otherDb = new OIMDB();
        const one = injectedInto(createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard, string>() }), oneDb);
        const other = injectedInto(createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard, string>() }), otherDb);

        expect(other.entityWriter).toBe(one.entityWriter);
        expect(other.columnSlotStoreService).toBe(one.columnSlotStoreService);
        expect(other.slotEmptinessPolicy).toBe(one.slotEmptinessPolicy);
    });
});
