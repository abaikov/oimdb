import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { OIMDB } from '../src/factories/OIMDB';
import { OIMErrorPolicyThrowAtOnce } from '../src/engine/error/OIMErrorPolicyThrowAtOnce';
import { OIMSlotContentBucketServiceArrayDriven } from '../src/facade/bucket/OIMSlotContentBucketServiceArrayDriven';
import { createOIMBucketService } from '../src/factories/createOIMBucketService';
import { createOIMEntityService } from '../src/factories/createOIMEntityService';
import { createOIMIndexService } from '../src/factories/createOIMIndexService';
import { createOIMSingleEntityService } from '../src/factories/createOIMSingleEntityService';
import type { TOIMBucketSlot } from '../src/engine/bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../src/engine/entity/types/TOIMEntitySlot';
import type { TOIMBucketSlotsArrayStore } from '../src/engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMStoreKey } from '../src/engine/store/types/TOIMStoreKey';

const SRC = join(__dirname, '..', 'src');

const codeOf = (path: string): string =>
    readFileSync(join(SRC, path), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');

const occurrencesOf = (word: string, text: string): number =>
    (text.match(new RegExp(`(?<![A-Za-z0-9_$])${word}(?![A-Za-z0-9_$])`, 'g')) ?? []).length;

const typeScriptFilesUnder = (directory: string): string[] => {
    const found: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) found.push(...typeScriptFilesUnder(full));
        else if (/\.ts$/.test(entry.name)) found.push(full);
    }
    return found;
};

