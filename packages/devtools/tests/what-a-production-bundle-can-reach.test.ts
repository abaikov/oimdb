/**
 * "ZERO PRODUCTION OVERHEAD" — asserted as a graph, because that is the only
 * thing it can be.
 *
 * `packages/devtools/README.md` opens with the sentence this file owns: *"Zero
 * production overhead: debug files are only imported from your debug entry
 * point, which you exclude from your production bundle."* It is not a speed
 * claim and no stopwatch can settle it — a timing harness would have to run the
 * registry to time it, which is the one thing "zero" says never happens.
 *
 * WHY NOT MEASURE THE BYTES. The obvious instrument is the wrong one: build an
 * application with the registry and one without, and diff. But a size that ought
 * to be zero is the worst thing a byte harness can be pointed at. Zero is
 * unfalsifiable by a threshold — any number small enough to pass is also small
 * enough to be a rounding of the bundler's own preamble — and a diff of 0 bytes
 * proves nothing about WHY it was 0. The claim underneath is discrete: either a
 * production entry point can reach `@oimdb/devtools` through value imports, in
 * which case a bundler must keep it and the overhead is the whole package, or it
 * cannot, in which case the overhead is exactly nothing. So this is a yes/no
 * over an import graph, and it is read the way
 * `packages/core/tests/what-an-import-retains.test.ts` reads one — in
 * milliseconds, with no toolchain, naming the offending file and line rather
 * than reporting that a number grew.
 *
 * WHAT IS DIFFERENT FROM THAT SIBLING. It follows relative imports inside one
 * package, because its question is which of `@oimdb/core`'s own modules a
 * consumer retains. This question crosses packages, so this reader also follows
 * BARE specifiers (`@oimdb/devtools`) and `export … from` re-exports — a
 * re-export is exactly how a package leaks something into its own entry point
 * without anybody writing an import of it.
 *
 * `import type` is erased by the compiler and is therefore free; only value
 * imports are followed, here as there.
 *
 * THE CLAIM HAS TWO HALVES AND THEY ARE NOT BOTH TRUE. Half one is about this
 * repository: nothing an application installs for production names the registry,
 * so an application that does not import it pays nothing. That half holds, and
 * the first three tests below pin it. Half two is about the CONSUMER'S graph —
 * "debug files are only imported from your debug entry point" — and the only
 * consumer graph in this repository is the one the README documents. There, the
 * documented `src/store/db.ts` imports the registry, and `src/store/db.ts` is a
 * production module. The last test states that, at length, because it is the
 * price the headline sentence is currently quoting as zero.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..', '..');
const PACKAGES = join(ROOT, 'packages');

/** The package this whole file is about, named once. */
const DEVTOOLS = '@oimdb/devtools';

type TImport = {
    readonly specifier: string;
    /** Erased by the compiler, so a bundler never sees it. Not followed. */
    readonly isTypeOnly: boolean;
    /** 1-based, so a failure can be opened. */
    readonly line: number;
};

/**
 * Every module specifier one file names, in a position a bundler follows.
 *
 * Four positions, and each of them is a real way this claim could be lost:
 *
 *   `import … from 'x'`   the ordinary one
 *   `export … from 'x'`   a re-export — the quiet one, since nobody reading the
 *                         file thinks of it as importing anything
 *   `import 'x'`          a side-effect import, which a bundler CANNOT drop
 *   `import('x')`         dynamic: a separate chunk, still shipped
 *
 * A `require('x')` is not looked for: every package here is `"type": "module"`
 * and the published CJS is generated from this source, never written by hand.
 */
const importsIn = (text: string): TImport[] => {
    const lineOf = (index: number): number => text.slice(0, index).split('\n').length;
    const found: TImport[] = [];

    const clause = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([\s\S]*?)\bfrom\s*'([^']+)'/g;
    for (let m = clause.exec(text); m !== null; m = clause.exec(text)) {
        const braced = m[2].match(/\{([\s\S]*)\}/);
        const named = braced === null
            ? []
            : braced[1].split(',').map(part => part.trim()).filter(part => part.length > 0);
        const everyNameIsAType = named.length > 0 && named.every(name => name.startsWith('type '));
        found.push({
            specifier: m[3],
            isTypeOnly: m[1] !== undefined || everyNameIsAType,
            line: lineOf(m.index),
        });
    }

    const sideEffect = /(?:^|\n)\s*import\s*'([^']+)'/g;
    for (let m = sideEffect.exec(text); m !== null; m = sideEffect.exec(text)) {
        found.push({ specifier: m[1], isTypeOnly: false, line: lineOf(m.index) });
    }

    const dynamic = /\bimport\(\s*'([^']+)'/g;
    for (let m = dynamic.exec(text); m !== null; m = dynamic.exec(text)) {
        found.push({ specifier: m[1], isTypeOnly: false, line: lineOf(m.index) });
    }

    return found;
};

/**
 * The same reader, over a file. Split from `importsIn` because the documented
 * consumer application in the README is not a file — it is five code blocks —
 * and it has to be read by the SAME parser as the source tree. Two parsers would
 * eventually disagree about what an import is, and the disagreement would land
 * in whichever half nobody was looking at.
 */
