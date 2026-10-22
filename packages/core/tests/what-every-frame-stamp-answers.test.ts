/**
 * The hazard: a stamp whose SECOND reader nobody had in mind. A word read both
 * as "already done, skip" and as "this happened, act" loses the second answer
 * the moment anything clears it for the first. Three defects came out of that,
 * none with a runtime symptom, so the inventory below is the enforcement.
 *
 * `classify`'s guard/witness split is a heuristic: it misses a guard spelled
 * `if (x !== f) { work }`, a comparison with the frame on the left, and any read
 * through an alias or a copy, which land in `other`.
 *
 * Nothing shells out — BSD grep goes blind on a file containing a NUL byte, and
 * this package has carried them.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

const SRC = join(__dirname, '..', 'src');

/* ── reading the tree ──────────────────────────────────────────────────── */

/** EVERY file, not every `.ts` file: a stamp must not leave by moving into a `.mts`. */
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

/** Blanked to spaces with every byte position kept, so a reported site is the line a reader finds the code on. */
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
                // The escape and whatever it escapes go together, so a `\'` does
                // not end the string.
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
    // Nothing is normalised: a CR cannot shift a column because it occupies one.
    lines: codeOnly(readFileSync(path).toString('latin1')).split('\n'),
}));

/* ── finding the stamps ────────────────────────────────────────────────── */

const FRAME = String.raw`(?:frameNumber|(?:[\w$.]+\.)?frame\.number)`;

/** By VALUE: this is the net that finds a stamp whoever added it did not name like one. */
const VALUE_NET = new RegExp(String.raw`([A-Za-z_$][\w$]*)\s*(?:===|!==|=(?!=))\s*` + FRAME, 'g');

/** By NAME: a declaration in a type or a factory never mentions a frame number. */
const NAME_NET = /\b([A-Za-z_$][\w$]*(?:InFrame|Through|ThisFrame))\b/g;

/**
 * Scoped to the runtime because a `Set` field is an ordinary container
 * everywhere else; the scope is a PATH, so a rebuild moving the file leaves the
 * net reporting nothing rather than zero findings.
 */
const COLLECTION_NET = /([A-Za-z_$][\w$]*)\s*:\s*new\s+(?:Set|Map)\b/g;
const COLLECTION_NET_FILE = 'engine/channel/utils/createOIMChannelSlot.ts';

const NOT_A_STAMP = new Set(['frameNumber', 'number']);

/** Names the nets pick up that are not stamps, each with the reason it is here. */
const NOT_STAMPS_DESPITE_THE_NAME: Record<string, string | undefined> = {
    afterEachFlush: 'a set of callbacks the channel runs once a flush has fully ended; '
        + 'it carries no frame number and nothing compares it to one',
    afterEachFrame: 'a set of callbacks the channel runs once each frame has ended; '
        + 'it carries no frame number and nothing compares it to one',
};

const namesIn = (net: RegExp, text: string, into: Set<string>): void => {
    net.lastIndex = 0;
    let match = net.exec(text);
    while (match !== null) {
        const name = match[1];
        if (!NOT_A_STAMP.has(name) && NOT_STAMPS_DESPITE_THE_NAME[name] === undefined) into.add(name);
        match = net.exec(text);
    }
};

const byValue = new Set<string>();
const byName = new Set<string>();
const byCollection = new Set<string>();

for (const file of files) {
    const text = file.lines.join('\n');
    namesIn(VALUE_NET, text, byValue);
    namesIn(NAME_NET, text, byName);
    if (file.path === COLLECTION_NET_FILE) namesIn(COLLECTION_NET, text, byCollection);
}

const stamps = [...new Set([...byValue, ...byName, ...byCollection])].sort();

/* ── what each site does to the stamp ──────────────────────────────────── */

type TKind = 'clear' | 'decl' | 'guard' | 'other' | 'set' | 'witness';
const KIND_ORDER: readonly TKind[] = ['clear', 'decl', 'guard', 'other', 'set', 'witness'];

type TSite = { stamp: string; path: string; line: number; kind: TKind; text: string };

