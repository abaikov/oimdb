#!/usr/bin/env node
/**
 * dead-citations — find `file:line` citations in the bench prose that no longer resolve.
 *
 * WHAT IT CHECKS
 *   Two corpora, reported apart because they drift for different reasons:
 *     md  packages/bench/src/decisions/**\/*.md and packages/bench/WHY-EACH-ROW.md
 *     ts  comment bodies and string literals under packages/bench/src/** and packages/core/src/**
 *   Forms:
 *     path form    `packages/core/src/engine/core/OIMEffect.ts:225`, `adapters/jotai.ts:642`,
 *                  `effector.ts:608`  (bare basename, resolved against a file index)
 *     symbol form  `OIMSlotServiceEntity.write:93-94`  (names a symbol as well as a line)
 *     line form    `:388`  (a continuation reference that carries no file)
 *   Verdicts:
 *     RESOLVES   file found, cited line exists, and — for the symbol form — the named symbol
 *                appears within SYMBOL_WINDOW lines of the cited range.
 *     DEAD       file missing, path stale, line past end of file, or the symbol is not there.
 *     TOMBSTONE  the citation sits inside a `WHAT WAS HERE` note — prose that exists to record
 *                code that was REMOVED. Such a citation is a record of what was measured, not a
 *                claim about the tree as it stands, so it is neither alive nor drifted.
 *     UNCHECKED  a form that cannot be resolved: an ambiguous basename (several files share it),
 *                a line-only reference, a path with no candidate anywhere in the index, a file
 *                whose prose could not be separated from its code, or a removal note written in
 *                a phrasing this repo does not use as a marker.
 *
 * WHAT IT CANNOT CHECK
 *   Whether a line that still EXISTS still says what the prose claims it says. Only the symbol
 *   form carries enough information to test that, and most citations here do not use it. A
 *   RESOLVES on a path-form citation means "the line exists", never "the line is still right".
 *   It also cannot resolve a line-only reference, because the file it continues from is prose
 *   context, not syntax; those are reported UNCHECKED with the nearest preceding cited file as
 *   a hint, which is a guess and is labelled as one.
 *   It matches inside one line at a time, so a citation broken across a line break — a block
 *   comment that wraps between the filename and the number — is not seen at all, in either corpus.
 *
 * WHY IT ONLY REPORTS
 *   Drift here is repaired by reading, not by a red build. Failing a suite on a stale line
 *   number would block work on the first rename and teach everyone to delete the citation
 *   instead of fixing it. Pinning and test wiring are a separate, later decision.
 *
 * Usage: npm run citations   (from packages/bench)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const BENCH_DIR = dirname(SCRIPT_DIR);
const REPO_ROOT = dirname(dirname(BENCH_DIR));

/** Markdown prose: the decision register and the row explanations. */
const MD_SOURCES = [
    join(BENCH_DIR, 'src', 'decisions'),
    join(BENCH_DIR, 'WHY-EACH-ROW.md'),
];

/**
 * TypeScript prose: comment bodies and string literals under these trees.
 *
 * `packages/core/src` is listed and carries no citation at all — it contains no `:<digit>`
 * sequence anywhere. The core package's citations are all in `packages/core/tests`, whose
 * headers are where this codebase writes down which rule a test pins and what it used to pin;
 * that is prose that drifts, so it is scanned rather than skipped for being a test.
 */
const TS_SOURCES = [
    join(BENCH_DIR, 'src'),
    join(REPO_ROOT, 'packages', 'core', 'src'),
    join(REPO_ROOT, 'packages', 'core', 'tests'),
];

/**
 * The one tombstone marker this repository actually uses, found by reading it rather than by
 * inventing a syntax: 70 sites across packages/bench/src and packages/core/src, plus one
 * blockquote in the decision register that quotes a header carrying it. A citation governed by
 * such a note points at code the note itself says is gone.
 *
 * Markdown has a second, unrelated way of saying the same thing — a removal word on the
 * citation's own line, as at WHY-EACH-ROW.md:637. That phrasing occurs ONCE in the whole md
 * corpus, which is not a convention, so it is not promoted to a marker: it is recognised only
 * far enough to keep the citation out of DEAD, and reported UNCHECKED with that as the reason.
 */
