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
            else if (entry.isFile()) found.push(path);
        }
    };
    walk(SRC);
    return found.sort();
};

const relative = (path: string): string => path.slice(SRC.length + 1).split(sep).join('/');

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
            i++;
            while (i < text.length && text[i] !== here) {
                if (text[i] === '\\') { out[i] = ' '; i++; }
                if (i >= text.length) break;
                if (text[i] !== '\n') out[i] = ' ';
                i++;
            }
            i++;
            continue;
        }
        i++;
    }
    return out.join('');
};

type TFile = { path: string; code: string };

const files: TFile[] = sourceFiles().map(path => ({
    path: relative(path),
    code: codeOnly(readFileSync(path).toString('latin1')),
}));

const MUTATING_CALL = /[sS]lotStoreService\s*\??\.\s*(set|remove)\s*\(/g;

const READING_CALL = /[sS]lotStoreService\s*\??\.\s*(get|getSlots|getSlotCount|isSameKey)\s*\(/g;

const callsIn = (pattern: RegExp): string[] => {
    const found: string[] = [];
    for (const file of files) {
        const counts = new Map<string, number>();
        pattern.lastIndex = 0;
        let match = pattern.exec(file.code);
        while (match !== null) {
            counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
            match = pattern.exec(file.code);
        }
        if (counts.size === 0) continue;
        const parts = [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, n]) => `${name}×${n}`);
        found.push(`${file.path} ${parts.join(' ')}`);
    }
    return found.sort();
};

const SLOT_OWNER_SERVICE = 'engine/slot/OIMSlotOwnerService.ts';

const PINNED_WRITERS: readonly string[] = [
    'engine/column/OIMColumnOwner.ts remove×1 set×1',
    `${SLOT_OWNER_SERVICE} remove×1 set×1`,
];

const READING_SERVICES: readonly string[] = [
    'engine/entity/OIMSlotContentEntityService.ts',
    'facade/slot/OIMSingleSlotService.ts',
    'facade/slot/OIMSlotCollectionService.ts',
];

describe('who may write the slot store', () => {
    it('reads a tree with something in it', () => {
        expect(files.length).toBeGreaterThan(50);
        expect(files.some(file => file.path === SLOT_OWNER_SERVICE)).toBe(true);
        for (const path of READING_SERVICES) expect(files.some(file => file.path === path)).toBe(true);
    });

    it('is written by the slot owner service and the column owner, and by nothing else', () => {
        expect(callsIn(MUTATING_CALL)).toEqual(PINNED_WRITERS);
    });

    it('is read by the services without writing it', () => {
        for (const path of READING_SERVICES) {
            expect(callsIn(READING_CALL).filter(entry => entry.startsWith(`${path} `)).length).toBe(1);
            expect(callsIn(MUTATING_CALL).some(entry => entry.startsWith(`${path} `))).toBe(false);
        }
    });
});
