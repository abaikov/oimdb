import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { OIMDB } from '../OIMDB';
import { createOIMEntityService } from '../createOIMEntityService';

type TCard = { id: string; title: string };

const SRC = join(__dirname, '..', '..');

const codeOf = (path: string): string =>
    readFileSync(join(SRC, path), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');

const ROOT = 'factories/OIMDB.ts';
const DEFAULTS = 'factories/OIMDefaults.ts';

const ENTITY_DOOR = 'factories/createOIMEntityService.ts';
const DOORS = [
    ENTITY_DOOR,
    'factories/createOIMSingleEntityService.ts',
    'factories/createOIMBucketService.ts',
    'factories/createOIMSingleBucketService.ts',
    'factories/createOIMIndexService.ts',
    'factories/createOIMIndexServiceByCompositeKey.ts',
    'factories/createOIMIndexServiceSortedArrayDriven.ts',
    'factories/createOIMComputedService.ts',
    'factories/createOIMComputedServiceSorted.ts',
    'factories/createOIMComputedServiceBucketMemo.ts',
    'factories/createOIMSlotCollectionService.ts',
    'factories/createOIMSingleSlotService.ts',
    'factories/createOIMSlotContentEntityService.ts',
] as const;

const OPTION_TYPES_A_DOOR_TAKES: Readonly<Record<string, readonly string[]>> = {
    'factories/createOIMIndexService.ts': ['facade/index/types/TOIMIndexKeyOptions.ts'],
};

const HELPERS_A_DOOR_CALLS: Readonly<Record<string, string>> = {
    'return createOIMSlotCollectionService': 'factories/createOIMSlotCollectionService.ts',
    'return createOIMSingleSlotService': 'factories/createOIMSingleSlotService.ts',
    'slotContentService: createOIMSlotContentEntityService': 'factories/createOIMSlotContentEntityService.ts',
    'createOIMBucketSlotOwnerService(': 'factories/utils/createOIMBucketSlotOwnerService.ts',
    'oimSlotStoreServiceWithDefault(': 'factories/utils/oimSlotStoreServiceWithDefault.ts',
    'oimColumnOwnerOptionsWithDefault(': 'factories/utils/oimColumnOwnerOptionsWithDefault.ts',
    'oimIndexServiceOptionsWithDefault(': 'factories/utils/oimIndexServiceOptionsWithDefault.ts',
};

const GLOBAL_DEFAULTS_NOBODY_PASSES = ['KEY_TREE_WALK_COMPOSITE', 'STANDALONE_SLOT_OWNER'] as const;

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
    .filter(([call]) => new RegExp(String.raw`${call.replace('(', String.raw`\(`)}[^;]*\boptions,`).test(doorText))
    .map(([, path]) => codeOf(path));

const isCarried = (door: string, body: string, key: string): boolean =>
    body.includes('...options') || readsOptionKey(body, key)
    || helpersHandedTheOptions(codeOf(door)).some(helperText => readsOptionKey(helperText, key));

const constructorlessMintedBy = (door: string): string[] =>
    namesAfter(/new (OIM[A-Za-z]*)/g, codeOfDoor(door))
        .filter(className => !codeOf(classPathOf(className)).includes('constructor('));

const CLASS_PATHS: Readonly<Record<string, string>> = {
    OIMSlotStoreServiceMapDriven: 'engine/store/OIMSlotStoreServiceMapDriven.ts',
    OIMSlotStoreServiceSingleSlotDriven: 'engine/store/OIMSlotStoreServiceSingleSlotDriven.ts',
    OIMSlotStoreServiceTreeDriven: 'engine/store/OIMSlotStoreServiceTreeDriven.ts',
    OIMSlotReleasePolicyAtUnhold: 'engine/collector/OIMSlotReleasePolicyAtUnhold.ts',
    OIMSlotOwnerService: 'engine/slot/OIMSlotOwnerService.ts',
    OIMSlotContentEntityService: 'engine/entity/OIMSlotContentEntityService.ts',
    OIMSlotCollectionService: 'facade/slot/OIMSlotCollectionService.ts',
    OIMSingleSlotService: 'facade/slot/OIMSingleSlotService.ts',
    OIMBucketCommands: 'facade/bucket/OIMBucketCommands.ts',
    OIMSlotContentBucketServiceArrayDriven: 'facade/bucket/OIMSlotContentBucketServiceArrayDriven.ts',
    OIMSlotContentBucketServiceSortedArrayDriven: 'facade/bucket/OIMSlotContentBucketServiceSortedArrayDriven.ts',
    OIMIndexService: 'facade/index/OIMIndexService.ts',
    OIMIndexServiceSortedArrayDriven: 'facade/index/OIMIndexServiceSortedArrayDriven.ts',
    OIMComputedService: 'facade/computed/OIMComputedService.ts',
    OIMComputedServiceSorted: 'facade/computed/OIMComputedServiceSorted.ts',
    OIMComputedServiceBucketMemo: 'facade/computed/OIMComputedServiceBucketMemo.ts',
};

const classPathOf = (className: string): string => {
    const path = CLASS_PATHS[className];
    if (path === undefined) throw new Error(`a door mints ${className}, which this census has no path for`);
    return path;
};

type TInjected = {
    entityWriter: unknown;
    slotEmptiness: unknown;
    columnSlotStoreService: unknown;
};

const injectedInto = (cardsService: ReturnType<typeof createOIMEntityService<TCard>>, db: OIMDB): TInjected => {
    const cards = cardsService.createStoreSlot(db);
    cardsService.getColumn(cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 't' }), 'title');
    const slotOwnerService = Reflect.get(cardsService, 'slotOwnerService') as { columnOwner: object };
    return {
        entityWriter: Reflect.get(cardsService.slotContentService, 'entityWriter'),
        slotEmptiness: Reflect.get(cardsService.slotContentService, 'slotEmptiness'),
        columnSlotStoreService: Reflect.get(slotOwnerService.columnOwner, 'columnSlotStoreService'),
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
            .toEqual(['entityWriter', 'slotEmptiness']);
    });

    it('the root mints only its channel slot and its collector slot, and names no global default', () => {
        expect(namesAfter(/new (OIM[A-Za-z]*)/g, codeOf(ROOT))).toEqual([]);
        expect(namesAfter(/create(OIM[A-Za-z]*)\(/g, codeOf(ROOT))).toEqual(['OIMChannelSlot', 'OIMCollectorSlot']);
        expect(occurrencesOf(/OIM_DEFAULT_\w+|OIMDefaults\./g, codeOf(ROOT))).toBe(0);
    });

    it('the root declares what it owns and not one door', () => {
        expect(namesAfter(/^ {4}public (?:readonly )?(\w+)/gm, codeOf(ROOT))).toEqual([
            'clock', 'collectorSlot', 'constructor', 'defaultChannelSlot', 'entityWriter', 'flush', 'indexKeysService',
            'slotReleasePolicy', 'slotStamp',
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

    it('places every global default either behind a door or on the list of nobody\'s option', () => {
        const everyGlobalDefault = namesAfter(/^ {4}public static readonly (\w+) =/gm, codeOf(DEFAULTS));
        const readByTheDoors = new Set<string>();
        for (const door of DOORS) {
            for (const name of namesAfter(/OIM_DEFAULT_([A-Z_]+)\.getValue\(\)/g, codeOfDoor(door))) {
                readByTheDoors.add(name);
            }
        }

        expect([...readByTheDoors, ...GLOBAL_DEFAULTS_NOBODY_PASSES].sort()).toEqual(everyGlobalDefault);
    });

    it('hands a collection its own answer and never lets the class reach for one', () => {
        const db = new OIMDB();
        const injected = injectedInto(createOIMEntityService<TCard>(db, { keyOf: card => card.id }), db);

        expect(injected.entityWriter).toBeDefined();
        expect(injected.columnSlotStoreService).toBeDefined();
        expect(injected.slotEmptiness).toBeDefined();
    });

    it('reads each global once, so two roots in one process hand out the same answer', () => {
        const oneDb = new OIMDB();
        const otherDb = new OIMDB();
        const one = injectedInto(createOIMEntityService<TCard>(oneDb, { keyOf: card => card.id }), oneDb);
        const other = injectedInto(createOIMEntityService<TCard>(otherDb, { keyOf: card => card.id }), otherDb);

        expect(other.entityWriter).toBe(one.entityWriter);
        expect(other.columnSlotStoreService).toBe(one.columnSlotStoreService);
        expect(other.slotEmptiness).toBe(one.slotEmptiness);
    });
});
