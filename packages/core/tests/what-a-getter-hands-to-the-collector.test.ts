/**
 * HIS RULE: a mint on a GETTER must be handed to the unused-slot collector. On a
 * hold or a subscription it need not be — those leave a count and an effect, and
 * the identity cannot be unfiled under the caller. A getter leaves NOTHING, so
 * without the collector the caller holds a slot the next sweep unfiles, the next
 * resolution of the same key mints a SECOND identity, and the first reads empty
 * for ever with nothing thrown.
 *
 * The net is textual: a method body is read between its braces, and a mint is a
 * call to one of the primitives pinned below. A mint reached through a helper
 * this census does not know is invisible to it, which is why the primitive set
 * is pinned too — a new way to file an identity makes this red before it can
 * hide behind a getter.
 *
 * Nothing shells out: BSD grep goes blind on a file holding a NUL byte, and this
 * package has carried them.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

const SRC = join(__dirname, '..', 'src');

const sourceFiles = (): string[] => {
    const found: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory() && entry.name === 'tests') continue;
            const path = join(dir, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (entry.isFile() && path.endsWith('.ts')) found.push(path);
        }
    };
    walk(SRC);
    return found.sort();
};

const relative = (path: string): string => path.slice(SRC.length + 1).split(sep).join('/');

/** Comments and string bodies blanked, every byte position kept. */
const codeOnly = (text: string): string => {
    const out = text.split('');
    let i = 0;
    while (i < text.length) {
        const here = text[i];
        const next = text[i + 1];
        if (here === '/' && next === '/') {
            while (i < text.length && text[i] !== '\n') { out[i] = ' '; i++; }
            continue;
        }
        if (here === '/' && next === '*') {
            out[i] = ' '; out[i + 1] = ' '; i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
                if (text[i] !== '\n') out[i] = ' ';
                i++;
            }
            if (i < text.length) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
            continue;
        }
        if (here === '\'' || here === '"' || here === '`') {
            out[i] = ' '; i++;
            while (i < text.length && text[i] !== here) {
                if (text[i] === '\\') { out[i] = ' '; i++; }
                if (i < text.length && text[i] !== '\n') out[i] = ' ';
                i++;
            }
            if (i < text.length) { out[i] = ' '; i++; }
            continue;
        }
        i++;
    }
    return out.join('');
};

type TMethod = { file: string; name: string; body: string };

