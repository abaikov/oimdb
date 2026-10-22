// What makes two measurements the same experiment: a digest over the bytes under a
// piece, not a commit hash. Every field, the directory exception and the
// over-invalidation trade are in `README.md#identity`.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { arch, cpus, hostname } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export type TExperiment = {
    harness: string;
    subject: string;
    libraries: string;
    node: string;
    machine: string;
    host: string;
};

const here = dirname(fileURLToPath(import.meta.url));
const BENCH = join(here, '..', '..');
const PACKAGES = join(BENCH, '..');
const REPO = join(PACKAGES, '..');

// Neither input to the build nor stable between checkouts.
const SKIP = new Set(['node_modules', 'dist', 'coverage']);

// The one directory under `src` excluded from `harness`, because writing an entry
// in it marked every stored piece stale. See `README.md#identity`.
const DECISION_REGISTER = join(BENCH, 'src', 'decisions');

// `regular` is false for a symlink: following it and ignoring it are both ways to
// hash something and not notice.
type TEntry = { path: string; regular: boolean };

const entriesUnder = (
    root: string,
    excluded: readonly string[]
): readonly TEntry[] => {
    if (!existsSync(root)) return [];
    if (!statSync(root).isDirectory()) return [{ path: root, regular: true }];
    const found: TEntry[] = [];
    const walk = (dir: string): void => {
        const listed = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
            a.name < b.name ? -1 : 1
        );
        for (const entry of listed) {
            if (SKIP.has(entry.name)) continue;
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (excluded.includes(full)) continue;
                walk(full);
                continue;
            }
            found.push({ path: full, regular: entry.isFile() });
        }
    };
    walk(root);
    return found;
};

// EVERY BYTE of every file goes in, comments included and unnormalised: editing any
// file under a tree between two scenarios makes their two rows different
// experiments. Path and byte length are streamed beside the bytes, so a move, a
// truncation and a concatenation are all changes.
const digestOf = (
    roots: readonly string[],
    excluded: readonly string[] = []
): string => {
    const hash = createHash('sha256');
    for (const root of roots) {
        for (const entry of entriesUnder(root, excluded)) {
            const relative = entry.path.slice(REPO.length + 1).split(sep).join('/');
            if (!entry.regular) {
                hash.update(`${relative}\0not-a-regular-file\0`);
                continue;
            }
            const bytes = readFileSync(entry.path);
            hash.update(`${relative}\0${bytes.length}\0`);
            hash.update(bytes);
        }
    }
    return hash.digest('hex').slice(0, 16);
};

// Computed ONCE per invocation, at import. Recomputing per piece would let a file
// edited mid-run be attributed to whichever half of the run noticed first.
export const EXPERIMENT: TExperiment = {
    harness: digestOf([join(BENCH, 'src')], [DECISION_REGISTER]),
    subject: digestOf([
        join(PACKAGES, 'core', 'src'),
        join(PACKAGES, 'core-legacy', 'src'),
    ]),
    libraries: digestOf([join(REPO, 'package-lock.json')]),
    node: process.version,
    machine: `${arch()} ${cpus().length}× ${cpus()[0]?.model ?? 'unknown cpu'}`,
    host: createHash('sha256').update(hostname()).digest('hex').slice(0, 8),
};

// Names the differing fields rather than counting them: "stale" alone does not say
// whether to re-measure one piece or all of them.
export const experimentDifference = (
    a: TExperiment,
    b: TExperiment
): readonly string[] => {
    const differing: string[] = [];
    if (a.harness !== b.harness) differing.push('harness sources');
    if (a.subject !== b.subject) differing.push('subject sources (core / core-legacy)');
    if (a.libraries !== b.libraries) differing.push('package-lock.json');
    if (a.node !== b.node) differing.push(`node (${a.node} vs ${b.node})`);
    if (a.machine !== b.machine) differing.push(`machine (${a.machine} vs ${b.machine})`);
    if (a.host !== b.host) differing.push('host');
    return differing;
};