const TOMBSTONE_MARKER = /WHAT WAS HERE/;
const REMOVAL_NOTE = /\b(?:DELETED|REMOVED|GONE)\b/;

/** How far from the cited line a named symbol may sit and still count as present. */
const SYMBOL_WINDOW = 8;

const CODE_EXTENSIONS = new Set([
    'ts', 'tsx', 'mts', 'cts',
    'js', 'jsx', 'mjs', 'cjs',
    'json', 'md', 'txt', 'yml', 'yaml', 'html', 'css', 'snap',
]);

const EXTENSION_ALTERNATION = [...CODE_EXTENSIONS].join('|');

const SKIP_DIRS = new Set(['.git', '.turbo', 'coverage', '.next', '.cache']);

// ---------------------------------------------------------------------------
// File index
// ---------------------------------------------------------------------------

/** @type {string[]} every indexed path, relative to REPO_ROOT, POSIX-separated */
const allPaths = [];
/** @type {Map<string, string[]>} basename -> paths */
const byBasename = new Map();

function walk(dir) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            walk(full);
        } else if (entry.isFile()) {
            const rel = relative(REPO_ROOT, full).split(sep).join('/');
            allPaths.push(rel);
            const base = entry.name;
            let bucket = byBasename.get(base);
            if (!bucket) byBasename.set(base, (bucket = []));
            bucket.push(rel);
        }
    }
}

walk(REPO_ROOT);

const pathSet = new Set(allPaths);

/** node_modules copies are duplicated per workspace; prefer first-party source. */
const isVendor = p => p.includes('node_modules/');

function preferFirstParty(candidates) {
    const firstParty = candidates.filter(p => !isVendor(p));
    return firstParty.length > 0 ? firstParty : candidates;
}

/**
 * Resolve a cited path to a real file.
 * @returns {{ kind: 'exact'|'suffix'|'basename'|'ambiguous'|'missing', path?: string, candidates?: string[] }}
 */
const resolveCache = new Map();
function resolvePath(cited) {
    const cached = resolveCache.get(cited);
    if (cached) return cached;
    const result = resolvePathUncached(cited);
    resolveCache.set(cited, result);
    return result;
}

function resolvePathUncached(cited) {
    // `.../OIMEffect.ts` — prose elides the leading path; treat it as a bare basename.
    const normalized = cited.replace(/^(?:\.\/|\.\.\.\/)/, '');

    if (pathSet.has(normalized)) return { kind: 'exact', path: normalized };

    const suffix = '/' + normalized;
    const suffixHits = preferFirstParty(allPaths.filter(p => p.endsWith(suffix)));
    if (suffixHits.length === 1) return { kind: 'suffix', path: suffixHits[0] };
    if (suffixHits.length > 1) return { kind: 'ambiguous', candidates: suffixHits };

    const base = basename(normalized);
    const baseHits = preferFirstParty(byBasename.get(base) ?? []);
    if (baseHits.length === 1) return { kind: 'basename', path: baseHits[0] };
    if (baseHits.length > 1) return { kind: 'ambiguous', candidates: baseHits };

    return { kind: 'missing' };
}

const linesCache = new Map();
function linesOf(relPath) {
    let lines = linesCache.get(relPath);
    if (!lines) {
        lines = readFileSync(join(REPO_ROOT, relPath), 'utf8').split('\n');
        linesCache.set(relPath, lines);
    }
    return lines;
}

// ---------------------------------------------------------------------------
// TypeScript prose, separated from TypeScript code
// ---------------------------------------------------------------------------

