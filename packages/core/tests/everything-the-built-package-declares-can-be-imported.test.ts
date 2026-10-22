/**
 * EVERYTHING THE BUILT PACKAGE DECLARES CAN BE IMPORTED — a census over
 * `dist/`, not over `src/`, because the artifact is what a consumer receives and
 * the two disagreed on all four counts below.
 *
 * ─── WHY THIS ONE READS `dist/` ───────────────────────────────────────────
 *
 * `TESTING.md` §4 says a census reads `src/` and never `tests/`. That rule is
 * about not pinning a test filename; it is silent on the build, and the defects
 * pinned here ARE NOT IN `src/`:
 *
 *   - `src/index.ts` writes `export type { OIMEffect }`; the built `.d.ts`
 *     listed it with no `type` modifier and `dist/index.js` did not export it,
 *     so `new OIMEffect(...)` type-checked and threw.
 *   - Two files each declaring a module-local `TChain`: flattened into one scope
 *     the bundler emits `TChain$1` and `TChain`, unexported, in public
 *     signatures. Any two files can do it.
 *   - `IOIMComputedSource`, `IOIMWriteTarget` and `IOIMStore` were declared
 *     in the artifact and absent from its export list.
 *
 * Each is a property of the FLATTENED bundle: no arrangement of source files can
 * be asked whether the bundle came out honest; only the bundle can.
 *
 * ─── ONE PAIR PER FORMAT, DISCOVERED AND NOT NAMED ────────────────────────
 *
 * `--format esm,cjs` emits `index.d.ts`/`index.js` and `index.d.cts`/`index.cjs`,
 * and a check pinned to the first name passes while the second ships the very
 * defect above. So the pairs are read off `dist/` — every `.d.ts`, `.d.cts`,
 * `.d.mts` beside the module it describes — and the next format added is covered
 * without an edit here.
 *
 * ─── WHEN `dist/` IS NOT THERE ────────────────────────────────────────────
 *
 * CI runs `npm test` BEFORE `npm run build` (`.github/workflows/ci.yml`) and a
 * fresh checkout carries no `dist/`, so failing on its absence would make every
 * clean clone red. Instead ONE case runs unconditionally and asserts what
 * PRODUCES the honest artifact: that `package.json`'s `build` still runs
 * `scripts/mark-type-only-exports.mjs`. The rest are skipped with a notice on
 * stderr, so a clone which never builds never checks the bundle at all.
 *
 * ─── WHAT THIS CANNOT CATCH ───────────────────────────────────────────────
 *
 * IT DOES NOT KNOW WHETHER `dist/` IS CURRENT. A build from before the edit in
 * your working tree passes as green as a fresh one, and an mtime comparison
 * against `src/` reports a checkout as stale. A green run says "the last build
 * was honest", never "this source would build honestly".
 *
 * IT SAYS NOTHING ABOUT LINK TARGETS: some two dozen `{@link}`s that resolve to
 * nothing for a consumer, each a live symbol in `src/` that declaration emit
 * strips. Pinning them decides first whether a doc comment shipped to a consumer
 * may point inside the package — a decision, not a test.
 *
 * IT READS TEXT, NOT TYPES. Export lists and declaration heads are matched with
 * regular expressions against files the bundler emits in one fixed shape. A
 * shape change fails loudly — the first case below asserts the parse found
 * something — rather than passing on an empty match.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGE = join(__dirname, '..');
const DIST = join(PACKAGE, 'dist');
const ENTRY = join(PACKAGE, 'src', 'index.ts');
const MARKER = 'scripts/mark-type-only-exports.mjs';

/** The one `export { … };` the bundler emits, whichever file it is in. */
const EXPORT_LIST = /^export \{([\s\S]*?)\};$/m;

/** What the CommonJS module lists instead, in its trailing annotation. */
const COMMONJS_LIST = /module\.exports = \{([\s\S]*?)\}\);/;

/** A declaration at column 0 of a flattened `.d.ts`. */
const DECLARATION = /^(?:declare )?(?:abstract class|class|function|const|let|var|enum|interface|type|namespace) ([A-Za-z_$][\w$]*)/gm;

type TSpecifier = { name: string; isType: boolean };

/** `type A as B` and `A as B` both export the name after `as`. */
const exportedName = (raw: string): string => {
    const parts = raw.replace(/^type /, '').split(' as ');
    return parts[parts.length - 1].trim();
};

const specifiersOf = (source: string): TSpecifier[] => {
    const list = EXPORT_LIST.exec(source) ?? COMMONJS_LIST.exec(source);
    if (list === null) return [];
    return list[1].split(',').map(raw => raw.trim()).filter(raw => raw !== '').map(raw => ({
        name: exportedName(raw),
        isType: raw.startsWith('type '),
    }));
};