const DECLARATION = /^ {4}(?:public |private |protected |)(?:override |)(?:async |)([A-Za-z][A-Za-z0-9]*)\s*(?:<[^>]*>)?\(/;

/** A method is its declaration line to the brace that closes it, counted. */
const methodsIn = (file: string, code: string): TMethod[] => {
    const lines = code.split('\n');
    const found: TMethod[] = [];
    for (let i = 0; i < lines.length; i++) {
        const declared = DECLARATION.exec(lines[i]);
        if (declared === null) continue;
        let depth = 0;
        let opened = false;
        const taken: string[] = [];
        for (let j = i; j < lines.length; j++) {
            taken.push(lines[j]);
            for (const char of lines[j]) {
                if (char === '{') { depth++; opened = true; }
                else if (char === '}') depth--;
            }
            if (opened && depth <= 0) break;
        }
        if (!opened) continue;
        found.push({ file, name: declared[1], body: taken.join('\n') });
    }
    return found;
};

const allMethods = (): TMethod[] => {
    const found: TMethod[] = [];
    for (const path of sourceFiles()) {
        found.push(...methodsIn(relative(path), codeOnly(readFileSync(path, 'utf8'))));
    }
    return found;
};

/**
 * The primitives that file a brand-new identity under a key. `createSlot` makes
 * the object and `slotStoreService.set` files it; either alone is not a mint, so
 * both spellings count and the pin below says which method is which.
 */
const MINT_PRIMITIVE = /\bmintSlotByKey\(|\bmintSingleSlot\(|\bmintUnfiledColumnSlot\(|\bcreateSlot(?:<[^>(]*>)?(?::\s*)?\(/;
const TRACKS = /\.holdSlotUntilFlush\(/;
const GETTER_SHAPED = /^(?:get|find|resolve|peek|read|at)(?:[A-Z].*)?$/;

/** A getter that mints nothing itself but asks one of these, which mints and tracks. */
const TRACKED_DOOR = /\.getSlotByKey\(|\bgetColumn\(/;

const signature = (method: TMethod): string => `${method.file} ${method.name}`;

describe('what a getter hands to the collector', () => {
    const methods = allMethods();
    const mints = methods.filter(method => MINT_PRIMITIVE.test(method.body));

    it('is the whole list of ways an identity gets filed, so a new one cannot hide behind a getter', () => {
        expect(mints.map(signature).sort()).toEqual([
            'engine/column/OIMColumnOwner.ts getColumn',
            'engine/column/OIMColumnOwner.ts holdColumn',
            'engine/column/OIMColumnOwner.ts mintUnfiledColumnSlot',
            'engine/computed/OIMSlotContentComputedStrategy.ts createSlot',
            'engine/entity/OIMSlotContentEntityService.ts constructor',
            'engine/entity/OIMSlotContentEntityService.ts fillEachEntity',
            'engine/entity/OIMSlotContentEntityService.ts insertEntity',
            'engine/slot/OIMSlotOwnerService.ts createSlot',
            'facade/bucket/OIMSlotContentBucketService.ts constructor',
            'facade/bucket/OIMSlotContentBucketService.ts createSlot',
            'facade/slot/OIMSingleSlotService.ts getSingleSlot',
            'facade/slot/OIMSingleSlotService.ts holdSingleSlot',
            'facade/slot/OIMSingleSlotService.ts mintSingleSlot',
            'facade/slot/OIMSlotCollectionService.ts getSlotByKey',
            'facade/slot/OIMSlotCollectionService.ts holdSlotByKey',
            'facade/slot/OIMSlotCollectionService.ts mintSlotByKey',
        ]);
    });

    it('is the collector, for every getter-shaped door that mints', () => {
        const gettersThatMint = mints.filter(method => GETTER_SHAPED.test(method.name));
        const untracked = gettersThatMint.filter(method => !TRACKS.test(method.body));

        expect(gettersThatMint.map(signature).sort()).toEqual([
            'engine/column/OIMColumnOwner.ts getColumn',
            'facade/slot/OIMSingleSlotService.ts getSingleSlot',
            'facade/slot/OIMSlotCollectionService.ts getSlotByKey',
        ]);
        expect(untracked.map(signature)).toEqual([]);
    });

    it('is nothing, for the doors that leave a count or a value instead', () => {
        const unnamed = mints
            .filter(method => !GETTER_SHAPED.test(method.name))
            .filter(method => !TRACKS.test(method.body))
            .map(signature)
            .sort();

        expect(unnamed).toEqual([
            'engine/column/OIMColumnOwner.ts holdColumn',
            'engine/column/OIMColumnOwner.ts mintUnfiledColumnSlot',
            'engine/computed/OIMSlotContentComputedStrategy.ts createSlot',
            'engine/entity/OIMSlotContentEntityService.ts constructor',
            'engine/entity/OIMSlotContentEntityService.ts fillEachEntity',
            'engine/entity/OIMSlotContentEntityService.ts insertEntity',
            'engine/slot/OIMSlotOwnerService.ts createSlot',
            'facade/bucket/OIMSlotContentBucketService.ts constructor',
            'facade/bucket/OIMSlotContentBucketService.ts createSlot',
            'facade/slot/OIMSingleSlotService.ts holdSingleSlot',
            'facade/slot/OIMSingleSlotService.ts mintSingleSlot',
            'facade/slot/OIMSlotCollectionService.ts holdSlotByKey',
            'facade/slot/OIMSlotCollectionService.ts mintSlotByKey',
        ]);
    });

    it('is the tracked door it asks, for a getter that mints through another one', () => {
        const borrowers = methods
            .filter(method => GETTER_SHAPED.test(method.name))
            .filter(method => !MINT_PRIMITIVE.test(method.body))
            .filter(method => TRACKED_DOOR.test(method.body))
            .map(signature)
            .sort();

        expect(borrowers).toEqual([
            'engine/column/OIMColumnOwner.ts getAnyColumn',
            'facade/index/OIMIndexService.ts getAnyBucketColumnByKey',
            'facade/index/OIMIndexService.ts getBucketColumnByKey',
            'facade/index/OIMIndexService.ts getEntitiesByKey',
            'facade/index/OIMIndexService.ts getSlotByKey',
            'facade/index/OIMIndexService.ts getSlotsByKeys',
            'facade/slot/OIMSlotColumnService.ts getColumn',
        ]);
    });
});