/*
 * A .ts file is full of tokens shaped exactly like a citation that are not citations: import
 * specifiers, object keys, identifiers. Matching the citation patterns against raw source would
 * count them, so the text is split first and the patterns only ever see the prose half.
 *
 * PROSE is the body of a line comment, the body of a block comment, and the body of a string,
 * template or regex-free literal. CODE is everything else — including the interior of `${…}`,
 * which is code that happens to sit inside a template.
 *
 * The split is done by masking rather than by slicing: every code character is replaced with a
 * space and every newline is kept, so the masked text has the same line numbers and the same
 * columns as the original and the existing line-based matcher runs over it unchanged.
 *
 * WHAT THE SEPARATION CANNOT DO
 *   It is a scanner, not a parser, so it decides `/` between regex and divide by the preceding
 *   token, which is a heuristic. It has no idea whether a string literal is prose or data — a
 *   path used as a map key reads to it exactly like a sentence. And when it finishes a file in
 *   any state other than "at top level, in code", it does not guess: the file is declared
 *   unscannable and every citation-shaped token in it is reported UNCHECKED, never RESOLVES.
 */

/** Words after which a `/` opens a regular expression rather than dividing. */
const REGEX_PRECEDING_KEYWORDS = new Set([
    'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
    'case', 'do', 'else', 'yield', 'await', 'throw',
]);

/** `i` points at `/`. Returns the offset just past the closing `/` and flags, or -1. */
function skipRegexLiteral(text, i) {
    let j = i + 1;
    let inClass = false;
    while (j < text.length) {
        const c = text[j];
        if (c === '\\') j += 2;
        else if (c === '\n') return -1;
        else if (c === '[') { inClass = true; j++; }
        else if (c === ']') { inClass = false; j++; }
        else if (c === '/' && !inClass) {
            j++;
            while (j < text.length && /[a-z]/.test(text[j])) j++;
            return j;
        } else j++;
    }
    return -1;
}

/**
 * @returns {{ masked: string, regions: {kind:string,start:number,end:number}[], unscannable: string|null }}
 */
function readProse(text) {
    const n = text.length;
    const masked = new Array(n);
    for (let i = 0; i < n; i++) masked[i] = text[i] === '\n' ? '\n' : ' ';

    const regions = [];
    const stack = [{ kind: 'code', braces: 0 }];
    let open = null;
    let unscannable = null;

    // Enough of the preceding code token to tell a regex from a division.
    let lastKind = 'none';
    let lastChar = '';
    let word = '';

    const openRegion = (kind, at) => { open = { kind, start: at }; };
    const closeRegion = end => { if (open) { regions.push({ ...open, end }); open = null; } };

    const opensRegex = () => {
        if (lastKind === 'ident') return REGEX_PRECEDING_KEYWORDS.has(word);
        if (lastKind === 'punct') return lastChar !== ')' && lastChar !== ']';
        return true;
    };

    let i = 0;
    while (i < n) {
        const ctx = stack[stack.length - 1];
        const c = text[i];

        if (ctx.kind === 'code') {
            if (c === '/' && text[i + 1] === '/') {
                stack.push({ kind: 'line' });
                openRegion('comment', i + 2);
                i += 2;
                continue;
            }
            if (c === '/' && text[i + 1] === '*') {
                stack.push({ kind: 'block' });
                openRegion('comment', i + 2);
                i += 2;
                continue;
            }
            if (c === '/' && opensRegex()) {
                const past = skipRegexLiteral(text, i);
                if (past < 0) { unscannable = `unterminated regular expression at offset ${i}`; break; }
                i = past;
                lastKind = 'punct';
                lastChar = '/';
                word = '';
                continue;
            }
            if (c === "'" || c === '"' || c === '`') {
                stack.push({ kind: c === "'" ? 'sq' : c === '"' ? 'dq' : 'tpl' });
                openRegion('string', i + 1);
                i++;
                continue;
            }
            if (c === '{') { ctx.braces++; }
            else if (c === '}') {
                if (ctx.braces > 0) ctx.braces--;
                else if (stack.length > 1 && stack[stack.length - 2].kind === 'tpl') {
                    stack.pop();
                    openRegion('string', i + 1);
                    i++;
                    lastKind = 'punct';
                    lastChar = '`';
                    word = '';
                    continue;
                }
            }
            if (/[A-Za-z0-9_$]/.test(c)) { word += c; lastKind = 'ident'; lastChar = c; }
            else if (!/\s/.test(c)) { word = ''; lastKind = 'punct'; lastChar = c; }
            i++;
            continue;
        }

        if (ctx.kind === 'line') {
            if (c === '\n') { closeRegion(i); stack.pop(); i++; continue; }
            masked[i] = c;
            i++;
            continue;
        }

        if (ctx.kind === 'block') {
            if (c === '*' && text[i + 1] === '/') {
                closeRegion(i);
                stack.pop();
                i += 2;
                lastKind = 'punct';
                lastChar = '/';
                word = '';
                continue;
            }
            masked[i] = c;
            i++;
            continue;
        }

        // sq | dq | tpl
        if (c === '\\') { i += 2; continue; }  // escape: masked stays blank, newlines survive
        if (ctx.kind === 'tpl' && c === '$' && text[i + 1] === '{') {
            closeRegion(i);
            stack.push({ kind: 'code', braces: 0 });
            i += 2;
            lastKind = 'punct';
            lastChar = '{';
            word = '';
            continue;
        }
        const closer = ctx.kind === 'sq' ? "'" : ctx.kind === 'dq' ? '"' : '`';
        if (c === closer) {
            closeRegion(i);
            stack.pop();
            i++;
            lastKind = 'punct';
            lastChar = closer;
            word = '';
            continue;
        }
        if (c === '\n' && ctx.kind !== 'tpl') {
            unscannable = `unterminated string literal at offset ${i}`;
            break;
        }
        masked[i] = c;
        i++;
    }

    if (!unscannable && (stack.length !== 1 || stack[0].kind !== 'code' || open)) {
        unscannable = `file ends inside a ${(open ?? stack[stack.length - 1]).kind}`;
    }

    return { masked: masked.join(''), regions, unscannable };
}

