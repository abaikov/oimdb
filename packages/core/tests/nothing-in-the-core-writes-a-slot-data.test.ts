import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

const SRC = join(__dirname, '..', 'src');

const FIELD = 'data';

const sourceFiles = (): string[] => {
    const found: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory() && entry.name === 'tests') continue;
            const path = join(dir, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
                found.push(path);
            }
        }
    };
    walk(SRC);
    return found.sort();
};

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

const COMPOUND = String.raw`(?:\?\?|\|\||&&|\*\*|[-+*/%&|^]|<<|>>>?)?`;
const ASSIGN = new RegExp(String.raw`^\s*${COMPOUND}=(?![=>])`);
const INCREMENT_AFTER = /^\s*(?:\+\+|--)/;
const INCREMENT_BEFORE = /(?:\+\+|--)\s*$/;
const MUTATING_CALL = /^\s*\??\.\s*(?:push|pop|shift|unshift|splice|fill|sort|reverse|copyWithin|set|add|delete|clear)\s*\(/;
const LENGTH_ASSIGN = new RegExp(String.raw`^\s*\.\s*length\s*${COMPOUND}=(?!=)`);
const INDEX_ASSIGN = new RegExp(String.raw`^\s*\[[^\]]*\]\s*${COMPOUND}=(?!=)`);
const DECLARATION_BEFORE = /(?:^|[\s(,{])(?:public|private|protected|readonly|let|const|var)\s+(?:readonly\s+)?$/;

const wordFor = (name: string): RegExp =>
    new RegExp(String.raw`(?<![A-Za-z0-9_$])${name}(?![A-Za-z0-9_$])`, 'g');

const aliasBinding = new RegExp(
    String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*\(?\s*`
    + String.raw`[A-Za-z0-9_$.?\[\]()<>\s]*\.${FIELD}\s*(?:\?\?=|\)?\s*(?:as\b[^;]*)?;)`,
    'g',
);

const isWriteOrMutation = (before: string, after: string): boolean =>
    ASSIGN.test(after) || INCREMENT_AFTER.test(after) || INCREMENT_BEFORE.test(before.replace(/\s+$/, ''))
    || MUTATING_CALL.test(after) || LENGTH_ASSIGN.test(after) || INDEX_ASSIGN.test(after);

const writesToSlotData = (source: string): { line: number; text: string }[] => {
    const lines = codeOnly(source).split('\n');
    const joined = lines.join('\n');
    const aliases = new Set<string>();
    aliasBinding.lastIndex = 0;
    let bound = aliasBinding.exec(joined);
    while (bound !== null) { aliases.add(bound[1]); bound = aliasBinding.exec(joined); }

    const sites: { line: number; text: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const field = wordFor(FIELD);
        let match = field.exec(line);
        while (match !== null) {
            const before = line.slice(0, match.index).replace(/\s+$/, '');
            const after = line.slice(match.index + FIELD.length);
            const onOwner = before.endsWith('.') || (before === '' && i > 0 && /\.\s*$/.test(lines[i - 1]));
            if (onOwner && isWriteOrMutation(before, after)) sites.push({ line: i + 1, text: line.trim() });
            match = field.exec(line);
        }
        for (const name of aliases) {
            const local = wordFor(name);
            let hit = local.exec(line);
            while (hit !== null) {
                const before = line.slice(0, hit.index);
                const after = line.slice(hit.index + name.length);
                const isField = before.replace(/\s+$/, '').endsWith('.') || DECLARATION_BEFORE.test(before);
                if (!isField && isWriteOrMutation(before, after)) sites.push({ line: i + 1, text: line.trim() });
                hit = local.exec(line);
            }
        }
    }
    return sites;
};

describe('nothing in the core writes a slot data', () => {
    const files = sourceFiles().map(path => ({
        path: path.slice(SRC.length + 1).split(sep).join('/'),
        source: readFileSync(path).toString('latin1'),
    }));

    it('reads a tree with something in it', () => {
        expect(files.length).toBeGreaterThan(50);
        expect(files.some(file => file.path === 'engine/entity/OIMSlotContentEntityService.ts')).toBe(true);
    });

    it('no non-test file under src assigns to or mutates .data', () => {
        const found = files.flatMap(file => writesToSlotData(file.source)
            .map(site => `${file.path}:${site.line} ${site.text}`));
        expect(found).toEqual([]);
    });

    it.each([
        'slot.data = cells;',
        'slot.data ??= [];',
        'slot.data[0] = key;',
        'slot.data[0] ??= key;',
        'slot.data.length = 0;',
        'slot.data.push(key);',
        '(slot as TOIMSlotEditable<TOIMEntitySlot>).data = cells;',
        'const cells = slot.data;\ncells[0] = key;',
        'const cells = (slot.data ??= []);\ncells.push(key);',
    ])('is red for %j', (source: string) => {
        expect(writesToSlotData(source).length).toBeGreaterThan(0);
    });

    it.each([
        'const cells = slot.data;\nreturn cells[0];',
        'public readonly data: undefined = undefined;',
        'data: undefined,',
        'if (slot.data !== undefined) return slot.data;',
        '// slot.data = x;',
    ])('is quiet for %j', (source: string) => {
        expect(writesToSlotData(source)).toEqual([]);
    });
});