const DECL_BEFORE = /(?:^|[\s(,{])(?:public|private|protected|readonly|let|const|var)\s+(?:readonly\s+)?$/;
const DECL_AFTER = /^\s*:\s*(?:number|-1)\b/;
const CLEAR_AFTER = /^\s*=(?!=)\s*-1\b/;
const SET_AFTER = new RegExp(String.raw`^\s*=(?!=)\s*` + FRAME);
const READ_AFTER = new RegExp(String.raw`^\s*(===|!==)\s*` + FRAME);
const COLLECTION_AFTER = /^\s*\.\s*(add|has|size|delete|clear)\b/;
const SKIPS_WORK = /\b(?:return|continue)\b/;

/** Compiled once per stamp: eleven stamps over ten thousand lines is otherwise a hundred thousand `RegExp`s. */
const wordFor = (name: string): RegExp =>
    new RegExp(String.raw`(?<![A-Za-z0-9_$])` + name + String.raw`(?![A-Za-z0-9_$])`, 'g');

const occurrencesIn = (word: RegExp, line: string): number[] => {
    const at: number[] = [];
    word.lastIndex = 0;
    let match = word.exec(line);
    while (match !== null) { at.push(match.index); match = word.exec(line); }
    return at;
};

const classify = (line: string, at: number, name: string): TKind => {
    const before = line.slice(0, at);
    const after = line.slice(at + name.length);
    if (DECL_BEFORE.test(before)) return 'decl';
    if (DECL_AFTER.test(after)) return 'decl';
    if (CLEAR_AFTER.test(after)) return 'clear';
    if (SET_AFTER.test(after)) return 'set';
    const read = READ_AFTER.exec(after);
    if (read !== null) {
        // A match that ends the work is idempotency; a match that leads INTO the
        // work is evidence. Only `===` can be the first — `!== frame` means
        // "nothing recorded", and the work sits on the other branch.
        const rest = after.slice(read[0].length);
        return read[1] === '===' && SKIPS_WORK.test(rest) ? 'guard' : 'witness';
    }
    const collection = COLLECTION_AFTER.exec(after);
    if (collection !== null) {
        if (collection[1] === 'add') return 'set';
        if (collection[1] === 'has' || collection[1] === 'size') return 'witness';
        return 'clear';
    }
    return 'other';
};

const sites: TSite[] = [];
for (const stamp of stamps) {
    const word = wordFor(stamp);
    for (const file of files) {
        for (let i = 0; i < file.lines.length; i++) {
            const line = file.lines[i];
            for (const at of occurrencesIn(word, line)) {
                sites.push({ stamp, path: file.path, line: i + 1, kind: classify(line, at, stamp), text: line.trim() });
            }
        }
    }
}

const sitesOf = (stamp: string): TSite[] => sites.filter(site => site.stamp === stamp);

const signatureOf = (stamp: string): string[] => {
    const byFile = new Map<string, Map<TKind, number>>();
    for (const site of sitesOf(stamp)) {
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

/** Empty is the pin: no field holds a frame number, so a new stamp fails here unowned. */
const PINNED_STAMPS: readonly string[] = [];

/**
 * Per file and per kind, never per LINE: a line number makes every edit above a
 * stamp a failure, and a check that fails for reasons nobody caused gets turned off.
 */
const PINNED_SITES: Record<string, readonly string[] | undefined> = {};

const ANSWERS_TWO_QUESTIONS: Record<string, string | undefined> = {};

const byPath = (entries: readonly string[]): Map<string, string> => {
    const indexed = new Map<string, string>();
    for (const entry of entries) indexed.set(entry.slice(0, entry.indexOf(' ')), entry);
    return indexed;
};

const accountOf = (stamp: string): string => {
    const own = sitesOf(stamp);
    const where = (kind: TKind): string =>
        own.filter(site => site.kind === kind).map(site => `${site.path}:${site.line}`).join(', ') || 'nowhere';
    return `${stamp}: guard read at ${where('guard')}; evidence read at ${where('witness')}; cleared at ${where('clear')}`;
};

const dualPurpose = stamps.filter(stamp => {
    // MORE THAN ONE READER, and not one reader's SHAPE.
    return sitesOf(stamp).filter(site => site.kind === 'guard' || site.kind === 'witness').length > 1;
});

/* ── the assertions ────────────────────────────────────────────────────── */

describe('what every frame stamp answers', () => {
    it('reads a tree with something in it', () => {
        expect(files.length).toBeGreaterThan(50);
        expect(files.some(file => file.path === 'engine/channel/OIMChannelService.ts')).toBe(true);
        // Net C's scope is a path, so a rebuild can move it without a word and
        // leave the net finding nothing in a file that is not there.
        expect(files.some(file => file.path === COLLECTION_NET_FILE)).toBe(true);
    });

    it('the stamps this engine keeps are the ones we agreed on', () => {
        expect(stamps).toEqual([...PINNED_STAMPS].sort());
    });

    it('a stamp is named like one, and a name like one is a stamp', () => {
        const unnamed = [...byValue].filter(name => !byName.has(name)).sort()
            .map(name => `${name} is compared with a frame number but is not named `
                + '*InFrame / *Through / *ThisFrame');
        const unstamped = [...byName].filter(name => !byValue.has(name) && !byCollection.has(name)).sort()
            .map(name => `${name} is named like a stamp but never meets a frame number — `
                + 'rename it, or declare it in NOT_STAMPS_DESPITE_THE_NAME with the reason');
        expect({ unnamed, unstamped }).toEqual({ unnamed: [], unstamped: [] });
    });

    it('every stamp is set, cleared and believed in the places we agreed on', () => {
        const drift: string[] = [];
        for (const stamp of stamps) {
            const pinned = PINNED_SITES[stamp];
            const found = signatureOf(stamp);
            if (pinned === undefined) {
                const listed = sitesOf(stamp)
                    .map(site => `    ${site.path}:${site.line} ${site.kind} — ${site.text}`).join('\n');
                drift.push(`${stamp} is a stamp nobody pinned. Its sites are:\n${listed}`);
                continue;
            }
            const pinnedByFile = byPath(pinned);
            const foundByFile = byPath(found);
            for (const [path, entry] of foundByFile) {
                const was = pinnedByFile.get(path);
                if (was === entry) continue;
                const lines = sitesOf(stamp).filter(site => site.path === path)
                    .map(site => `    ${site.path}:${site.line} ${site.kind} — ${site.text}`).join('\n');
                drift.push(was === undefined
                    ? `${stamp}: ${path} touches it and was not pinned —\n${lines}`
                    : `${stamp}: pinned "${was}", found "${entry}" —\n${lines}`);
            }
            for (const [path, entry] of pinnedByFile) {
                if (!foundByFile.has(path)) drift.push(`${stamp}: pinned "${entry}", and ${path} no longer touches it`);
            }
        }
        expect(drift).toEqual([]);
    });

    /** A new name here is not automatically a defect, but it is a field that has to be explained before it ships. */
    it('only the stamp we already know about answers two questions', () => {
        const found = dualPurpose.map(accountOf).sort();
        const declared = Object.keys(ANSWERS_TWO_QUESTIONS).sort().map(accountOf);
        expect(found).toEqual(declared);
    });

});
