import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import * as ts from 'typescript';

const PACKAGES = join(__dirname, '..', '..');
const SKIPPED_PACKAGES = new Set(['bench', 'core-legacy']);

const THROWING_IS_THE_STRATEGY = [
    'core/src/engine/error/OIMErrorPolicyThrowAtOnce.ts OIMErrorPolicyThrowAtOnce.onErrorCaught',
];

const sourceFilesOf = (dir: string): string[] => {
    const found: string[] = [];
    const walk = (current: string): void => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            if (entry.name === 'tests' || entry.name === 'node_modules' || entry.name === 'dist') continue;
            const path = join(current, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (/\.tsx?$/.test(entry.name) && !/\.(test|d)\.tsx?$/.test(entry.name)) found.push(path);
        }
    };
    walk(dir);
    return found;
};

const everySourceFile = (): string[] => readdirSync(PACKAGES, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !SKIPPED_PACKAGES.has(entry.name))
    .flatMap(entry => {
        const src = join(PACKAGES, entry.name, 'src');
        try { return sourceFilesOf(src); } catch { return []; }
    })
    .sort();

const throwsOnEveryPath = (body: ts.Block): boolean => {
    const last = body.statements[body.statements.length - 1];
    if (last === undefined || !ts.isThrowStatement(last)) return false;
    let returns = false;
    const visit = (node: ts.Node): void => {
        if (ts.isFunctionLike(node)) return;
        if (ts.isReturnStatement(node)) returns = true;
        ts.forEachChild(node, visit);
    };
    body.statements.forEach(visit);
    return !returns;
};

const membersThatOnlyThrow = (): string[] => {
    const found: string[] = [];
    for (const path of everySourceFile()) {
        const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ES2022, true);
        const where = relative(PACKAGES, path).split(sep).join('/');
        const visit = (node: ts.Node): void => {
            const isMember = ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)
                || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node);
            if (isMember && node.body !== undefined && throwsOnEveryPath(node.body)) {
                const owner = ts.isClassDeclaration(node.parent) && node.parent.name !== undefined
                    ? `${node.parent.name.text}.` : '';
                found.push(`${where} ${owner}${node.name?.getText(file) ?? '<anonymous>'}`);
            }
            ts.forEachChild(node, visit);
        };
        visit(file);
    }
    return found.sort();
};

describe('no member exists to throw', () => {
    it('leaves no method, function or accessor that throws on every path, but a strategy whose job is to throw', () => {
        expect(membersThatOnlyThrow()).toEqual(THROWING_IS_THE_STRATEGY);
    });

    it('reads every package it should', () => {
        expect(everySourceFile().length).toBeGreaterThan(300);
        expect(everySourceFile().some(path => path.includes(`${sep}persist${sep}src${sep}`))).toBe(true);
    });
});
