import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { CHURN_SHAPES, READ_SHAPES, wiringNameOf } from '../harness/types';
import type { TChurnShapeKey, TReadShapeKey, TScenario } from '../harness/types';

export type TWiringShape =
    | 'bind'
    | 'bindPerGroup'
    | `churn.${TChurnShapeKey}`
    | `reads.${TReadShapeKey}`
    | 'relations'
    | 'single';

export const WIRING_SHAPES: readonly TWiringShape[] = [
    'bind',
    'bindPerGroup',
    ...CHURN_SHAPES.map(shape => `churn.${shape}` as const),
    ...READ_SHAPES.map(shape => `reads.${shape}` as const),
    'relations',
    'single',
];

export type TShapeVolume = {
    shape: TWiringShape;
    codeLines: number;
    declarations: readonly string[];
};

const CHURN_MOUNT_OF: Readonly<Record<TChurnShapeKey, string>> = {
    row: 'mountOnRows',
    wide: 'mountOnRows',
    column: 'mountOnColumn',
    chain: 'mountOnChain',
    diamond: 'mountOnDiamond',
};

const READ_METHOD_OF: Readonly<Record<TReadShapeKey, string | undefined>> = {
    byKey: 'readKeys',
    byWindow: 'scrollTo',
    byTwoAxes: undefined,
    bySwitch: 'switchGroup',
};

const LITERAL_PROPERTY_OF = (shape: TWiringShape): string =>
    shape.startsWith('churn.') ? 'churn' : shape.startsWith('reads.') ? 'reads' : shape;

const excludedMethodsOf = (shape: TWiringShape): ReadonlySet<string> => {
    if (shape.startsWith('churn.')) {
        const own = CHURN_MOUNT_OF[shape.slice('churn.'.length) as TChurnShapeKey];
        return new Set(Object.values(CHURN_MOUNT_OF).filter(method => method !== own));
    }
    if (shape.startsWith('reads.')) {
        const own = READ_METHOD_OF[shape.slice('reads.'.length) as TReadShapeKey];
        return new Set(
            Object.values(READ_METHOD_OF).filter((method): method is string => method !== undefined && method !== own)
        );
    }
    return new Set();
};

export const shapeOfScenario = (scenario: TScenario): TWiringShape => {
    const wiring = wiringNameOf(scenario);
    if (wiring === '') return scenario.perGroup === true ? 'bindPerGroup' : 'bind';
    return wiring as TWiringShape;
};

const isCommentLine = (line: string): boolean => /^\s*(\*|\/\/|\/\*)/.test(line);

const nameOfMember = (node: ts.Node): string | undefined => {
    if (
        (ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node) || ts.isShorthandPropertyAssignment(node)) &&
        ts.isIdentifier(node.name)
    ) {
        return node.name.text;
    }
    return undefined;
};

class SourceIndex {
    private readonly lines: readonly string[];

    public readonly declarations = new Map<string, ts.Node>();

    public constructor(public readonly source: ts.SourceFile) {
        this.lines = source.getFullText().split('\n');
        for (const statement of source.statements) {
            if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
                this.declarations.set(statement.name.text, statement);
            } else if (ts.isClassDeclaration(statement) && statement.name !== undefined) {
                this.declarations.set(statement.name.text, statement);
            } else if (ts.isVariableStatement(statement)) {
                for (const declaration of statement.declarationList.declarations) {
                    if (ts.isIdentifier(declaration.name)) this.declarations.set(declaration.name.text, declaration);
                }
            }
        }
    }

    public codeLinesOf(node: ts.Node): number {
        const from = this.source.getLineAndCharacterOfPosition(node.getStart(this.source)).line;
        const to = this.source.getLineAndCharacterOfPosition(node.getEnd()).line;
        let count = 0;
        for (let i = from; i <= to; i++) {
            const line = this.lines[i];
            if (line === undefined || line.trim() === '' || isCommentLine(line)) continue;
            count++;
        }
        return count;
    }
}

const adapterLiteralsOf = (source: ts.SourceFile): ts.ObjectLiteralExpression[] => {
    const literals: ts.ObjectLiteralExpression[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isObjectLiteralExpression(node)) {
            const names = new Set(node.properties.map(nameOfMember));
            if (names.has('bind') && names.has('churn') && names.has('reads')) literals.push(node);
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return literals;
};

const isPropertyName = (node: ts.Identifier): boolean => {
    const parent = node.parent;
    if (ts.isPropertyAccessExpression(parent)) return parent.name === node;
    if (
        ts.isPropertyAssignment(parent) ||
        ts.isMethodDeclaration(parent) ||
        ts.isPropertyDeclaration(parent) ||
        ts.isPropertySignature(parent)
    ) {
        return parent.name === node;
    }
    return false;
};

const PRINTER = ts.createPrinter({ removeComments: true });

const canonicalLayout: ts.TransformerFactory<ts.SourceFile> = context => {
    const { factory } = context;
    const visit = (node: ts.Node): ts.Node => {
        const visited = ts.visitEachChild(node, visit, context);
        const laidOut = ts.isBlock(visited)
            ? factory.createBlock(visited.statements, true)
            : ts.isObjectLiteralExpression(visited)
              ? factory.createObjectLiteralExpression(visited.properties, true)
              : ts.isArrayLiteralExpression(visited)
                ? factory.createArrayLiteralExpression(visited.elements, false)
                : visited;
        return ts.setTextRange(laidOut, { pos: -1, end: -1 });
    };
    return source => ts.visitNode(source, visit) as ts.SourceFile;
};

const normalizedSourceOf = (file: string): ts.SourceFile => {
    const original = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true);
    const [canonical] = ts.transform(original, [canonicalLayout]).transformed;
    return ts.createSourceFile(file, PRINTER.printFile(canonical), ts.ScriptTarget.ESNext, true);
};

const measure = (
    index: SourceIndex,
    seed: ts.Node,
    excluded: ReadonlySet<string>
): { codeLines: number; declarations: string[] } => {
    const reached = new Set<string>();
    let excludedLines = 0;
    const queue: ts.Node[] = [seed];
    const walk = (node: ts.Node): void => {
        const member = nameOfMember(node);
        if (member !== undefined && excluded.has(member)) {
            excludedLines += index.codeLinesOf(node);
            return;
        }
        if (ts.isIdentifier(node) && !isPropertyName(node) && !reached.has(node.text)) {
            const target = index.declarations.get(node.text);
            if (target !== undefined) {
                reached.add(node.text);
                queue.push(target);
            }
        }
        ts.forEachChild(node, walk);
    };
    let codeLines = 0;
    while (queue.length > 0) {
        const node = queue.pop() as ts.Node;
        codeLines += index.codeLinesOf(node);
        walk(node);
    }
    return { codeLines: codeLines - excludedLines, declarations: [...reached].sort() };
};

export const wiringCodeVolume = (file: string): readonly TShapeVolume[] => {
    const source = normalizedSourceOf(file);
    const index = new SourceIndex(source);
    const [literal] = adapterLiteralsOf(source);
    if (literal === undefined) return [];
    const volumes: TShapeVolume[] = [];
    for (const shape of WIRING_SHAPES) {
        const property = literal.properties.find(member => nameOfMember(member) === LITERAL_PROPERTY_OF(shape));
        if (property === undefined) continue;
        const { codeLines, declarations } = measure(index, property, excludedMethodsOf(shape));
        volumes.push({ shape, codeLines, declarations });
    }
    return volumes;
};
