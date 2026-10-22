import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const packagesRoot = join(repoRoot, 'packages');
const coreSourceRoot = join(packagesRoot, 'core', 'src');

const packagesWritingAnEngineThisApiIsNot = new Set(['core-legacy', 'bench']);

const documentedAsGone: Record<string, string> = {
    OIMDB_UPDATE: 'the string VALUE of EOIMReduxReducerActionType.UPDATE, not an exported name; website/docs/packages/redux-adapter.md',
};

const namedSymbol = /(?<![A-Za-z0-9_$])(?:createOIM|IOIM|TOIM|EOIM|OIM|oim(?=[A-Z]))[A-Za-z0-9_]*/g;
const inlineCodeSpan = /`([^`]+)`/g;
const fenceBoundary = /^\s*```/;
const statedNameCount = /\*\*(\d+) names[.,]/g;

type TMention = { readonly symbol: string; readonly where: string };

const exportedNamesOf = (indexPath: string): Set<string> => {
    const names = new Set<string>();
    if (!existsSync(indexPath)) return names;
    const source = readFileSync(indexPath, 'utf8');
    for (const statement of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
        for (const part of statement[1].split(',')) {
            const name = part.trim().split(/\s+as\s+/).pop()?.trim();
            if (name !== undefined && name.length > 0) names.add(name);
        }
    }
    for (const declaration of source.matchAll(/export\s+(?:const|let|function|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/g)) {
        names.add(declaration[1]);
    }
    return names;
};

const filesUnder = (directory: string, keep: (name: string) => boolean): string[] => {
    const found: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) found.push(...filesUnder(full, keep));
        else if (keep(entry.name)) found.push(full);
    }
    return found;
};

const isTypeScript = (name: string): boolean => /\.tsx?$/.test(name);

const coreExportedNames = exportedNamesOf(join(coreSourceRoot, 'index.ts'));

const symbolsTheWorkspaceHas = (): Set<string> => {
    const known = new Set<string>();
    for (const packageName of readdirSync(packagesRoot)) {
        if (packagesWritingAnEngineThisApiIsNot.has(packageName)) continue;
        const sourceRoot = join(packagesRoot, packageName, 'src');
        if (!existsSync(sourceRoot)) continue;
        for (const name of exportedNamesOf(join(sourceRoot, 'index.ts'))) known.add(name);
        for (const file of filesUnder(sourceRoot, isTypeScript)) {
            known.add(basename(file).replace(/\.tsx?$/, ''));
        }
    }
    return known;
};

const surfacePaths = (): string[] => [
    join(repoRoot, 'llms.txt'),
    join(packagesRoot, 'core', 'README.md'),
    ...filesUnder(join(repoRoot, 'website', 'docs'), name => name.endsWith('.md')),
];

const mentionsIn = (path: string): TMention[] => {
    const mentions: TMention[] = [];
    const where = relative(repoRoot, path);
    const lines = readFileSync(path, 'utf8').split('\n');
    let insideFence = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (fenceBoundary.test(line)) {
            insideFence = !insideFence;
            continue;
        }
        const code = insideFence
            ? [line]
            : [...line.matchAll(inlineCodeSpan)].map(span => span[1]);
        for (const fragment of code) {
            for (const found of fragment.matchAll(namedSymbol)) {
                mentions.push({ symbol: found[0], where: `${where}:${i + 1}` });
            }
        }
    }
    return mentions;
};

const everyMention = (): TMention[] => surfacePaths().flatMap(mentionsIn);

const firstDifferingLine = (
    expectedPath: string, expected: string, actualPath: string, actual: string,
): string[] => {
    const left = expected.split('\n');
    const right = actual.split('\n');
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        if (left[i] === right[i]) continue;
        return [
            `${actualPath}:${i + 1} reads \`${right[i] ?? '<end of file>'}\``
            + ` where ${expectedPath}:${i + 1} reads \`${left[i] ?? '<end of file>'}\``,
        ];
    }
    return [];
};

describe('what a doc claims that the code does not', () => {
    it('reads a public surface big enough to be the real one', () => {
        expect(coreExportedNames.size).toBeGreaterThan(50);
        expect(surfacePaths().length).toBeGreaterThan(10);
        expect(everyMention().length).toBeGreaterThan(500);
    });

    it('names no symbol the workspace does not have', () => {
        const known = symbolsTheWorkspaceHas();
        const offences = everyMention()
            .filter(mention => !known.has(mention.symbol))
            .filter(mention => !(mention.symbol in documentedAsGone))
            .map(mention => `${mention.where} names \`${mention.symbol}\``);
        expect([...new Set(offences)].sort()).toEqual([]);
    });

    it('excuses only a symbol the workspace no longer has', () => {
        const known = symbolsTheWorkspaceHas();
        const back = Object.keys(documentedAsGone)
            .filter(symbol => known.has(symbol))
            .map(symbol => `\`${symbol}\` exists again — drop its entry`);
        expect(back.sort()).toEqual([]);
    });

    it('keeps no excuse for a symbol no doc names', () => {
        const named = new Set(everyMention().map(mention => mention.symbol));
        const unused = Object.keys(documentedAsGone)
            .filter(symbol => !named.has(symbol))
            .map(symbol => `\`${symbol}\` is named by no surface — drop its entry`);
        expect(unused.sort()).toEqual([]);
    });

    it('states the export count the package really has', () => {
        const wrong: string[] = [];
        let statements = 0;
        for (const path of surfacePaths()) {
            const where = relative(repoRoot, path);
            const lines = readFileSync(path, 'utf8').split('\n');
            for (let i = 0; i < lines.length; i++) {
                for (const found of lines[i].matchAll(statedNameCount)) {
                    statements++;
                    if (Number(found[1]) === coreExportedNames.size) continue;
                    wrong.push(
                        `${where}:${i + 1} states ${found[1]} names,`
                        + ` packages/core/src/index.ts exports ${coreExportedNames.size}`,
                    );
                }
            }
        }
        expect(wrong).toEqual([]);
        expect(statements).toBeGreaterThanOrEqual(2);
    });

    it('ships the website copy of llms.txt unchanged', () => {
        expect(firstDifferingLine(
            'llms.txt',
            readFileSync(join(repoRoot, 'llms.txt'), 'utf8'),
            'website/static/llms.txt',
            readFileSync(join(repoRoot, 'website', 'static', 'llms.txt'), 'utf8'),
        )).toEqual([]);
    });

    it('carries the llms.txt it was generated from into llms-full.txt', () => {
        const master = readFileSync(join(repoRoot, 'llms.txt'), 'utf8').trimEnd().split('\n');
        const generated = readFileSync(join(repoRoot, 'llms-full.txt'), 'utf8').split('\n');
        const start = generated.indexOf(master[0]);
        expect(start).toBeGreaterThanOrEqual(0);
        const drifted: string[] = [];
        for (let i = 0; i < master.length && drifted.length === 0; i++) {
            if (generated[start + i] === master[i]) continue;
            drifted.push(
                `llms-full.txt:${start + i + 1} reads \`${generated[start + i] ?? '<end of file>'}\``
                + ` where llms.txt:${i + 1} reads \`${master[i]}\``,
            );
        }
        expect(drifted).toEqual([]);
    });
});