/** `index.d.ts` → `index.js`, `index.d.cts` → `index.cjs`, and so on. */
const artifacts = (existsSync(DIST) ? readdirSync(DIST) : [])
    .filter(name => /\.d\.[cm]?ts$/.test(name))
    .sort()
    .map(declaration => ({
        declaration,
        moduleFile: declaration.replace(/\.d\.([cm]?)ts$/, '.$1js'),
    }))
    .map(pair => {
        const dts = readFileSync(join(DIST, pair.declaration), 'utf8');
        const modulePath = join(DIST, pair.moduleFile);
        const shipped = specifiersOf(dts);
        return {
            ...pair,
            shipped,
            shippedNames: new Set(shipped.map(specifier => specifier.name)),
            exported: new Set(
                specifiersOf(existsSync(modulePath) ? readFileSync(modulePath, 'utf8') : '')
                    .map(specifier => specifier.name),
            ),
            /** Every name declared at the top level of the bundle, exported or not. */
            declared: [...dts.matchAll(DECLARATION)].map(match => match[1]),
        };
    });

if (artifacts.length === 0) {
    console.error(
        '\n─── dist/ is not built, so the artifact cases below are skipped ───\n'
        + `  ${DIST}\n  build it with: npm run build --workspace @oimdb/core\n`,
    );
}

/**
 * What the barrel MEANT — every name it exports with `export type`. Read off the
 * source because that is where the intent is written; the artifact is what is
 * being checked against it.
 */
const meantAsType = new Set(
    [...readFileSync(ENTRY, 'utf8').matchAll(/^export type \{\s*([^}]*?)\s*\}/gm)]
        .flatMap(match => match[1].split(',').map(raw => raw.trim()))
        .filter(raw => raw !== '')
        .map(exportedName),
);

const packageJson = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8')) as
    { scripts: Record<string, string> };

describe('everything the built package declares can be imported', () => {
    /**
     * THE ONE THAT ALWAYS RUNS. The bundler cannot express `export type` of a
     * class — rollup-plugin-dts derives the modifier from the declaration kind,
     * and a class is a value declaration — so the build puts it back afterwards.
     * A `build` script that stops running that step ships the defect again, and
     * an artifact-reading case cannot see it on a machine with no artifact.
     */
    it('still runs the step that puts back the type modifier the bundler drops', () => {
        expect(existsSync(join(PACKAGE, 'scripts', 'mark-type-only-exports.mjs'))).toBe(true);
        expect(packageJson.scripts.build).toContain(MARKER);
    });

    if (artifacts.length === 0) {
        it.skip('over the artifacts in dist/ — there are none', () => undefined);
        return;
    }

    describe.each(artifacts)('over dist/$declaration', ({
        declaration, moduleFile, shipped, shippedNames, exported, declared,
    }) => {
        it('was parsed, so the cases below are asserting against something', () => {
            expect(shipped.length).toBeGreaterThan(50);
            expect(exported.size).toBeGreaterThan(20);
            expect(declared.length).toBeGreaterThanOrEqual(shipped.length);
            expect(shippedNames.has('OIMChannelService')).toBe(true);
            expect(meantAsType.size).toBeGreaterThan(20);
        });

        /**
         * THE ONE THAT WAS FALSE. A specifier without `type` promises a value,
         * and a declaration promising a value its module has not got is a lie the
         * compiler repeats: the import type-checks and the module fails to link.
         */
        it(`promises no value that dist/${moduleFile} does not export`, () => {
            const lying = shipped
                .filter(specifier => !specifier.isType && !exported.has(specifier.name))
                .map(specifier => `${specifier.name} — dist/${declaration} exports it as a VALUE, `
                    + `dist/${moduleFile} does not export it at all`);
            expect(lying).toEqual([]);
        });

        /** The other half of the same rule, read from the barrel's intent. */
        it('marks as a type every name src/index.ts exports as one', () => {
            const unmarked = shipped
                .filter(specifier => !specifier.isType && meantAsType.has(specifier.name))
                .map(specifier => `${specifier.name} — src/index.ts writes \`export type\`, `
                    + `dist/${declaration} drops the modifier; run ${MARKER}`);
            expect(unmarked).toEqual([]);
        });

        /**
         * A name in a signature that is not in the export list is a name a
         * consumer can read and cannot write. Tree-shaking is what makes this
         * exact: a declaration survives into the bundle only because the public
         * surface reaches it, so the unexported ones ARE the leaks.
         */
        it('exports every name it declares', () => {
            const unreachable = declared
                .filter(name => !shippedNames.has(name))
                .sort()
                .map(name => `${name} — declared in dist/${declaration}, absent from its export list`);
            expect(unreachable).toEqual([]);
        });

        /**
         * `TChain$1`. The bundler flattens every module into one scope and
         * appends `$N` when two files declared the same name; the loser is
         * unexported by construction, so this only ever fires alongside the case
         * above — but it names the CAUSE, which that one cannot.
         */
        it('carries no name the bundler had to disambiguate', () => {
            const collided = declared
                .filter(name => /\$\d+$/.test(name))
                .sort()
                .map(name => `${name} — two source files declare `
                    + `"${name.replace(/\$\d+$/, '')}"; give one of them another name`);
            expect(collided).toEqual([]);
        });
    });
});