/** Offset -> 1-based line number. */
function lineIndexer(text) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
    return offset => {
        let lo = 0;
        let hi = starts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (starts[mid] <= offset) lo = mid;
            else hi = mid - 1;
        }
        return lo + 1;
    };
}

/**
 * Line spans governed by a `WHAT WAS HERE` note in a .ts file: the comment block or the literal
 * that carries the marker. Adjacent `//` comments are merged, because a run of them is one note.
 */
function tombstoneSpansTs(text, regions) {
    const lineOf = lineIndexer(text);
    const spanned = regions
        .map(r => ({ ...r, from: lineOf(r.start), to: lineOf(Math.max(r.start, r.end - 1)) }))
        .sort((a, b) => a.from - b.from);

    const merged = [];
    for (const region of spanned) {
        const prev = merged[merged.length - 1];
        if (prev && prev.kind === 'comment' && region.kind === 'comment' && region.from <= prev.to + 1) {
            prev.to = Math.max(prev.to, region.to);
            prev.text += '\n' + text.slice(region.start, region.end);
        } else {
            merged.push({ kind: region.kind, from: region.from, to: region.to, text: text.slice(region.start, region.end) });
        }
    }

    return merged.filter(r => TOMBSTONE_MARKER.test(r.text)).map(r => [r.from, r.to]);
}

/** Line spans governed by a `WHAT WAS HERE` note in markdown: the paragraph carrying it. */
function tombstoneSpansMd(lines) {
    const spans = [];
    for (let i = 0; i < lines.length; i++) {
        if (!TOMBSTONE_MARKER.test(lines[i])) continue;
        let from = i;
        while (from > 0 && lines[from - 1].trim() !== '') from--;
        let to = i;
        while (to < lines.length - 1 && lines[to + 1].trim() !== '') to++;
        spans.push([from + 1, to + 1]);
    }
    return spans;
}

const inSpans = (spans, line) => spans.some(([from, to]) => line >= from && line <= to);

// ---------------------------------------------------------------------------
// Source discovery
// ---------------------------------------------------------------------------

function collectTsFiles() {
    const files = [];
    for (const root of TS_SOURCES) {
        const stack = [root];
        while (stack.length > 0) {
            const dir = stack.pop();
            let entries;
            try {
                entries = readdirSync(dir, { withFileTypes: true });
            } catch {
                continue;
            }
            for (const entry of entries) {
                const full = join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (SKIP_DIRS.has(entry.name)) continue;
                    stack.push(full);
                } else if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) {
                    files.push(full);
                }
            }
        }
    }
    return files.sort();
}

