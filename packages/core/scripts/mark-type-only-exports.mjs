/**
 * Puts back the `type` modifier the dts bundler drops, on the export list EVERY
 * declaration file in `dist/` ends with. Runs after `tsup --dts`, in
 * `npm run build`.
 *
 * ONE PER FORMAT, ALL WITH THE SAME DEFECT: `--format esm,cjs` emits
 * `index.d.ts` and `index.d.cts`, both from the same bundler pass, so fixing a
 * named one leaves the other lying. Nothing here is pinned to a filename.
 *
 * ─── THE BUG THIS EXISTS FOR ──────────────────────────────────────────────
 *
 * `src/index.ts` writes `export type { OIMEffect }`, and says on the lines above
 * it why the CONSTRUCTOR must not leave this package. The built artifact said
 * the opposite: `dist/index.d.ts` listed `OIMEffect` with no `type` modifier,
 * where all 31 other type exports carried one, and `dist/index.js` did not
 * export it at all. So
 *
 *     import { OIMEffect } from '@oimdb/core';
 *     new OIMEffect(...)
 *
 * type-checked and then failed at run time — under a bundler as `OIMEffect is
 * not a constructor`, under plain ESM as a link error naming a missing export.
 *
 * ─── THE CAUSE IS THE BUNDLER, AND IT IS ONE LINE ─────────────────────────
 *
 * rollup-plugin-dts 6.1.1, vendored inside tsup 8.5.0 as
 * `node_modules/tsup/dist/rollup.js`, decides each specifier's kind at line
 * 6069:
 *
 *     const kind = types.some(node => node.getText() === localName)
 *               && !values.some(node => node.getText() === localName)
 *                  ? "type" : "value";
 *
 * `types` is filled from interface and type-alias declarations only; `values`
 * from enums, functions, CLASSES and variables. Rollup's module graph has no
 * type-only concept, so by the time this runs the `export type` in the source
 * is gone and the kind is re-derived from the declaration alone. A class is a
 * value declaration, therefore `export type { SomeClass }` is not expressible
 * through this build — for any class, not just this one.
 *
 * ─── WHY NOT FIX IT IN THE SOURCE ─────────────────────────────────────────
 *
 * Every source-side spelling needs the exported binding to resolve to an
 * interface or a type alias, and `OIMEffect` cannot be one: the class is named
 * by `TOIMSlot.effects`, `OIMChannel.effect` and `OIMChannel.effectOnColumn`,
 * all exported, so its declaration is in the bundle and must be exported under
 * its own name or become the next unnameable type. An alias of the same name
 * collides with it and makes the bundler rename one of the two to `OIMEffect$1`
 * — trading this defect for the `TChain$1` one. A different name is a rename of
 * a public symbol to work around a bundler.
 *
 * ─── WHAT IT DOES ─────────────────────────────────────────────────────────
 *
 * Reads the type-only exports out of `src/index.ts` with the TypeScript parser —
 * derived, never pinned, so it cannot drift from the barrel — and rewrites the
 * final `export { … };` of each declaration file so every one of those names
 * carries `type`. It touches nothing else and is idempotent.
 *
 * It does NOT check that the value exports are real; that is
 * `tests/everything-the-built-package-declares-can-be-imported.test.ts`, which
 * reads the artifact this produced and fails if any of this stopped happening.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'src', 'index.ts');
const dist = join(root, 'dist');

const die = message => { console.error(`mark-type-only-exports: ${message}`); process.exit(1); };

/** `.d.ts`, `.d.cts`, `.d.mts` — whatever formats the build was asked for. */
const declarations = existsSync(dist)
    ? readdirSync(dist).filter(name => /\.d\.[cm]?ts$/.test(name)).sort()
    : [];
if (declarations.length === 0) die(`${dist} holds no declaration file — run the build first.`);

/**
 * Every name `src/index.ts` exports as a type: `export type { A, B as C }`, and
 * a `type` specifier inside a value export list (`export { A, type B }`).
 */
const typeOnly = new Set();
const source = ts.createSourceFile(entry, readFileSync(entry, 'utf8'), ts.ScriptTarget.Latest, true);
for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    const clause = statement.exportClause;
    if (clause === undefined || !ts.isNamedExports(clause)) continue;
    for (const specifier of clause.elements) {
        if (statement.isTypeOnly || specifier.isTypeOnly) typeOnly.add(specifier.name.text);
    }
}
if (typeOnly.size === 0) die(`${entry} declares no type-only export — the parse is wrong.`);

for (const name of declarations) {
    const built = join(dist, name);
    const text = readFileSync(built, 'utf8');
    // The bundler emits exactly one, last, on one line.
    const statements = [...text.matchAll(/^export \{([^\n]*?)\};$/gm)];
    if (statements.length !== 1) die(`expected one export statement in ${built}, found ${statements.length}.`);

    const [whole, list] = statements[0];
    const seen = new Set();
    const marked = [];
    const rewritten = list.split(',').map(raw => {
        const specifier = raw.trim();
        if (specifier === '') return raw;
        const exported = specifier.replace(/^type /, '').split(' as ').pop().trim();
        seen.add(exported);
        if (!typeOnly.has(exported) || specifier.startsWith('type ')) return raw;
        marked.push(exported);
        return raw.replace(specifier, () => `type ${specifier}`);
    }).join(',');

    const absent = [...typeOnly].filter(exported => !seen.has(exported)).sort();
    if (absent.length > 0) {
        die(`${built} exports none of: ${absent.join(', ')} — the barrel and the build disagree.`);
    }

    if (marked.length === 0) {
        console.log(`type-only exports: ${name} already honest, nothing to mark`);
    } else {
        writeFileSync(built, text.replace(whole, () => `export {${rewritten}};`));
        console.log(`type-only exports: ${name} marked ${marked.length} — ${marked.join(', ')}`);
    }
}
