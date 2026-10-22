import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import * as ts from 'typescript';

const PACKAGES = join(__dirname, '..', '..');

const OUTSIDE_THIS_CENSUS: readonly (readonly [string, string])[] = [
    ['bench', 'a tree of CLI scripts whose module scope IS the run, and frozen while a sweep runs'],
    ['core-legacy', 'the bench floor: nothing lands in it, so nothing can be re-introduced there'],
];

const SKIPPED = new Set(OUTSIDE_THIS_CENSUS.map(([name]) => name));

const packageNames = (): string[] => readdirSync(PACKAGES)
    .filter(name => !SKIPPED.has(name) && existsSync(join(PACKAGES, name, 'src')))
    .sort();

const sourceFilesOf = (name: string): string[] => {
    const root = join(PACKAGES, name, 'src');
    const found: string[] = [];
    const walk = (directory: string): void => {
        for (const entry of readdirSync(directory)) {
            if (entry === 'tests') continue;
            const path = join(directory, entry);
            if (statSync(path).isDirectory()) walk(path);
            else if (/\.tsx?$/.test(entry) && !/\.(test|type-test)\.tsx?$/.test(entry)) found.push(path);
        }
    };
    walk(root);
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

type TFile = { site: string; path: string; lines: string[] };

const files: TFile[] = packageNames().flatMap(name => sourceFilesOf(name).map(path => ({
    site: `${name}/${path.slice(join(PACKAGES, name, 'src').length + 1).split(sep).join('/')}`,
    path,
    lines: codeOnly(readFileSync(path).toString('latin1')).split('\n'),
})));

const fileAt = (site: string): TFile => files.find(file => file.site === site) as TFile;

const REBINDABLE = /^(?:let|var) ([A-Za-z_$][\w$]*)/;
const MINTS_AT_LOAD = /^(?:export )?const ([A-Za-z_$][\w$]*)[^=\n]*=\s*(?:new\s|createContext[<(]|\[|\{)/;
const STATIC_FIELD = /^\s+(?:public |private |protected )?static (?!readonly\b)([A-Za-z_$][\w$]*|get|set)/;
const STATIC_IS_CALLABLE =
    /^\s+(?:public |private |protected )?static (?:(?:get|set)\s|[A-Za-z_$][\w$]*\s*(?:<[^>]*>)?\s*\()/;

const holdersIn = (file: TFile): string[] => {
    const found: string[] = [];
    for (const line of file.lines) {
        const rebindable = REBINDABLE.exec(line);
        if (rebindable !== null) { found.push(`${file.site}:${rebindable[1]}`); continue; }
        const minted = MINTS_AT_LOAD.exec(line);
        if (minted !== null) { found.push(`${file.site}:${minted[1]}`); continue; }
        if (STATIC_IS_CALLABLE.test(line)) continue;
        const staticField = STATIC_FIELD.exec(line);
        if (staticField !== null) found.push(`${file.site}:${staticField[1]}`);
    }
    return found;
};

const holders: string[] = files.flatMap(holdersIn).sort();

const DIFF_SCRATCH = 'an Int32Array of positions and no references at all; scratchFor grows it to the '
    + 'longest list ever diffed and shrinks it only on a later call needing less than half of it';
const DEFAULT_VALUE = 'one OIMDefaultValue: a name, a factory, a lazily built process-wide default and one '
    + 'handed-out boolean; every class behind a default declares no instance field, which is the case below';

const PINNED: readonly (readonly [string, string])[] = [
    ['core/engine/bucket/commands/utils/oimOrderedListCommandsOfTransition.ts:anchors', DIFF_SCRATCH],
    [
        'core/engine/bucket/commands/utils/oimOrderedListCommandsOfTransition.ts:indexInNext',
        'THE ONLY SCRATCH IN THIS FILE KEYED BY A SLOT. One diff leaves next.length slot references '
        + 'reachable until the next call, which replaces the Map above OIM_MAX_DIFF_SCRATCH_SLOTS '
        + 'and clears it at or under — so the count is bounded by the next caller and never by this one',
    ],
    ['core/engine/bucket/commands/utils/oimOrderedListCommandsOfTransition.ts:occurrenceAfter', DIFF_SCRATCH],
    ['core/engine/bucket/commands/utils/oimOrderedListCommandsOfTransition.ts:predecessor', DIFF_SCRATCH],
    ['core/engine/bucket/commands/utils/oimOrderedListCommandsOfTransition.ts:removedPrevIndices', DIFF_SCRATCH],
    ['core/engine/bucket/commands/utils/oimOrderedListCommandsOfTransition.ts:tails', DIFF_SCRATCH],
    ['core/engine/bucket/commands/utils/oimOrderedListCommandsOfTransition.ts:futureBucketIndices', DIFF_SCRATCH],
    ['core/factories/defaults/OIM_DEFAULT_STORE_SLOT_LISTENER.ts:OIM_DEFAULT_STORE_SLOT_LISTENER', DEFAULT_VALUE],
    ['core/factories/defaults/OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE.ts:OIM_DEFAULT_COLUMN_SLOT_STORE_SERVICE', DEFAULT_VALUE],
    ['core/factories/defaults/OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE.ts:OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE', DEFAULT_VALUE],
    ['core/factories/defaults/OIM_DEFAULT_KEY_TREE_WALK_COMPOSITE.ts:OIM_DEFAULT_KEY_TREE_WALK_COMPOSITE', DEFAULT_VALUE],
    [
        'core/factories/defaults/OIM_DEFAULT_ENTITY_SLOT_EMPTINESS.ts:OIM_DEFAULT_ENTITY_SLOT_EMPTINESS',
        'one OIMDefaultValue whose value is an object literal with one method reading slot.entity; it closes over nothing',
    ],
    [
        'core/factories/defaults/OIM_DEFAULT_ENTITY_WRITER.ts:OIM_DEFAULT_ENTITY_WRITER',
        'one OIMDefaultValue whose value is the in-place writer, free functions behind one object that close over nothing',
    ],
    [
        'core/factories/defaults/OIM_DEFAULT_INDEX_KEYS_SERVICE.ts:OIM_DEFAULT_INDEX_KEYS_SERVICE',
        'one OIMDefaultValue whose value is the appending index-keys service, which holds no state and closes over nothing',
    ],
    ['core/factories/defaults/OIM_DEFAULT_KEY_TREE_WALK_SCALAR.ts:OIM_DEFAULT_KEY_TREE_WALK_SCALAR', DEFAULT_VALUE],
    ['core/factories/defaults/OIM_DEFAULT_STANDALONE_SLOT_OWNER.ts:OIM_DEFAULT_STANDALONE_SLOT_OWNER', DEFAULT_VALUE],
    [
        'devtools/oimDevRegistry.ts:oimDevRegistry',
        'THE ONE UNBOUNDED HOLDER OF A SLOT GRAPH IN THIS REPOSITORY, and the only one on this list that '
        + 'nothing bounds. Every entries and computedEntries value is a closure over a whole collection or '
        + 'a whole derivation, keyed by a name the caller chooses, and the class offers no way to take one '
        + 'out again — so a process that registers under generated names grows for ever, and one that '
        + 'registers once pins that collection for the life of the process. Only flushHistory and '
        + 'flushErrors are capped, at OIMDevRegistry.MAX_HISTORY',
    ],
    [
        'persist/keyvalue/constants/OIM_PERSIST_KEY_VALUE_JSON_SERIALIZER.ts:OIM_PERSIST_KEY_VALUE_JSON_SERIALIZER',
        'an object literal of two free functions over JSON.stringify and JSON.parse; it closes over nothing',
    ],
    [
        'react/OIMDBContext.ts:OIMDBContext',
        'a React context whose default is undefined: what it carries during a render is pushed and popped '
        + 'by React, so this module holds the context object and never a database',
    ],
];

const pinnedSites = (): string[] => PINNED.map(([site]) => site).sort();

const reasonFor = new Map(PINNED);

const printTable = (): void => {
    console.error(
        '\n─── HOLDERS, as the tree stands — each needs a reason beside it ───\n'
        + `${holders.map(site => `    ['${site}', '${reasonFor.get(site) ?? 'WHAT BOUNDS THIS?'}'],`).join('\n')}\n`,
    );
};

const INSTANCE_FIELD = /^ {4}(?:public |private |protected )?(?:readonly )?([A-Za-z_$][\w$]*)\??\s*[:=]/;

const instanceFieldsIn = (site: string): string[] => fileAt(site).lines
    .map(line => INSTANCE_FIELD.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(match => match[1]);

const withoutCasts = (node: ts.Expression): ts.Expression => {
    let inner = node;
    while (
        ts.isParenthesizedExpression(inner) || ts.isAsExpression(inner) || ts.isTypeAssertionExpression(inner)
        || ts.isNonNullExpression(inner) || ts.isSatisfiesExpression(inner)
    ) inner = inner.expression;
    return inner;
};

const isThisMember = (node: ts.Node): boolean =>
    (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
    && withoutCasts(node.expression).kind === ts.SyntaxKind.ThisKeyword;

const isAssignment = (kind: ts.SyntaxKind): boolean =>
    kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;

const isIncrementOrDecrement = (node: ts.Node): node is ts.PrefixUnaryExpression | ts.PostfixUnaryExpression =>
    (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
    && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken);

const parsedAt = (path: string): ts.SourceFile => ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ES2022, true);

const siteOf = (path: string): string => path.slice(PACKAGES.length + 1).split(sep).join('/').replace('/src/', '/');

const classesIn = (sourceFile: ts.SourceFile): ts.ClassDeclaration[] => sourceFile.statements.filter(ts.isClassDeclaration);

const isSingleton = (sourceFile: ts.SourceFile, classNode: ts.ClassDeclaration): boolean => classNode.members.some(member => ts.isPropertyDeclaration(member)
    && member.name.getText(sourceFile) === 'INSTANCE'
    && (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static) !== 0);

const stateHeldByClass = (path: string, sourceFile: ts.SourceFile, classNode: ts.ClassDeclaration): string[] => {
    const site = siteOf(path);
    const found: string[] = [];
    const findWritesToThis = (member: ts.ClassElement, node: ts.Node): void => {
        const isWrite = (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind) && isThisMember(node.left))
            || (isIncrementOrDecrement(node) && isThisMember(node.operand));
        if (isWrite) found.push(`${site}: ${member.name?.getText(sourceFile) ?? 'member'} writes ${node.getText(sourceFile)}`);
        ts.forEachChild(node, child => { findWritesToThis(member, child); });
    };
    for (const member of classNode.members) {
        if (ts.isPropertyDeclaration(member) && (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Readonly) === 0) {
            found.push(`${site}: ${member.name.getText(sourceFile)} is not readonly`);
        }
        if (!ts.isConstructorDeclaration(member)) findWritesToThis(member, member);
    }
    return found;
};

const baseClassOf = (
    path: string, sourceFile: ts.SourceFile, classNode: ts.ClassDeclaration,
): { path: string; sourceFile: ts.SourceFile; classNode: ts.ClassDeclaration } | undefined => {
    const extendsClause = classNode.heritageClauses?.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword);
    const baseExpression = extendsClause?.types[0]?.expression;
    if (baseExpression === undefined || !ts.isIdentifier(baseExpression)) return undefined;
    const baseName = baseExpression.text;
    const importOfBase = sourceFile.statements.filter(ts.isImportDeclaration).find(declaration => {
        const namedBindings = declaration.importClause?.namedBindings;
        return namedBindings !== undefined && ts.isNamedImports(namedBindings)
            && namedBindings.elements.some(element => element.name.text === baseName);
    });
    if (importOfBase === undefined || !ts.isStringLiteral(importOfBase.moduleSpecifier)) return undefined;
    const specifier = importOfBase.moduleSpecifier.text;
    if (!specifier.startsWith('.')) return undefined;
    const basePath = `${join(path, '..', specifier)}.ts`;
    const packageSrc = path.slice(0, path.indexOf(`${sep}src${sep}`) + 5);
    if (!basePath.startsWith(packageSrc) || !existsSync(basePath)) return undefined;
    const baseSourceFile = parsedAt(basePath);
    const baseClassNode = classesIn(baseSourceFile).find(candidate => candidate.name?.text === baseName);
    return baseClassNode === undefined ? undefined : { path: basePath, sourceFile: baseSourceFile, classNode: baseClassNode };
};

const stateHeldBySingletonsIn = (file: TFile): string[] => {
    const sourceFile = parsedAt(file.path);
    return classesIn(sourceFile).filter(classNode => isSingleton(sourceFile, classNode)).flatMap(classNode => {
        const found: string[] = [];
        let link: { path: string; sourceFile: ts.SourceFile; classNode: ts.ClassDeclaration } | undefined = { path: file.path, sourceFile, classNode };
        while (link !== undefined) {
            found.push(...stateHeldByClass(link.path, link.sourceFile, link.classNode));
            link = baseClassOf(link.path, link.sourceFile, link.classNode);
        }
        return found;
    });
};

const EVERY_CLASS_A_DEFAULT_HANDS_BACK: readonly string[] = [
    'core/engine/slot/OIMSlotOwner.ts',
    'core/engine/store/OIMSlotStoreServiceMapDriven.ts',
    'core/engine/key/OIMKeyTreeWalk.ts',
    'core/engine/key/OIMKeyTreeWalkScalar.ts',
    'core/engine/key/OIMKeyTreeWalkComposite.ts',
];

describe('what a module keeps between calls', () => {
    it('reads every package but the two this census leaves out', () => {
        expect(files.length).toBeGreaterThan(200);
        expect(packageNames()).toContain('core');
        expect(packageNames()).toContain('devtools');
        expect(packageNames()).not.toContain('bench');
        expect(packageNames()).not.toContain('core-legacy');
        expect(OUTSIDE_THIS_CENSUS.map(([, reason]) => reason === '')).toEqual([false, false]);
        expect(holdersIn(fileAt('core/engine/channel/OIMChannelService.ts'))).toEqual([]);
    });

    it('every module-level holder under src is one this file pins, with a reason beside it', () => {
        const drift = holders.join('\n') === pinnedSites().join('\n')
            ? ''
            : `pinned:\n${pinnedSites().join('\n')}\n\nfound:\n${holders.join('\n')}`;
        if (drift !== '') printTable();
        expect(drift).toBe('');
    });

    it('no pinned holder carries an empty reason, and none is pinned twice', () => {
        expect(PINNED.filter(([, reason]) => reason.length < 40).map(([site]) => site)).toEqual([]);
        expect(reasonFor.size).toBe(PINNED.length);
    });

    it('no class behind a process-wide default declares an instance field', () => {
        const withFields = EVERY_CLASS_A_DEFAULT_HANDS_BACK
            .map(site => ({ site, fields: instanceFieldsIn(site) }))
            .filter(entry => entry.fields.length > 0);
        expect(withFields).toEqual([]);
    });

    it('every class behind a static INSTANCE holds only config: readonly fields no method assigns', () => {
        const singletonFiles = files.filter(file => file.lines.some(line => /^\s+public static readonly INSTANCE = new /.test(line)));
        expect(singletonFiles.map(file => file.site)).toContain('core/engine/channel/OIMChannelService.ts');
        expect(singletonFiles.flatMap(file => stateHeldBySingletonsIn(file))).toEqual([]);
    });

    it('the diff keeps one slot-keyed scratch and drops the slots on both of its branches', () => {
        const lines = fileAt('core/engine/bucket/commands/utils/oimOrderedListCommandsOfTransition.ts').lines;
        expect(lines.filter(line => /^let .*Map<TOIMSlot/.test(line))).toHaveLength(1);
        expect(lines.filter(line => /^let .*Int32Array/.test(line))).toHaveLength(6);

        const bounded = lines.filter(line => line.includes('OIM_MAX_DIFF_SCRATCH_SLOTS')
            && !line.startsWith('import'));
        expect(bounded).toHaveLength(2);
        expect(bounded.filter(line => line.includes('indexInNext.size >'))).toHaveLength(1);
        expect(lines.filter(line => line.includes('indexInNext.clear()'))).toHaveLength(1);
    });
});
