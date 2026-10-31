/**
 * Mechanical half of the file rules: one file one named export,
 * the filename equal to that name, the prefix the kind of declaration must
 * carry, and the domain folders `src/` is allowed to hold. `src/index.ts` is the
 * barrel and is exempt; `tests/` is exempt because the style rules say so.
 *
 * Exit code 0 means the tree obeys the rules. Nothing here is advisory.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, basename, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');

const EXPORT = /^export\s+(?:(abstract)\s+)?(class|interface|type|function|const|enum)\s+(\w+)/gm;
const PREFIX = { class: 'OIM', interface: 'IOIM', type: 'TOIM', enum: 'EOIM' };
const DOMAINS = ['bucket', 'channel', 'collector', 'column', 'computed', 'db', 'effect', 'entity', 'error', 'index', 'key', 'oim', 'oimdb', 'schedule', 'slot', 'store'];

function walk(dir) {
    const found = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (entry !== 'tests') found.push(...walk(full));
        } else if (entry.endsWith('.ts')) found.push(full);
    }
    return found;
}

const problems = [];
const files = walk(src);

for (const file of files) {
    const rel = relative(root, file);
    if (rel === join('src', 'index.ts') || rel === join('src', 'oim', 'oim.ts') || rel === join('src', 'oimdb', 'oimdb.ts')) continue;

    const text = readFileSync(file, 'utf8');
    const exports = [...text.matchAll(EXPORT)]
        .map(m => ({
            isAbstract: m[1] === 'abstract',
            kind: m[2],
            name: m[3],
        }))
        .filter((exported, at, all) => !(exported.kind === 'function' && all.findIndex(other => other.name === exported.name) !== at));

    if (exports.length === 0) { problems.push(`${rel}: no export`); continue; }
    if (exports.length > 1) {
        problems.push(`${rel}: ${exports.length} exports (${exports.map(e => e.name).join(', ')}) — one file, one export`);
        continue;
    }

    const [only] = exports;
    const stem = basename(file, '.ts');
    if (stem !== only.name) problems.push(`${rel}: exports ${only.name} — the filename must be exactly that`);

    const wanted = PREFIX[only.kind];
    if (wanted !== undefined && !only.name.startsWith(wanted)) {
        problems.push(`${rel}: a ${only.kind} must be prefixed ${wanted}`);
    }

    const where = relative(src, dirname(file)).split(sep).filter(part => part !== '');
    const [domain] = where;
    if (!DOMAINS.includes(domain)) {
        problems.push(
            `${rel}: sits in src/${where.join('/') || '.'}, and src/ holds the domains ${DOMAINS.join('/')} and `
            + 'index.ts and nothing else. A new domain is a decision, not a directory.',
        );
    }
}

if (problems.length > 0) {
    console.error(`${problems.length} structure violation(s):\n`);
    for (const problem of problems) console.error('  ' + problem);
    process.exit(1);
}
console.log(`structure clean: ${files.length} files, one export each, each in a domain src/ declares`);
