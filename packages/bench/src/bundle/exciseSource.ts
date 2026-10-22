import type { TBundleExcision } from './TBundleExcision';
import type { TBundleExcisionRule } from './TBundleExcisionRule';

/**
 * TAKING CODE OUT OF A MODULE WITHOUT A PARSER — a brace scanner that knows
 * about comments and string literals and nothing else. No TypeScript compiler,
 * because pulling one in would put a program transform between the engine and
 * every byte count in the report. Two things that makes true:
 *
 *   IT CANNOT BE SUBTLY WRONG, ONLY LOUDLY WRONG. Every rule asserts an
 *   occurrence count, and a scanner that ran off the end of a field takes the
 *   rest of the file with it, so esbuild fails to parse.
 *
 *   IT REMOVES CODE AND NOT PROSE. A doc comment above a deleted method stays,
 *   so the UNMINIFIED column of an excised arm still carries the prose of
 *   fields that are gone and is not a reading of anything. Only that arm's
 *   minified and gzipped columns mean what their headings say.
 */

const OPENS = '{([';
const CLOSES = '})]';

/** Past the closing quote of the literal that starts at `at`. */
const endOfLiteral = (source: string, at: number): number => {
    const quote = source[at];
    let i = at + 1;
    while (i < source.length) {
        const c = source[i];
        if (c === '\\') { i += 2; continue; }
        if (c === quote) return i + 1;
        i += 1;
    }
    return source.length;
};

/**
 * Past the end of the statement or field that starts at `from` — the `;` that
 * closes it, or the `}` that brings its brace depth back to zero.
 *
 * Depth counts `(`, `[` and `{` alike, so a `;` inside an argument list is not
 * mistaken for the end. Comments and string literals are skipped whole, because
 * both contain braces in this package — `{@link X}` being the common one.
 */
const endOfSpan = (source: string, from: number, describe: string): number => {
    let depth = 0;
    let i = from;
    while (i < source.length) {
        const c = source[i];
        if (c === '/' && source[i + 1] === '/') {
            const line = source.indexOf('\n', i);
            if (line < 0) break;
            i = line + 1;
            continue;
        }
        if (c === '/' && source[i + 1] === '*') {
            const close = source.indexOf('*/', i + 2);
            if (close < 0) break;
            i = close + 2;
            continue;
        }
        if (c === '\'' || c === '"' || c === '`') { i = endOfLiteral(source, i); continue; }
        if (OPENS.includes(c)) { depth += 1; i += 1; continue; }
        if (CLOSES.includes(c)) {
            depth -= 1;
            i += 1;
            // A closing BRACE at zero ends a body; a closing paren at zero is a
            // signature or a condition, and what follows it is still to remove.
            if (depth === 0 && c === '}') return source[i] === ';' ? i + 1 : i;
            continue;
        }
        if (c === ';' && depth === 0) return i + 1;
        i += 1;
    }
    throw new Error(
        `bundle: excision ran off the end of the file looking for the end of ${describe}. `
        + 'The scanner knows about comments and string literals and nothing else, so this is '
        + 'either an unbalanced brace it cannot see past or a rule pointed at the wrong text.',
    );
};

/** The whole line the index sits on, plus the newline that ends the span. */
const startOfLine = (source: string, at: number): number => source.lastIndexOf('\n', at) + 1;
const throughNewline = (source: string, at: number): number => {
    let i = at;
    while (i < source.length && (source[i] === ' ' || source[i] === '\t')) i += 1;
    return source[i] === '\n' ? i + 1 : at;
};

/**
 * Where a class field called `name` is declared, ANCHORED at a class body's own
 * four-space indentation so a local, a call site or an object property of the
 * same name inside another field cannot be mistaken for the declaration —
 * `columnOwner` appears at both, declared in `engine/slot/OIMSlotOwnerService.ts`
 * and read through `slotOwnerService.columnOwner` in the content services.
 */
const declarationOf = (name: string): RegExp =>
    new RegExp(
        `^ {4}(?:public |private |protected )?(?:static )?(?:readonly |abstract )?${name}\\b`,
        'gm',
    );

const patternOf = (rule: TBundleExcisionRule): RegExp => {
    if (rule.kind === 'declaration') return declarationOf(rule.declaration);
    const source = rule.kind === 'statement' ? rule.starts : rule.matches;
    const flags = source.flags.includes('g') ? source.flags : `${source.flags}g`;
    return new RegExp(source.source, flags.includes('m') ? flags : `${flags}m`);
};

const describeOf = (rule: TBundleExcisionRule, module: string): string =>
    rule.kind === 'declaration'
        ? `declaration "${rule.declaration}" of ${module}`
        : `"${rule.what}" in ${module}`;

/**
 * One rule, applied until it stops matching, with the count checked against what
 * the rule declared.
 *
 * RE-SEARCHED FROM THE TOP after every removal rather than collecting all the
 * matches first: removing text moves every index after it, and a stale offset is
 * how this kind of code cuts the wrong span.
 */
const applyRule = (source: string, rule: TBundleExcisionRule, module: string): string => {
    const describe = describeOf(rule, module);
    // One more pass than the rule claims to need, so "matched too often" is a
    // count rather than a hang.
    const attempts = rule.times + 1;
    let text = source;
    let removed = 0;

    while (removed < attempts) {
        const found = patternOf(rule).exec(text);
        if (found === null) break;

        const from = startOfLine(text, found.index);
        let to: number;
        if (rule.kind === 'line') {
            const newline = text.indexOf('\n', found.index);
            to = newline < 0 ? text.length : newline + 1;
        } else {
            to = throughNewline(text, endOfSpan(text, from, describe));
        }
        if (to <= from) {
            throw new Error(`bundle: excision matched ${describe} but removed nothing.`);
        }
        text = text.slice(0, from) + text.slice(to);
        removed += 1;
    }

    if (removed !== rule.times) {
        throw new Error(
            `bundle: excision expected to remove ${describe} ${rule.times} time(s) and removed `
            + `${removed}. The engine has moved under this arm — read the rule, read the file, and `
            + 'change one of them deliberately. A count that no longer holds is a REFUSAL and not a '
            + 'smaller excision: quietly removing less would make the excised arm larger, the '
            + 'difference smaller, and the conclusion the more comfortable one.',
        );
    }
    return text;
};

/** One module of the engine with everything its excision names taken out of it. */
export const exciseSource = (source: string, excision: TBundleExcision): string => {
    let text = source;
    for (const rule of excision.rules) text = applyRule(text, rule, excision.module);
    return text;
};