function collectSourceFiles() {
    const files = [];
    for (const source of MD_SOURCES) {
        let stats;
        try {
            stats = statSync(source);
        } catch {
            continue;
        }
        if (stats.isDirectory()) {
            const stack = [source];
            while (stack.length > 0) {
                const dir = stack.pop();
                for (const entry of readdirSync(dir, { withFileTypes: true })) {
                    const full = join(dir, entry.name);
                    if (entry.isDirectory()) stack.push(full);
                    else if (entry.name.endsWith('.md')) files.push(full);
                }
            }
        } else {
            files.push(source);
        }
    }
    return files.sort();
}

// ---------------------------------------------------------------------------
// Citation extraction
// ---------------------------------------------------------------------------

// `packages/core/src/engine/core/OIMEffect.ts:225`, `jotai.ts:642`, `x.ts:12-30`
const PATH_CITATION = new RegExp(
    String.raw`(?<![A-Za-z0-9_$])((?:[A-Za-z0-9_@.+-]+\/)*[A-Za-z0-9_@.+-]+\.(?:${EXTENSION_ALTERNATION}))` +
        String.raw`:(\d+)(?:\s*[-–]\s*(\d+))?`,
    'g',
);

// `OIMSlotServiceEntity.write:93-94` — a file and a symbol inside it, not a bare filename.
const SYMBOL_CITATION = new RegExp(
    String.raw`(?<![A-Za-z0-9_$/.])([A-Z][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)` +
        String.raw`:(\d+)(?:\s*[-–]\s*(\d+))?`,
    'g',
);

