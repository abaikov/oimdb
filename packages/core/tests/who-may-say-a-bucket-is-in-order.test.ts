import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

const SRC = join(__dirname, '..', 'src');

/**
 * EVERY file, not every `.ts` file — an extension filter is a blind spot, and a
 * `.mjs` or a `.cjs` that writes the field would slip through one.
 *
 * A `.md` IS STILL WALKED AND IS BLANKED WHOLE by {@link codeOnly}. Prose cannot
 * write a field, and since the 20% comment ceiling sends every long argument to a
 * markdown file beside the code, a `.md` that DESCRIBES the mechanism now sits in
 * `src` next to it. Read as code it names the field on every line it explains it
 * on, and the census reported the document as an unpinned writer.
 */
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

/**
 * Comments and string bodies blanked to spaces, positions and newlines kept.
 *
 * A MARKDOWN FILE IS ALL COMMENT, so it is blanked whole rather than parsed for
 * `//` and `/*` that it does not have. Without this a document explaining the
 * field reads as code naming it on every line.
 */
const codeOnly = (text: string, path = ''): string => {
    if (path.endsWith('.md')) return text.replace(/[^\n]/g, ' ');
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

type TFile = { path: string; lines: string[] };

const files: TFile[] = sourceFiles().map(path => ({
    path: relative(path),
    lines: codeOnly(readFileSync(path).toString('latin1'), path).split('\n'),
}));

/* ── what each site does to the word ───────────────────────────────────── */

type TKind = 'birth' | 'read' | 'write';
const KIND_ORDER: readonly TKind[] = ['birth', 'read', 'write'];

type TSite = { word: string; path: string; line: number; kind: TKind; text: string };

const WRITE_AFTER = /^\s*=(?!=)/;
const BIRTH_AFTER = /^\s*:/;

const wordFor = (name: string): RegExp =>
    new RegExp(String.raw`(?<![A-Za-z0-9_$])` + name + String.raw`(?![A-Za-z0-9_$])`, 'g');

const THE_WORDS: readonly string[] = ['reordered', 'isSorted'];

const sites: TSite[] = [];
for (const word of THE_WORDS) {
    const pattern = wordFor(word);
    for (const file of files) {
        for (let i = 0; i < file.lines.length; i++) {
            const line = file.lines[i];
            pattern.lastIndex = 0;
            let match = pattern.exec(line);
            while (match !== null) {
                const after = line.slice(match.index + word.length);
                const kind: TKind = WRITE_AFTER.test(after) ? 'write' : BIRTH_AFTER.test(after) ? 'birth' : 'read';
                sites.push({ word, path: file.path, line: i + 1, kind, text: line.trim() });
                match = pattern.exec(line);
            }
        }
    }
}

const sitesOf = (word: string): TSite[] => sites.filter(site => site.word === word);

const signatureOf = (word: string): string[] => {
    const byFile = new Map<string, Map<TKind, number>>();
    for (const site of sitesOf(word)) {
        const kinds = byFile.get(site.path) ?? new Map<TKind, number>();
        kinds.set(site.kind, (kinds.get(site.kind) ?? 0) + 1);
        byFile.set(site.path, kinds);
    }
    return [...byFile.entries()]
        .map(([path, kinds]) => {
            const parts = KIND_ORDER.filter(kind => kinds.has(kind)).map(kind => `${kind}×${kinds.get(kind) as number}`);
            return `${path} ${parts.join(' ')}`;
        })
        .sort();
};

/* ── the pin ───────────────────────────────────────────────────────────── */

/**
 * WHO TOUCHES WHICH WORD, AND HOW.
 *
 * A file arriving here is a decision somebody made on purpose. A file arriving
 * here with a `write` is a SECOND mutator of a field that has one, and the answer
 * to it is a method on {@link OIMSlotContentBucketServiceArrayDriven} rather than an entry below.
 */
const PINNED: Record<string, readonly string[] | undefined> = {
    // An empty list, not an absent key: the word may not appear in code anywhere under `src`,
    // and a file that names it fails here with its own line.
    reordered: [],
    isSorted: [],
};

/** A signature keyed on its file, so pinned and found compare entry by entry. */
const byPath = (entries: readonly string[]): Map<string, string> => {
    const indexed = new Map<string, string>();
    for (const entry of entries) indexed.set(entry.slice(0, entry.indexOf(' ')), entry);
    return indexed;
};

describe('who may say a bucket is in order', () => {
    /** The reader is checking a real tree, not an empty one. */
    it('reads a tree with something in it', () => {
        expect(files.length).toBeGreaterThan(50);
        expect(files.some(file => file.path === 'facade/bucket/OIMSlotContentBucketServiceArrayDriven.ts')).toBe(true);
    });

    /**
     * ONE MUTATOR, and it is the whole of the rule. `slot.linkCount` lost a
     * decrement at four positional paths because a count on a shared struct was
     * written wherever it was convenient; here the same failure loses an ORDER
     * rather than a reference — a list handed back unsettled reads as settled.
     */
    it('one service writes the word, and nothing else writes it', () => {
        const writers = sites.filter(site => site.kind === 'write')
            .map(site => `${site.word} written at ${site.path} — ${site.text}`)
            .sort();
        expect(writers).toEqual([]);
    });

    /**
     * AND WHO ELSE MAY NAME THEM AT ALL — the births and the read, pinned so that a
     * fifth file touching `isSorted` is a diff somebody has to explain, and so that
     * ANY file naming `reordered` in code is: that word's list is empty, and the
     * second loop below turns a missing pin into a failure just as the first turns
     * an unpinned file into one.
     */
    it('every site is one we agreed on', () => {
        const drift: string[] = [];
        for (const word of THE_WORDS) {
            const pinned = byPath(PINNED[word] ?? []);
            const found = byPath(signatureOf(word));
            for (const [path, entry] of found) {
                const was = pinned.get(path);
                if (was === entry) continue;
                const lines = sitesOf(word).filter(site => site.path === path)
                    .map(site => `    ${site.path}:${site.line} ${site.kind} — ${site.text}`).join('\n');
                drift.push(was === undefined
                    ? `${word}: ${path} touches it and was not pinned —\n${lines}`
                    : `${word}: pinned "${was}", found "${entry}" —\n${lines}`);
            }
            for (const [path, entry] of pinned) {
                if (!found.has(path)) drift.push(`${word}: pinned "${entry}", and ${path} no longer touches it`);
            }
        }
        expect(drift).toEqual([]);
    });

});