const SOURCE_FILES = typeScriptFilesUnder(SRC)
    .map(path => relative(SRC, path).split('\\').join('/'))
    .filter(path => !/(^|\/)tests\//.test(path))
    .sort();

const filesNaming = (word: string): string[] => SOURCE_FILES
    .map(path => `${path} ${occurrencesOf(word, codeOf(path))}`)
    .filter(line => !line.endsWith(' 0'));

const PUBLIC_MEMBER = /^ {4}public (?:override )?(?:readonly )?([A-Za-z_$][\w$]*)\s*(?:<[\s\S]*?>)?\s*(?:\(|=\s*\(|:\s*\()/gm;

const PUBLIC_FIELD = /^ {4}(?:declare )?public (?:abstract )?readonly ([A-Za-z_$][\w$]*)\s*[:=]/gm;

const namesMatchedIn = (pattern: RegExp, paths: readonly string[]): string[] => {
    const found = new Set<string>();
    for (const path of paths) {
        const text = codeOf(path);
        pattern.lastIndex = 0;
        let match = pattern.exec(text);
        while (match !== null) {
            if (match[1] !== 'constructor') found.add(match[1]);
            match = pattern.exec(text);
        }
    }
    return [...found].sort();
};

type TComposition = {
    service: readonly string[];
    parts: Record<string, readonly string[]>;
    slotParts: Record<string, readonly string[]>;
};

const publicDoorsOf = (composition: TComposition): string[] => {
    const doors = namesMatchedIn(PUBLIC_MEMBER, composition.service);
    for (const [part, paths] of [...Object.entries(composition.parts), ...Object.entries(composition.slotParts)]) {
        for (const member of namesMatchedIn(PUBLIC_MEMBER, paths)) doors.push(`${part}.${member}`);
    }
    return doors.sort();
};

const SLOT_OWNER = ['engine/slot/OIMSlotOwner.ts'] as const;

const ENTITY_COMPOSITION: TComposition = {
    service: ['facade/slot/OIMSlotCollectionService.ts', 'facade/slot/OIMSlotColumnService.ts'],
    parts: { slotContentService: ['engine/entity/OIMSlotContentEntityService.ts'] },
    slotParts: { owner: SLOT_OWNER },
};

const BUCKET_COMPOSITION: TComposition = {
    service: ['facade/slot/OIMSlotCollectionService.ts', 'facade/slot/OIMSlotColumnService.ts'],
    parts: {
        slotContentService: [
            'facade/bucket/OIMSlotContentBucketService.ts',
            'facade/bucket/OIMSlotContentBucketServiceArrayBased.ts',
            'facade/bucket/OIMSlotContentBucketServiceArrayDriven.ts',
        ],
    },
    slotParts: { owner: SLOT_OWNER },
};

const SINGLE_ENTITY_COMPOSITION: TComposition = {
    service: ['facade/slot/OIMSingleSlotService.ts', 'facade/slot/OIMSlotColumnService.ts'],
    parts: { slotContentService: ['engine/entity/OIMSlotContentEntityService.ts'] },
    slotParts: { owner: SLOT_OWNER },
};

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, string>;
type TBucket = TOIMBucketSlot<TOIMBucketSlotsArrayStore<TCardSlot>, TOIMStoreKey>;

const REFUSAL = 'writes are refused for the whole of a flush';

const messagesOf = (error: unknown): string => {
    if (error instanceof AggregateError) {
        return error.errors.map(one => (one instanceof Error ? one.message : String(one))).join(' | ');
    }
    return error instanceof Error ? error.message : String(error);
};

type TFixture<TSubject> = {
    db: OIMDB;
    subject: TSubject;
    duringTheFlush: (door: () => void) => void;
};

const madeInAFlush = <TSubject>(build: (db: OIMDB) => TSubject): TFixture<TSubject> => {
    let during: (() => void) | undefined = undefined;
    const db = new OIMDB({
        errorPolicy: new OIMErrorPolicyThrowAtOnce(),
        onBeforeFlush: () => { during?.(); },
    });
    const subject = build(db);
    db.flush();
    return { db, subject, duringTheFlush: door => { during = door; } };
};

const whatTheDoorSaysInAFlush = <TSubject>(
    fixture: TFixture<TSubject>, door: (subject: TSubject) => void,
): string => {
    fixture.duringTheFlush(() => { door(fixture.subject); });
    try {
        fixture.db.flush();
    } catch (error) {
        return messagesOf(error);
    }
    return 'the door was taken, and nothing refused it';
};

const doorsThatDoNotRefuse = <TSubject>(
    world: () => TFixture<TSubject>, writeDoors: Record<string, (subject: TSubject) => void>,
): string[] => Object.entries(writeDoors)
    .map(([name, door]) => `${name}: ${whatTheDoorSaysInAFlush(world(), door)}`)
    .filter(said => !said.includes(REFUSAL));

const namedInPart = (part: string, members: readonly string[]): string[] => members.map(member => `${part}.${member}`);

const SLOT_OWNER_DOORS_THAT_WRITE_NOTHING = namedInPart('owner', [
    'holdSlot', 'unholdSlot', 'subscribeToSlot', 'unsubscribeFromSlot', 'releaseSlotIfUnheld',
]);

const COLUMN_DOORS = [
    'getColumn', 'holdColumn', 'getAnyColumn', 'holdAnyColumn', 'getColumnGroup', 'holdColumnGroup', 'unholdColumn',
] as const;

const STORE_SLOT_DOORS_THAT_WRITE_NOTHING = [
    'createStoreSlot', 'createStoreSlotFrom',
    'isSameKey', 'getSlotCount', 'getSlots', 'findSlotByKey', 'hasSlotContentByKey', 'getSlotByKey', 'holdSlotByKey',
    ...COLUMN_DOORS,
] as const;

type TEntitySlotWriter<TSlot> = {
    writeEntity(slot: TSlot, entity: TCard): boolean;
    updateEntity(slot: TSlot, patch: Partial<TCard>): TSlot;
    updateEntityColumn(slot: TSlot, columnName: 'title', value: string): TSlot;
    deleteEntityColumns(slot: TSlot, columnNames: readonly 'title'[]): TSlot;
    markEntityChanged(slot: TSlot): void;
    deleteEntity(slot: TSlot): void;
};

const entitySlotWriteDoors = <TSubject, TSlot>(
    entitySlotWriterOf: (subject: TSubject) => TEntitySlotWriter<TSlot>, slotOf: (subject: TSubject) => TSlot,
): Record<string, (subject: TSubject) => void> => ({
    'slotContentService.writeEntity': s => { entitySlotWriterOf(s).writeEntity(slotOf(s), { id: 'a', title: 'B' }); },
    'slotContentService.updateEntity': s => { entitySlotWriterOf(s).updateEntity(slotOf(s), { title: 'B' }); },
    'slotContentService.updateEntityColumn': s => { entitySlotWriterOf(s).updateEntityColumn(slotOf(s), 'title', 'B'); },
    'slotContentService.deleteEntityColumns': s => { entitySlotWriterOf(s).deleteEntityColumns(slotOf(s), ['title']); },
    'slotContentService.markEntityChanged': s => { entitySlotWriterOf(s).markEntityChanged(slotOf(s)); },
    'slotContentService.deleteEntity': s => { entitySlotWriterOf(s).deleteEntity(slotOf(s)); },
});

const cardEntityService = (db: OIMDB) => createOIMEntityService<TCard, keyof TCard & string, string>(db, { keyOf: card => card.id });

type TCardEntityService = ReturnType<typeof cardEntityService>;

const cardIndexService = (db: OIMDB) => createOIMIndexService(db, {
    entityService: cardEntityService(db), keyOf: (card: TCard) => card.title,
});
type TCardIndexService = ReturnType<typeof cardIndexService>;
type TCardStoreSlot = ReturnType<TCardEntityService['createStoreSlot']>;

type TEntitySubject = {
    cardEntityService: TCardEntityService;
    cardStoreSlot: TCardStoreSlot;
    spareCardStoreSlot: TCardStoreSlot;
    card: TCardSlot;
};

const entityWorld = (): TFixture<TEntitySubject> => madeInAFlush(db => {
    const entityService = cardEntityService(db);
    const cardStoreSlot = entityService.createStoreSlot(db);
    const spareCardStoreSlot = entityService.createStoreSlot(db);
    entityService.slotContentService.upsertEntity(cardStoreSlot, { id: 'a', title: 'A' });
    return {
        cardEntityService: entityService, cardStoreSlot, spareCardStoreSlot,
        card: entityService.getSlotByKey(cardStoreSlot, 'a'),
    };
});

const ENTITY_WRITE_DOORS: Record<string, (subject: TEntitySubject) => void> = {
    'slotContentService.fillEntities': s => {
        s.cardEntityService.slotContentService.fillEntities(s.spareCardStoreSlot, ['b'], [{ id: 'b', title: 'B' }]);
    },
    'slotContentService.insertEntity': s => {
        s.cardEntityService.slotContentService.insertEntity(s.spareCardStoreSlot, 'b', { id: 'b', title: 'B' });
    },
    'slotContentService.insertEntities': s => {
        s.cardEntityService.slotContentService.insertEntities(s.spareCardStoreSlot, [{ id: 'b', title: 'B' }]);
    },
    'slotContentService.clearAllEntities': s => { s.cardEntityService.slotContentService.clearAllEntities(s.cardStoreSlot); },
    'slotContentService.deleteEntities': s => { s.cardEntityService.slotContentService.deleteEntities(s.cardStoreSlot, [s.card]); },
    'slotContentService.upsertEntity': s => {
        s.cardEntityService.slotContentService.upsertEntity(s.cardStoreSlot, { id: 'a', title: 'B' });
    },
    'slotContentService.upsertEntities': s => {
        s.cardEntityService.slotContentService.upsertEntities(s.cardStoreSlot, [{ id: 'a', title: 'B' }]);
    },
    ...entitySlotWriteDoors<TEntitySubject, TCardSlot>(s => s.cardEntityService.slotContentService, s => s.card),
};

const ENTITY_DOORS_THAT_WRITE_NOTHING = [
    'slotContentService.findEntityByKey', 'slotContentService.keyOf',
    ...STORE_SLOT_DOORS_THAT_WRITE_NOTHING,
    ...SLOT_OWNER_DOORS_THAT_WRITE_NOTHING,
] as const;

const cardBucketService = (db: OIMDB) =>
    createOIMBucketService(db, { slotContentService: new OIMSlotContentBucketServiceArrayDriven<TCardSlot>() });

type TCardBucketService = ReturnType<typeof cardBucketService>;
type TCardBucketStoreSlot = ReturnType<TCardBucketService['createStoreSlot']>;

type TBucketSubject = {
    bucketService: TCardBucketService;
    membersService: OIMSlotContentBucketServiceArrayDriven<TCardSlot>;
    searchStoreSlot: TCardBucketStoreSlot;
    bucket: TBucket;
    card: TCardSlot;
};

const bucketWorld = (): TFixture<TBucketSubject> => madeInAFlush(db => {
    const entityService = cardEntityService(db);
    const cardStoreSlot = entityService.createStoreSlot(db);
    entityService.slotContentService.upsertEntity(cardStoreSlot, { id: 'a', title: 'A' });
    entityService.slotContentService.upsertEntity(cardStoreSlot, { id: 'b', title: 'B' });
    const card = entityService.getSlotByKey(cardStoreSlot, 'a');
    const bucketService = cardBucketService(db);
    const membersService = bucketService.slotContentService;
    const searchStoreSlot = bucketService.createStoreSlot(db);
    const bucket = bucketService.holdSlotByKey(searchStoreSlot, 'q');
    membersService.writeBucketMemberSlots(bucket, [card, entityService.getSlotByKey(cardStoreSlot, 'b')]);
    return { bucketService, membersService, searchStoreSlot, bucket, card };
});

const BUCKET_WRITE_DOORS: Record<string, (subject: TBucketSubject) => void> = {
    'slotContentService.markContentChanged': s => { s.membersService.markContentChanged(s.bucket); },
    'slotContentService.markBucketColumnsChanged': s => { s.membersService.markBucketColumnsChanged(s.bucket, undefined, ['title']); },
    'slotContentService.addBucketMemberSlot': s => { s.membersService.addBucketMemberSlot(s.bucket, s.card); },
    'slotContentService.removeBucketMemberSlot': s => { s.membersService.removeBucketMemberSlot(s.bucket, s.card); },
    'slotContentService.addBucketMemberSlots': s => { s.membersService.addBucketMemberSlots(s.bucket, [s.card]); },
    'slotContentService.removeBucketMemberSlots': s => { s.membersService.removeBucketMemberSlots(s.bucket, [s.card]); },
    'slotContentService.writeBucketMemberSlots': s => { s.membersService.writeBucketMemberSlots(s.bucket, []); },
    'slotContentService.clearBucketMemberSlots': s => { s.membersService.clearBucketMemberSlots(s.bucket); },
    'slotContentService.insertBucketMemberSlotAt': s => { s.membersService.insertBucketMemberSlotAt(s.bucket, 0, s.card); },
    'slotContentService.removeBucketMemberSlotAt': s => { s.membersService.removeBucketMemberSlotAt(s.bucket, 0); },
    'slotContentService.removeBucketMemberSlotRange': s => { s.membersService.removeBucketMemberSlotRange(s.bucket, 0, 1); },
    'slotContentService.moveBucketMemberSlotToPosition': s => { s.membersService.moveBucketMemberSlotToPosition(s.bucket, 0, 1); },
    'slotContentService.moveBucketMemberSlotRangeToPosition': s => {
        s.membersService.moveBucketMemberSlotRangeToPosition(s.bucket, 0, 1, 1);
    },
};

const reachesNoHookTheOwnerCalls = (s: TBucketSubject): void => {
    // @ts-expect-error protected
    s.membersService.releaseSlotContent(s.bucket, s.bucket.owner);
    // @ts-expect-error protected
    s.membersService.onSubframeClosed(s.searchStoreSlot, s.bucket.owner);
    // @ts-expect-error protected
    s.membersService.createSlot('q', s.searchStoreSlot, s.bucket.owner);
    // @ts-expect-error protected
    s.membersService.hasReference(s.bucket);
    // @ts-expect-error private
    s.membersService.slotContentStrategy.releaseSlotContent(s.bucket, s.bucket.owner);
    // @ts-expect-error not on IOIMSlotOwner
    s.bucket.owner.assertWritable(s.bucket);
    // @ts-expect-error not on IOIMSlotOwner
    s.bucket.owner.markEmptiness(s.bucket, true);
    // @ts-expect-error not on IOIMSlotOwner
    s.bucket.owner.dispatchContentChange(s.bucket);
    // @ts-expect-error not on IOIMSlotOwner
    s.bucket.owner.columnOwner.markColumnsChanged(s.bucket, undefined, undefined, s.searchStoreSlot.channelSlot);
};

const BUCKET_DOORS_THAT_WRITE_NOTHING = [
    'slotContentService.createSlotOwnerService', 'slotContentService.isSlotEmpty',
    'slotContentService.fillBucketMemberSlots',
    'slotContentService.getBucketMemberSlots', 'slotContentService.getBucketMemberSlotCount',
    'slotContentService.hasBucketMemberSlot', 'slotContentService.getBucketMemberSlotAt',
    'slotContentService.getBucketMemberSlotPosition',
    ...STORE_SLOT_DOORS_THAT_WRITE_NOTHING,
    ...SLOT_OWNER_DOORS_THAT_WRITE_NOTHING,
] as const;

const singleCardEntityService = (db: OIMDB) => createOIMSingleEntityService<TCard>(db);

type TSingleCardSlot = TOIMEntitySlot<TCard, void>;
type TSingleCardEntityService = ReturnType<typeof singleCardEntityService>;

type TSingleEntitySubject = {
    singleCardEntityService: TSingleCardEntityService;
    singleCard: TSingleCardSlot;
};

const singleEntityWorld = (): TFixture<TSingleEntitySubject> => madeInAFlush(db => {
    const entityService = singleCardEntityService(db);
    const singleCardStoreSlot = entityService.createStoreSlot(db);
    const singleCard = entityService.holdSingleSlot(singleCardStoreSlot);
    entityService.slotContentService.writeEntity(singleCard, { id: 'a', title: 'A' });
    return { singleCardEntityService: entityService, singleCard };
});

const SINGLE_ENTITY_WRITE_DOORS: Record<string, (subject: TSingleEntitySubject) => void> = {
    ...entitySlotWriteDoors<TSingleEntitySubject, TSingleCardSlot>(s => s.singleCardEntityService.slotContentService, s => s.singleCard),
};

const everyDoorOf = (
    writeDoorLists: readonly Record<string, unknown>[], writeNothing: readonly string[],
): string[] => [...new Set([...writeDoorLists.flatMap(writeDoors => Object.keys(writeDoors)), ...writeNothing])].sort();

const everyFieldOf = (composition: TComposition): string[] => Object.keys(composition.parts).sort();

describe('who may say a write is refused', () => {
    it('names the flush only in the channel that owns the answer, in the one assertWritable body, and in the index', () => {
        expect(filesNaming('assertNotFlushing')).toEqual([
            'engine/channel/OIMChannelService.ts 2',
            'engine/slot/OIMSlotOwnerService.ts 1',
            'facade/index/OIMIndexService.ts 1',
        ]);
    });

    it('builds the refusal in the channel alone, and lets two readers consult it', () => {
        expect(filesNaming('isRefusingWrites')).toEqual([
            'engine/channel/OIMChannelService.ts 2',
            'engine/slot/OIMSlotOwnerService.ts 1',
            'facade/index/OIMIndexService.ts 3',
        ]);
        expect(codeOf('engine/channel/OIMChannelService.ts').replace(/\s+/g, ' '))
            .toContain('public isRefusingWrites(channelSlot: TOIMChannelSlot): boolean { return channelSlot.isFlushing; }');
    });

    it('declares assertWritable with one shape, and that shape takes the slot', () => {
        const declarations: string[] = [];
        for (const path of SOURCE_FILES) {
            const pattern = /(?:public|private|protected) (?:override )?assertWritable\(([^)]*)\)/g;
            const code = codeOf(path);
            let match = pattern.exec(code);
            while (match !== null) {
                declarations.push(`${path} ${match[1].replace(/<[^>]*>/g, '').trim()}`);
                match = pattern.exec(code);
            }
        }

        expect(declarations.sort()).toEqual([
            'engine/slot/OIMSlotOwnerService.ts slot: TOIMSlot',
        ]);
        for (const declaration of declarations) {
            expect(declaration.split(' ').slice(1).join(' ')).not.toContain(',');
        }
    });

    it('asks assertWritable from these files and no others', () => {
        expect(SOURCE_FILES.filter(path => /\.assertWritable\(/.test(codeOf(path)))).toEqual([
            'engine/entity/OIMSlotContentEntityService.ts',
            'engine/slot/OIMSlotOwnerService.ts',
            'facade/bucket/OIMSlotContentBucketService.ts',
            'facade/bucket/OIMSlotContentBucketServiceArrayDriven.ts',
            'facade/bucket/OIMSlotContentBucketServiceSortedArrayDriven.ts',
        ]);
    });

    it('holds exactly the parts it walks in every service', () => {
        expect(namesMatchedIn(PUBLIC_FIELD, ENTITY_COMPOSITION.service)).toEqual(everyFieldOf(ENTITY_COMPOSITION));
        expect(namesMatchedIn(PUBLIC_FIELD, BUCKET_COMPOSITION.service)).toEqual(everyFieldOf(BUCKET_COMPOSITION));
        expect(namesMatchedIn(PUBLIC_FIELD, SINGLE_ENTITY_COMPOSITION.service)).toEqual(everyFieldOf(SINGLE_ENTITY_COMPOSITION));
    });

    it('classifies every public door of an entity collection and of its parts', () => {
        expect(publicDoorsOf(ENTITY_COMPOSITION))
            .toEqual(everyDoorOf([ENTITY_WRITE_DOORS], ENTITY_DOORS_THAT_WRITE_NOTHING));
    });

    it('classifies every public door of a bucket collection and of its parts', () => {
        expect(publicDoorsOf(BUCKET_COMPOSITION))
            .toEqual(everyDoorOf([BUCKET_WRITE_DOORS], BUCKET_DOORS_THAT_WRITE_NOTHING));
    });

    it('refuses every write door of an entity collection inside a flush', () => {
        expect(doorsThatDoNotRefuse(entityWorld, ENTITY_WRITE_DOORS)).toEqual([]);
    });

    it('refuses every write door of a bucket collection inside a flush', () => {
        expect(doorsThatDoNotRefuse(bucketWorld, BUCKET_WRITE_DOORS)).toEqual([]);
    });

    it('hands a caller no hook the owner calls, neither on the content service nor on a bucket slot', () => {
        expect(reachesNoHookTheOwnerCalls).toBeInstanceOf(Function);
    });

    it('hands a caller of the entity content service its owner only as IOIMSlotOwner, with no write door on it', () => {
        const writeDoorsOf = (slotContentService: TCardEntityService['slotContentService']): unknown[] => [
            // @ts-expect-error assertWritable is not on IOIMSlotOwner
            slotContentService.slotOwner.assertWritable,
            // @ts-expect-error fileSlot is not on IOIMSlotOwner
            slotContentService.slotOwner.fileSlot,
            // @ts-expect-error columnOwner is not on IOIMSlotOwner
            slotContentService.slotOwner.columnOwner,
        ];
        expect(writeDoorsOf).toBeInstanceOf(Function);
    });

    it('hands a caller of an auto-index its buckets to read and no door that writes them', () => {
        const doorsOf = (slotContentService: TCardIndexService['slotContentService']): unknown[] => [
            slotContentService.getBucketMemberSlots,
            slotContentService.getBucketMemberSlotCount,
            slotContentService.hasBucketMemberSlot,
            slotContentService.getBucketMemberSlotAt,
            slotContentService.getBucketMemberSlotPosition,
            // @ts-expect-error a write door of the index's buckets
            slotContentService.addBucketMemberSlot,
            // @ts-expect-error a write door of the index's buckets
            slotContentService.removeBucketMemberSlot,
            // @ts-expect-error a write door of the index's buckets
            slotContentService.writeBucketMemberSlots,
            // @ts-expect-error a write door of the index's buckets
            slotContentService.clearBucketMemberSlots,
            // @ts-expect-error a write door of the index's buckets
            slotContentService.fillBucketMemberSlots,
            // @ts-expect-error a write door of the index's buckets
            slotContentService.markBucketColumnsChanged,
            // @ts-expect-error a write door of the index's buckets
            slotContentService.insertBucketMemberSlotAt,
            // @ts-expect-error a write door of the index's buckets
            slotContentService.moveBucketMemberSlotToPosition,
            // @ts-expect-error a write door of the index's buckets
            slotContentService.createSlotOwnerService,
        ];
        expect(doorsOf).toBeInstanceOf(Function);
    });

    it('refuses every write door of the entity service on a single slot inside a flush', () => {
        expect(doorsThatDoNotRefuse(singleEntityWorld, SINGLE_ENTITY_WRITE_DOORS)).toEqual([]);
    });
});