const importsOf = (file: string): TImport[] => importsIn(readFileSync(file, 'utf8'));

const sourceFiles = (dir: string): string[] => {
    const found: string[] = [];
    const walk = (at: string): void => {
        for (const entry of readdirSync(at, { withFileTypes: true })) {
            const path = join(at, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (path.endsWith('.ts') || path.endsWith('.tsx')) found.push(path);
        }
    };
    walk(dir);
    return found;
};

type TManifest = {
    readonly name?: string;
    readonly private?: boolean;
    readonly sideEffects?: boolean;
    readonly dependencies?: Record<string, string>;
    readonly peerDependencies?: Record<string, string>;
    readonly optionalDependencies?: Record<string, string>;
};

/**
 * A directory under `packages/` need not be a package: `browser-extension` is a
 * plain-JS Chrome extension with no manifest at all, and the linter already
 * excludes it for the same reason. A missing manifest reads as "not something
 * npm installs", which is precisely the answer this file wants from it.
 */
const manifestOf = (directory: string): TManifest => {
    const path = join(PACKAGES, directory, 'package.json');
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, 'utf8')) as TManifest;
};

/**
 * EVERY PACKAGE WHOSE CODE CAN END UP IN AN APPLICATION'S BUNDLE — derived, not
 * listed.
 *
 * Derived on purpose. A hard-coded list would go stale the moment somebody adds
 * a package, and the failure mode of a stale list here is silence: the new
 * package is the one that would have reached the registry, and it is the one the
 * test never looked at. The three exclusions each carry a reason:
 *
 *   `private: true`      never published, so no application installs it.
 *   `*-legacy`           superseded, kept for the differential suite.
 *   `@oimdb/mcp`         a Node process a developer runs, never code a browser
 *                        ships. It is also the ONE place in this repository that
 *                        names the registry — inside a string of setup advice it
 *                        prints to an assistant — which is exactly why it is
 *                        excluded here rather than allowed to pass by accident.
 *   `@oimdb/devtools`    the subject.
 */
const shippingPackages = (): readonly { directory: string; name: string }[] =>
    readdirSync(PACKAGES, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !entry.name.endsWith('-legacy'))
        .map(entry => ({ directory: entry.name, manifest: manifestOf(entry.name) }))
        .filter(({ manifest }) =>
            manifest.private !== true
            && manifest.name !== undefined
            && manifest.name !== DEVTOOLS
            && manifest.name !== '@oimdb/mcp')
        .map(({ directory, manifest }) => ({ directory, name: manifest.name as string }));

