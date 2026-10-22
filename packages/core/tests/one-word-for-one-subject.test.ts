import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', 'src');

/**
 * One subject, one word. `banned` is a word this library does not use, `use` is
 * the word its public API has for that subject. A second word for one subject is
 * the defect: a reader cannot tell whether two names mean two things.
 */
const INSTEAD_OF: readonly { readonly banned: RegExp; readonly use: string }[] = [
    { banned: /\brows?\b/i, use: 'slot, or entity for what a slot holds' },
    { banned: /\bcarriers?\b/i, use: 'bucket — the slot that carries the container' },
    { banned: /\bfields?\b/i, use: 'column' },
    { banned: /\bitems?\b/i, use: 'entity' },
];

// The `fillEntity(slot, item)` door that held the four exemptions says `entity` on
// every side of it now, so nothing under src is exempt.
const EXEMPT: readonly string[] = [];

const sourceFiles = (): string[] => {
    const found: string[] = [];
    const walk = (dir: string): void => {
        for (const name of readdirSync(dir)) {
            if (name === 'tests') continue;
            const path = join(dir, name);
            if (statSync(path).isDirectory()) walk(path);
            else if (path.endsWith('.ts')) found.push(path);
        }
    };
    walk(SRC);
    return found.sort();
};

const shown = (path: string): string => path.slice(SRC.length + 1).split('\\').join('/');

describe('one word for one subject', () => {
    it('uses only this library\'s own word for each subject, anywhere under src', () => {
        const offences: string[] = [];
        expect(sourceFiles().length).toBeGreaterThan(100);
        for (const path of sourceFiles()) {
            const where = shown(path);
            if (EXEMPT.includes(where)) continue;
            const lines = readFileSync(path, 'utf8').split('\n');
            for (let at = 0; at < lines.length; at++) {
                for (const { banned, use } of INSTEAD_OF) {
                    if (!banned.test(lines[at])) continue;
                    offences.push(`${where}:${at + 1} — say ${use}. Line: ${lines[at].trim()}`);
                }
            }
        }
        expect(offences).toEqual([]);
    });

    it('names no exempt file that has left the tree', () => {
        const tree = new Set(sourceFiles().map(shown));
        expect(EXEMPT.filter(path => !tree.has(path))).toEqual([]);
    });
});
