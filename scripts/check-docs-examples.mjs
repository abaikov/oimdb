import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = join(ROOT, 'packages');
const PACKAGES_THIS_API_IS_NOT = new Set(['core-legacy', 'bench']);
const VIRTUAL_DIR = join(ROOT, '.docs-examples');

const filesUnder = (directory, keep) => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : filesUnder(full, keep);
    return keep(entry.name) ? [full] : [];
});

const packageNames = readdirSync(PACKAGES).filter(name => !PACKAGES_THIS_API_IS_NOT.has(name));

const docs = [
    join(ROOT, 'README.md'),
    join(ROOT, 'llms.txt'),
    ...packageNames.map(name => join(PACKAGES, name, 'README.md')).filter(path => existsSync(path)),
    ...filesUnder(join(ROOT, 'website', 'docs'), name => name.endsWith('.md') || name.endsWith('.mdx')),
];

const FENCE = /^\s*```(\S*)\s*(\S*)/;
const EXAMPLE_LANGUAGES = new Set(['ts', 'typescript', 'tsx']);

const blocksOf = (path) => {
    const lines = readFileSync(path, 'utf8').split('\n');
    const blocks = [];
    let open;
    for (let i = 0; i < lines.length; i++) {
        const fence = lines[i].match(FENCE);
        if (fence === null) {
            if (open !== undefined) open.lines.push(lines[i]);
            continue;
        }
        if (open === undefined) {
            open = { language: fence[1], role: fence[2], firstLine: i + 2, lines: [] };
            continue;
        }
        if (EXAMPLE_LANGUAGES.has(open.language)) blocks.push(open);
        open = undefined;
    }
    return blocks;
};

const virtualFiles = new Map();
for (const doc of docs) {
    const where = relative(ROOT, doc);
    const blocks = blocksOf(doc);
    const docDirectory = join(VIRTUAL_DIR, where.replace(/[^\w]/g, '_'));
    for (const block of blocks.filter(candidate => candidate.role.startsWith('file='))) {
        const text = ['export {};', ...block.lines];
        const origin = [undefined, ...block.lines.map((_, k) => `${where}:${block.firstLine + k}`)];
        const filePath = join(docDirectory, block.role.slice('file='.length).replace(/\.ts$/, '.tsx'));
        virtualFiles.set(filePath, { text: text.join('\n'), origin });
    }
    const setup = blocks.filter(block => block.role === 'setup');
    const examples = blocks.filter(block =>
        block.role !== 'setup' && block.role !== 'signature' && !block.role.startsWith('file='));
    const units = examples.length > 0 ? examples : setup.length > 0 ? [undefined] : [];
    units.forEach((example, n) => {
        const text = ['export {};'];
        const origin = [undefined];
        for (const block of example === undefined ? setup : [...setup, example]) {
            block.lines.forEach((line, k) => { text.push(line); origin.push(`${where}:${block.firstLine + k}`); });
        }
        virtualFiles.set(join(VIRTUAL_DIR, `${where.replace(/[^\w]/g, '_')}__${n}.tsx`), { text: text.join('\n'), origin });
    });
}

const paths = {};
for (const name of packageNames) {
    const index = join(PACKAGES, name, 'src', 'index.ts');
    if (existsSync(index)) paths[`@oimdb/${name}`] = [index];
}
const reactTypesOfTheReactPackage = join(PACKAGES, 'react', 'node_modules', '@types', 'react');
if (existsSync(reactTypesOfTheReactPackage)) {
    paths.react = [reactTypesOfTheReactPackage];
    paths['react/*'] = [join(reactTypesOfTheReactPackage, '*')];
}

const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    baseUrl: ROOT,
    paths,
    types: [],
};

const host = ts.createCompilerHost(options);
const readFile = host.readFile.bind(host);
const fileExists = host.fileExists.bind(host);
const getSourceFile = host.getSourceFile.bind(host);
host.readFile = path => virtualFiles.get(path)?.text ?? readFile(path);
host.fileExists = path => virtualFiles.has(path) || fileExists(path);
const directoryExists = host.directoryExists?.bind(host);
host.directoryExists = path => path.startsWith(VIRTUAL_DIR) || (directoryExists === undefined ? true : directoryExists(path));
host.getSourceFile = (path, languageVersion, ...rest) => {
    const virtual = virtualFiles.get(path);
    return virtual === undefined
        ? getSourceFile(path, languageVersion, ...rest)
        : ts.createSourceFile(path, virtual.text, languageVersion, true, ts.ScriptKind.TSX);
};

const packageIndexes = Object.values(paths).flat().filter(path => path.endsWith('index.ts'));
const program = ts.createProgram([...virtualFiles.keys(), ...packageIndexes], options, host);
const problems = new Set();

const sourceDirectories = [
    ...readdirSync(PACKAGES).filter(name => name !== 'core-legacy')
        .flatMap(name => ['src', 'bin', 'ui'].map(part => join(PACKAGES, name, part))),
    join(ROOT, 'node_modules', '@types', 'react-dom'),
].filter(directory => existsSync(directory));
const benchSources = sourceDirectories
    .flatMap(directory => filesUnder(directory, name => /\.(?:tsx?|c?js|mjs)$/.test(name)))
    .map(path => ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ES2022, true));

const NAMES_THAT_LIVE_OUTSIDE_THE_WORKSPACE = {
    mcpServers: 'the key of an MCP client configuration file',
    Access: 'part of the HTTP header Access-Control-Allow-Origin',
    Allow: 'part of the HTTP header Access-Control-Allow-Origin',
    Host: 'the HTTP Host header',
    AsyncStorage: '@react-native-async-storage/async-storage, a peer this repo does not install',
    isolatedModules: 'a tsconfig compiler option',
    noEmit: 'a tsconfig compiler option',
    DataCloneError: 'the name of the DOMException IndexedDB throws for a value structured clone refuses',
    Maximum: 'the first word of React\'s own error "Maximum update depth exceeded"',
};
const knownNames = new Set(Object.keys(NAMES_THAT_LIVE_OUTSIDE_THE_WORKSPACE));
for (const sourceFile of [...program.getSourceFiles(), ...benchSources]) {
    const visit = (node) => {
        if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) knownNames.add(node.text.replace(/^#/, ''));
        else if (ts.isStringLiteralLike(node)) knownNames.add(node.text);
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
}

const CODE_SPAN = /`([^`\n]+)`/g;
const QUOTED = /(['"])(?:(?!\1).)*\1/g;
const NAME = /(\.)?\b([A-Za-z_$][\w$]*)\b(\s*\()?/g;
const looksLikeCode = (name, afterDot, beforeCall) =>
    afterDot || beforeCall || /[a-z][A-Z]/.test(name) || /^[A-Z][a-z]/.test(name) || /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(name);
const isPathOrCommand = (span) => /\/\w|\.(?:ts|tsx|md|mjs|cjs|js|json|txt|css|html)\b|^(?:npm|npx|node|git|cd)\s/.test(span);

const namesIn = (text) => {
    const found = [];
    for (const match of text.replace(QUOTED, '').matchAll(NAME)) {
        const [, afterDot, name, beforeCall] = match;
        if (ts.stringToToken(name) !== undefined) continue;
        if (looksLikeCode(name, afterDot !== undefined, beforeCall !== undefined)) found.push(name);
    }
    return found;
};

for (const doc of docs) {
    const where = relative(ROOT, doc);
    const lines = readFileSync(doc, 'utf8').split('\n');
    let fence;
    for (let i = 0; i < lines.length; i++) {
        const opened = lines[i].match(FENCE);
        if (opened !== null) {
            fence = fence === undefined ? { language: opened[1], role: opened[2] } : undefined;
            continue;
        }
        const pieces = fence === undefined
            ? [...lines[i].matchAll(CODE_SPAN)].map(span => span[1]).filter(span => !isPathOrCommand(span))
            : EXAMPLE_LANGUAGES.has(fence.language) && fence.role === 'signature' ? [lines[i].replace(/\/\/.*$/, '')] : [];
        for (const piece of pieces) {
            for (const name of namesIn(piece)) {
                if (!knownNames.has(name)) problems.add(`${where}:${i + 1}: names \`${name}\`, which no source declares`);
            }
        }
    }
}
const HAND_TYPED_MEASUREMENT = /\b\d+(?:\.\d+)? ?(?:ns|µs)\b|\b\d+\.\d+ ?[x×](?![\w-])/;
const PRICE_ID = /<BenchPrice\s+id="([^"]+)"/g;
const PRICE_PATH = /<Bench(?:Price|Alternative)Table\s+path="([^"]+)"/g;
const benchPrices = JSON.parse(readFileSync(join(ROOT, 'website', 'src', 'data', 'bench', 'prices.json'), 'utf8'));
const publishedPriceIds = new Set([...benchPrices.pairs, ...benchPrices.controls].map(pair => pair.id));
const PRICE_PATHS = new Set(['per declaration', 'per relationship', 'per frame', 'per write', 'per row per write', 'per read']);
const WEBSITE_DOCS = join(ROOT, 'website', 'docs');
for (const doc of docs.filter(path => path.startsWith(WEBSITE_DOCS))) {
    const where = relative(ROOT, doc);
    const lines = readFileSync(doc, 'utf8').split('\n');
    let isInFence = false;
    for (let i = 0; i < lines.length; i++) {
        if (FENCE.test(lines[i])) { isInFence = !isInFence; continue; }
        if (isInFence) continue;
        const prose = lines[i].replace(CODE_SPAN, '');
        if (HAND_TYPED_MEASUREMENT.test(prose)) {
            problems.add(`${where}:${i + 1}: a hand-typed measurement; publish it and render it with <BenchPrice> or <BenchPriceTable>`);
        }
        for (const [, id] of lines[i].matchAll(PRICE_ID)) {
            if (publishedPriceIds.size > 0 && !publishedPriceIds.has(id)) problems.add(`${where}:${i + 1}: price \`${id}\` is not in prices.json`);
        }
        for (const [, path] of lines[i].matchAll(PRICE_PATH)) {
            if (!PRICE_PATHS.has(path)) problems.add(`${where}:${i + 1}: \`${path}\` is not a price path`);
        }
    }
}

for (const diagnostic of [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()]) {
    const file = diagnostic.file;
    const virtual = file === undefined ? undefined : virtualFiles.get(file.fileName);
    if (virtual === undefined) continue;
    const { line } = file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
    problems.add(`${virtual.origin[line] ?? relative(ROOT, file.fileName)}: ${message}`);
}

const sorted = [...problems].sort();
for (const problem of sorted) console.log(problem);
console.log(`${virtualFiles.size} examples from ${docs.length} docs: ${sorted.length} problem(s)`);
process.exit(sorted.length === 0 ? 0 : 1);