// `:388` — continuation reference, carries no file of its own.
const LINE_CITATION = /(?<=[\s(`\[])`?:(\d+)(?:\s*[-–]\s*(\d+))?/g;

function overlaps(spans, start, end) {
    return spans.some(([s, e]) => start < e && end > s);
}

/** Citation-shaped tokens the prose/code split threw away — the evidence that it does anything. */
const droppedAsCode = { count: 0, samples: [] };

/** Files whose prose the scanner refused to separate from their code. */
const unscannedFiles = [];

function countCitationShapes(line) {
    let n = 0;
    const spans = [];
    for (const m of line.matchAll(PATH_CITATION)) {
        spans.push([m.index, m.index + m[0].length]);
        n++;
    }
    for (const m of line.matchAll(SYMBOL_CITATION)) {
        if (CODE_EXTENSIONS.has(m[2])) continue;
        if (overlaps(spans, m.index, m.index + m[0].length)) continue;
        spans.push([m.index, m.index + m[0].length]);
        n++;
    }
    for (const m of line.matchAll(LINE_CITATION)) {
        if (overlaps(spans, m.index, m.index + m[0].length)) continue;
        spans.push([m.index, m.index + m[0].length]);
        n++;
    }
    return n;
}

function extract(sourcePath, corpus) {
    const text = readFileSync(sourcePath, 'utf8');
    const rawLines = text.split('\n');

    // What the patterns are allowed to see, and which line spans a tombstone note governs.
    let lines = rawLines;
    let tombstoneSpans = [];
    let unscannable = null;

    if (corpus === 'ts') {
        const prose = readProse(text);
        if (prose.unscannable) {
            unscannable = prose.unscannable;
            unscannedFiles.push({ file: sourcePath, reason: prose.unscannable });
        } else {
            lines = prose.masked.split('\n');
            tombstoneSpans = tombstoneSpansTs(text, prose.regions);
        }
    } else {
        tombstoneSpans = tombstoneSpansMd(rawLines);
    }

    const citations = [];
    let lastCitedFile = null;

    lines.forEach((line, i) => {
        const lineNo = i + 1;
        const spans = [];
        const found = [];

        for (const m of line.matchAll(PATH_CITATION)) {
            spans.push([m.index, m.index + m[0].length]);
            found.push({
                form: 'path',
                column: m.index,
                text: m[0],
                target: m[1],
                start: Number(m[2]),
                end: Number(m[3] ?? m[2]),
            });
        }

        for (const m of line.matchAll(SYMBOL_CITATION)) {
            if (CODE_EXTENSIONS.has(m[2])) continue;
            if (overlaps(spans, m.index, m.index + m[0].length)) continue;
            spans.push([m.index, m.index + m[0].length]);
            found.push({
                form: 'symbol',
                column: m.index,
                text: m[0],
                target: m[1],
                symbol: m[2],
                start: Number(m[3]),
                end: Number(m[4] ?? m[3]),
            });
        }

        for (const m of line.matchAll(LINE_CITATION)) {
            if (overlaps(spans, m.index, m.index + m[0].length)) continue;
            spans.push([m.index, m.index + m[0].length]);
            found.push({
                form: 'line',
                column: m.index,
                text: m[0].trim(),
                target: null,
                start: Number(m[1]),
                end: Number(m[2] ?? m[1]),
            });
        }

        if (corpus === 'ts' && !unscannable) {
            const dropped = countCitationShapes(rawLines[i]) - found.length;
            if (dropped > 0) {
                droppedAsCode.count += dropped;
                if (droppedAsCode.samples.length < 8) {
                    droppedAsCode.samples.push({ file: sourcePath, line: lineNo, text: rawLines[i].trim().slice(0, 96) });
                }
            }
        }

        found.sort((a, b) => a.column - b.column);
        for (const citation of found) {
            citation.source = sourcePath;
            citation.sourceLine = lineNo;
            citation.corpus = corpus;
            citation.unscannable = unscannable;
            citation.tombstoned = inSpans(tombstoneSpans, lineNo);
            citation.sourceText = rawLines[i];
            if (citation.form === 'line') citation.hint = lastCitedFile;
            else lastCitedFile = citation.target;
            citations.push(citation);
        }
    });

    return citations;
}

// ---------------------------------------------------------------------------
// Judging
// ---------------------------------------------------------------------------

function whereIsItNow(cited) {
    const base = basename(cited);
    const hits = preferFirstParty(byBasename.get(base) ?? []);
    if (hits.length === 0) return `no file named ${base} anywhere in the tree`;
    if (hits.length === 1) return `now at ${hits[0]}`;
    return `${hits.length} files named ${base}: ${hits.slice(0, 3).join(', ')}${hits.length > 3 ? ', …' : ''}`;
}

function symbolSightings(relPath, symbol) {
    const lines = linesOf(relPath);
    const word = new RegExp(String.raw`(?<![A-Za-z0-9_$])${symbol}(?![A-Za-z0-9_$])`);
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
        if (word.test(lines[i])) hits.push(i + 1);
        if (hits.length >= 4) break;
    }
    return hits;
}

function judge(citation) {
    if (citation.unscannable) {
        return {
            verdict: 'UNCHECKED',
            reason: `prose could not be separated from code in this file — ${citation.unscannable}`,
            now: 'every citation-shaped token in the file is reported unchecked, including ones that may be code',
        };
    }

    if (citation.form === 'line') {
        return {
            verdict: 'UNCHECKED',
            reason: 'line-only reference — no file in the citation',
            now: citation.hint ? `nearest preceding cited file (a guess): ${citation.hint}` : 'no preceding cited file on record',
        };
    }

    const candidatePaths =
        citation.form === 'symbol'
            ? [`${citation.target}.ts`, `${citation.target}.tsx`, `${citation.target}.mts`]
            : [citation.target];

    let resolution = { kind: 'missing' };
    let resolvedFrom = citation.target;
    for (const candidate of candidatePaths) {
        const attempt = resolvePath(candidate);
        if (attempt.kind !== 'missing') {
            resolution = attempt;
            resolvedFrom = candidate;
            break;
        }
    }

    if (resolution.kind === 'ambiguous') {
        return {
            verdict: 'UNCHECKED',
            reason: `ambiguous — ${resolution.candidates.length} files match`,
            now: `${resolution.candidates.slice(0, 3).join(', ')}${resolution.candidates.length > 3 ? ', …' : ''}`,
        };
    }

    if (resolution.kind === 'missing') {
        return {
            verdict: 'DEAD',
            reason: citation.form === 'symbol' ? 'no file carries this symbol' : 'file does not exist',
            now: whereIsItNow(resolvedFrom),
        };
    }

    const path = resolution.path;
    const lines = linesOf(path);
    const lineCount = lines.length;

    if (resolution.kind === 'basename' && citation.form === 'path' && citation.target.includes('/')) {
        return {
            verdict: 'DEAD',
            reason: 'path is stale — no file at that path',
            now: `same basename now at ${path}${citation.end > lineCount ? ` (which has only ${lineCount} lines)` : ''}`,
            path,
        };
    }

    if (citation.end > lineCount) {
        return {
            verdict: 'DEAD',
            reason: `line ${citation.end} is past end of file (${lineCount} lines)`,
            now: path,
            path,
        };
    }

    if (citation.form === 'symbol') {
        const from = Math.max(1, citation.start - SYMBOL_WINDOW);
        const to = Math.min(lineCount, citation.end + SYMBOL_WINDOW);
        const window = lines.slice(from - 1, to).join('\n');
        const word = new RegExp(String.raw`(?<![A-Za-z0-9_$])${citation.symbol}(?![A-Za-z0-9_$])`);
        if (!word.test(window)) {
            const sightings = symbolSightings(path, citation.symbol);
            return {
                verdict: 'DEAD',
                reason: `\`${citation.symbol}\` is not within ${SYMBOL_WINDOW} lines of ${citation.start}`,
                now: sightings.length
                    ? `${path}: ${citation.symbol} appears at line(s) ${sightings.join(', ')}`
                    : `${path} does not mention ${citation.symbol} at all`,
                path,
            };
        }
    }

    return { verdict: 'RESOLVES', path };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

/**
 * A citation inside a tombstone note is not judged against the tree. The note's whole purpose is
 * to say the cited code is gone, so DEAD would be a false alarm and RESOLVES would be worse — a
 * line number surviving into unrelated code is not the code the note is talking about.
 */
function applyTombstone(row) {
    if (row.tombstoned) {
        return {
            ...row,
            verdict: 'TOMBSTONE',
            reason: `inside a \`WHAT WAS HERE\` note — a record of removed code, not a claim about the tree (unjudged verdict: ${row.verdict})`,
            now: row.now,
        };
    }
    if (row.verdict === 'DEAD' && REMOVAL_NOTE.test(row.sourceText ?? '')) {
        return {
            ...row,
            verdict: 'UNCHECKED',
            reason: "the citation's own line carries a removal note, but not this repo's tombstone marker `WHAT WAS HERE`",
            now: `that phrasing is used here and almost nowhere else, so it is not treated as a marker — read the line: ${(row.sourceText ?? '').trim()}`,
        };
    }
    return row;
}

const sourceFiles = collectSourceFiles();
const tsFiles = collectTsFiles();
const rows = [];
for (const file of sourceFiles) {
    for (const citation of extract(file, 'md')) {
        rows.push(applyTombstone({ ...citation, ...judge(citation) }));
    }
}
for (const file of tsFiles) {
    for (const citation of extract(file, 'ts')) {
        rows.push(applyTombstone({ ...citation, ...judge(citation) }));
    }
}

const VERDICTS = ['RESOLVES', 'DEAD', 'TOMBSTONE', 'UNCHECKED'];
const tally = subset => {
    const counts = Object.fromEntries(VERDICTS.map(v => [v, 0]));
    for (const row of subset) counts[row.verdict]++;
    return counts;
};
const counts = tally(rows);

const rel = p => relative(REPO_ROOT, p).split(sep).join('/');

function printGroup(title, subset) {
    if (subset.length === 0) return;
    console.log(`\n${title} (${subset.length})`);
    console.log('-'.repeat(title.length + 6));
    // Group by cited target so one stale file's citations cluster together.
    const groups = new Map();
    for (const row of subset) {
        const key = row.target ?? '(line-only)';
        let bucket = groups.get(key);
        if (!bucket) groups.set(key, (bucket = []));
        bucket.push(row);
    }
    const ordered = [...groups.entries()].sort(
        (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
    );
    for (const [target, bucket] of ordered) {
        console.log(`\n  ${target}  [${bucket.length}]`);
        bucket.sort((a, b) => a.source.localeCompare(b.source) || a.sourceLine - b.sourceLine);
        for (const row of bucket) {
            console.log(`    ${rel(row.source)}:${row.sourceLine}  cites ${row.text}`);
            console.log(`      ${row.reason}`);
            if (row.now) console.log(`      -> ${row.now}`);
        }
    }
}

const mdRows = rows.filter(r => r.corpus === 'md');
const tsRows = rows.filter(r => r.corpus === 'ts');
const filesWith = subset => new Set(subset.map(r => r.source)).size;

function printSummary(label, scanned, subset) {
    const counts = tally(subset);
    console.log(
        `  ${label.padEnd(4)} ${String(subset.length).padStart(4)} citations` +
            ` in ${filesWith(subset)} of ${scanned} files` +
            VERDICTS.map(v => `   ${v} ${counts[v]}`).join(''),
    );
}

console.log(
    `dead-citations — ${rows.length} citations across two corpora ` +
        `(${sourceFiles.length} md files, ${tsFiles.length} ts files scanned)`,
);
printSummary('md', sourceFiles.length, mdRows);
printSummary('ts', tsFiles.length, tsRows);
printSummary('all', sourceFiles.length + tsFiles.length, rows);
console.log(
    `\n  ts prose/code split: ${tsFiles.length - unscannedFiles.length} of ${tsFiles.length} files separated,` +
        ` ${droppedAsCode.count} citation-shaped token(s) discarded as code`,
);
for (const s of droppedAsCode.samples) console.log(`      ${rel(s.file)}:${s.line}  ${s.text}`);
if (droppedAsCode.count === 0) {
    console.log(
        '      (nothing discarded is a result, not a no-op: every citation-shaped token in the ts',
        '\n       trees already sits in a comment or a literal. The split is what lets that be stated.)',
    );
}
for (const f of unscannedFiles) console.log(`      UNSEPARATED  ${rel(f.file)} — ${f.reason}`);

for (const [label, subset] of [['md', mdRows], ['ts', tsRows]]) {
    printGroup(`${label.toUpperCase()} · DEAD`, subset.filter(r => r.verdict === 'DEAD'));
    printGroup(`${label.toUpperCase()} · TOMBSTONE`, subset.filter(r => r.verdict === 'TOMBSTONE'));
    printGroup(`${label.toUpperCase()} · UNCHECKED`, subset.filter(r => r.verdict === 'UNCHECKED'));
}

/*
 * `--show-resolves` prints, beside every citation that resolved, the sentence that cites and the
 * line that was cited. Nothing here checks that the two agree — that is the whole point of the
 * distinction the closing note draws, and the only way to close it is a person reading the pair.
 */
if (process.argv.includes('--show-resolves')) {
    const alive = rows.filter(r => r.verdict === 'RESOLVES');
    console.log(`\nRESOLVES, sentence against cited line (${alive.length}) — agreement is NOT tested`);
    console.log('-'.repeat(72));
    for (const row of alive.sort((a, b) => a.source.localeCompare(b.source) || a.sourceLine - b.sourceLine)) {
        const citedLine = (linesOf(row.path)[row.start - 1] ?? '').trim();
        console.log(`\n  ${rel(row.source)}:${row.sourceLine}  cites ${row.text}`);
        console.log(`    says  ${(row.sourceText ?? '').trim().slice(0, 150)}`);
        console.log(`    line  ${citedLine.slice(0, 150)}`);
    }
}

console.log(
    '\nRESOLVES means the line exists. For every citation except the symbol form it does NOT',
    '\nmean the line still says what the prose claims — and in the ts corpus a RESOLVES also does',
    '\nnot mean the matched text was a sentence, only that it was not code. TOMBSTONE means the',
    '\nprose says the cited code is gone, so nothing about the current tree was tested at all.',
    '\nThis script reports; it fails nothing.',
);