describe('what a production bundle can reach', () => {
    /**
     * THE FACT THE HEADLINE RESTS ON, in this repository's half.
     *
     * A single `import { oimDevRegistry } from '@oimdb/devtools'` added to
     * `OIMChannel`'s error path, or to a react hook "just for a warning", would put the whole
     * registry into every application that imports the engine — and nothing else
     * here would notice: the types check, every other test passes, the package
     * builds, and the only symptom is a number in somebody else's bundle. That
     * is the same silent decay `what-an-import-retains.test.ts` was written for,
     * one level up, between packages instead of between modules.
     */
    it('no package an application installs names the registry in an import', () => {
        const offenders: string[] = [];
        for (const { directory } of shippingPackages()) {
            const src = join(PACKAGES, directory, 'src');
            if (!existsSync(src)) continue;
            for (const file of sourceFiles(src)) {
                for (const named of importsOf(file)) {
                    if (named.specifier !== DEVTOOLS && !named.specifier.startsWith(`${DEVTOOLS}/`)) continue;
                    if (named.isTypeOnly) continue;
                    offenders.push(`${file.slice(ROOT.length + 1)}:${named.line}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    /**
     * And it is not merely absent from the source — it is absent from what npm
     * installs. A package that listed devtools as a `dependency` would put it in
     * every consumer's `node_modules` and, more to the point, would say to a
     * reader that shipping it is normal. It is installed with `--save-dev`, by a
     * person, or it is not installed.
     */
    it('no package an application installs depends on devtools', () => {
        const offenders: string[] = [];
        for (const { directory, name } of shippingPackages()) {
            const manifest = manifestOf(directory);
            for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies'] as const) {
                if (manifest[field]?.[DEVTOOLS] !== undefined) offenders.push(`${name} → ${field}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    /**
     * `oimDevRegistry.ts` is `export const oimDevRegistry = new OIMDevRegistry()` — a
     * construction at module scope, which is a side effect. A bundler keeps a
     * module with side effects even when nothing imports a name from it, so
     * without `"sideEffects": false` in this package's manifest the registry
     * would survive tree-shaking in any application that so much as had the
     * module in its graph, and "zero" would be false for a reason nobody would
     * think to look for. The claim depends on one JSON field; the field is
     * asserted.
     */
    it('devtools tells bundlers it has nothing to run', () => {
        expect(manifestOf('devtools').sideEffects).toBe(false);
        expect(manifestOf('devtools').dependencies ?? {}).toEqual({});
        expect(Object.keys(manifestOf('devtools').peerDependencies ?? {})).toEqual(['@oimdb/core']);
    });

    /**
     * THE OTHER HALF OF THE CLAIM, AND IT DOES NOT HOLD AS DOCUMENTED.
     *
     * "Debug files are only imported from your debug entry point" is a statement
     * about the CONSUMER'S graph, and the only consumer graph this repository
     * has is the application the README writes out block by block. So this test
     * reads that application: every fenced block whose first line is a path
     * comment is one of its modules, and the specifiers inside it are its edges.
     *
     * The application it describes has five modules. Two of them are production
     * — `src/store/db.ts` and `src/store/users.ts` — and three are excluded from
     * the production bundle by the recipe itself: `src/debug.ts` and the two
     * `*.debug.ts` files it imports.
     *
     * `src/store/db.ts` imports the registry. It has to, and the README says why
     * on the line above the import: the engine's error hook is a CONSTRUCTION
     * option, `new OIMChannel({ errorPolicy })`, so the only place to hand it a sink is
     * the module that constructs the database — which is production, and which
     * every store module imports. There is no debug file that can reach back and
     * install it afterwards.
     *
     * So the documented setup ships `OIMDevRegistry` to production, and the
     * headline sentence above it is not true of the setup printed underneath it.
     * This assertion states the current fact rather than the promise, so the
     * suite is honest today; the list is what must become EMPTY for the sentence
     * to hold. Two things would empty it, and both are decisions for a person:
     * make the error sink settable after construction so the wiring can move
     * into `debug.ts`, or soften the sentence to what is actually free — that
     * NOT importing it costs nothing, which is the three tests above.
     *
     * The day either happens, this test fails and points at the line that
     * changed. That is the intent: it is a debt marker with an owner, not a
     * pinned defect.
     */
    it('the documented setup reaches the registry from a production module', () => {
        const readme = readFileSync(join(PACKAGES, 'devtools', 'README.md'), 'utf8');

        /**
         * A documented module is a fenced `ts` block whose first line is a path
         * comment. The blocks that are not — `oimDevRegistry.inspect()`, the API
         * examples — are fragments, not files, and have no place in a graph.
         */
        const documented = new Map<string, readonly string[]>();
        const block = /```ts(?: file=\S+)?\n\/\/ (\S+\.ts)[^\n]*\n([\s\S]*?)```/g;
        for (let m = block.exec(readme); m !== null; m = block.exec(readme)) {
            documented.set(
                m[1],
                importsIn(m[2]).filter(named => !named.isTypeOnly).map(named => named.specifier),
            );
        }

        // The reader is looking at the application the README documents, and not
        // at an empty map because a fence style changed.
        expect([...documented.keys()]).toEqual([
            'src/store/db.ts',
            'src/store/users.ts',
            'src/store/tasks.ts',
            'src/store/users.debug.ts',
            'src/store/tasks.debug.ts',
            'src/debug.ts',
        ]);

        /** What the recipe excludes from the production bundle, by its own rule. */
        const isExcluded = (module: string): boolean =>
            module === 'src/debug.ts' || module.endsWith('.debug.ts');

        const reachesRegistry = [...documented.entries()]
            .filter(([module]) => !isExcluded(module))
            .filter(([, specifiers]) => specifiers.includes(DEVTOOLS))
            .map(([module]) => module);

        expect(reachesRegistry).toEqual(['src/store/db.ts']);

        // And it is not one stray module: every production module in the recipe
        // reaches it, because the one that constructs the database is the one
        // every other production module imports.
        expect(documented.get('src/store/users.ts')).toContain('./db');
    });

    /**
     * The reader is reading real files and real manifests. Without this the
     * three assertions above pass just as happily against a walk that found
     * nothing — an empty offender list is the same shape whether the invariant
     * holds or the scanner is broken.
     */
    it('reads a graph with something in it', () => {
        const shipping = shippingPackages().map(entry => entry.name);
        expect(shipping).toContain('@oimdb/core');
        expect(shipping).toContain('@oimdb/react');
        expect(shipping).not.toContain(DEVTOOLS);

        const reactImports = sourceFiles(join(PACKAGES, 'react', 'src'))
            .flatMap(file => importsOf(file));
        expect(reactImports.map(named => named.specifier)).toContain('@oimdb/core');
        const reachingForAValue = sourceFiles(join(PACKAGES, 'react', 'src'))
            .filter(file => importsOf(file)
                .some(named => named.specifier === '@oimdb/core' && !named.isTypeOnly))
            .map(file => file.slice(file.lastIndexOf('/') + 1));
        expect(reachingForAValue).toEqual([
            'OIMSnapshotVersion.ts', 'holdWhileSubscribed.ts', 'useOIMComputedValueByKey.ts',
            'useOIMSlotByKey.ts', 'useOIMSlotsByKeys.ts', 'useOIMValue.ts',
        ]);
    });
});
