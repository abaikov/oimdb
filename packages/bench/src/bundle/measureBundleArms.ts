import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/**
 * esbuild is NOT declared in this package's own `package.json`: a dependency
 * added to a manifest without regenerating the lockfile makes `npm ci` refuse,
 * which is what CI runs, so the line and the install belong in the same commit.
 * Until then this import resolves through hoisting — `tsup` is a devDependency
 * of the root and of `@oimdb/core` and bundles with esbuild — and the version it
 * resolves to is recorded in every artifact.
 */
/**
 * WHERE THE BUNDLER COMES FROM. esbuild is already pinned in
 * `package-lock.json` — `tsup` is a devDependency of the root and of
 * `@oimdb/core` and bundles with it, so the tool that produces this package's
 * published `dist` is the one measuring it here.
 *
 * It is NOT declared in this package's own `package.json`: a dependency added to
 * a manifest without regenerating the lockfile makes `npm ci` refuse, which is
 * what CI runs, so the line and the install belong in the same commit. Until
 * then this import resolves through hoisting, and the version it resolves to is
 * recorded in every artifact.
 */
/**
 * WHERE THE BUNDLER COMES FROM, because a harness that needs a network install
 * to attest a claim is a harness nobody will run.
 *
 * esbuild is already in this repository's dependency tree and already pinned in
 * `package-lock.json`: `tsup` is a devDependency of the root and of
 * `@oimdb/core`, and esbuild is what tsup bundles with — so the very tool that
 * produces this package's published `dist` is the one measuring it here. A fresh
 * `npm ci` resolves it at the locked version with nothing extra fetched.
 *
 * It is NOT declared in this package's own `package.json`, and that is a
 * deliberate omission with a cost. Declaring it would be the honest thing and
 * takes one line — but a dependency added to a manifest without regenerating the
 * lockfile makes `npm ci` refuse, which is what CI runs, so the line and the
 * install belong in the same commit. Until then this import resolves through
 * hoisting, and the version it resolves to is recorded in every artifact.
 */
import { build, version as esbuildVersion } from 'esbuild';

import { createExcisionPlugin } from './createExcisionPlugin';
import type { TBundleArm } from './TBundleArm';
import type { TBundleExcision } from './TBundleExcision';
import type { TBundleReading } from './TBundleReading';
import type { TBundleRetainedModule } from './TBundleRetainedModule';
import type { TBundleRun } from './TBundleRun';

const here = dirname(fileURLToPath(import.meta.url));
/** `src/bundle` → `src` → `packages/bench` → `packages` → the repository. */
const ROOT = resolve(here, '..', '..', '..', '..');
const CORE_SRC = join(ROOT, 'packages', 'core', 'src');

/**
 * THE SETTINGS, IN ONE PLACE, BECAUSE EVERY ONE OF THEM MOVES THE NUMBER.
 *
 * `es2020` and not `esnext`, whose default follows whatever esbuild currently
 * thinks modern is: a run six months from now would downlevel differently and
 * the difference would land in the artifact as if the engine had changed. Level
 * 9 for gzip, which is what the bundle-size tools a reader might check us
 * against use.
 */
const TARGET = 'es2020';
const GZIP_LEVEL = 9;

/**
 * ONE BUNDLE, IN MEMORY, WRITTEN NOWHERE. `write: false` because a harness that
 * emitted files would need a temporary directory inside the repository —
 * something that survives a crash and gets committed by accident. `metafile` so
 * the run can report WHICH modules it kept and what each cost.
 */
const bundleOnce = async (
    file: string,
    minify: boolean,
    excision: readonly TBundleExcision[] | undefined,
): Promise<{
    bytes: number;
    gzipBytes: number;
    retained: readonly TBundleRetainedModule[];
}> => {
    const result = await build({
        entryPoints: [file],
        bundle: true,
        write: false,
        metafile: true,
        format: 'esm',
        platform: 'browser',
        target: TARGET,
        minify,
        treeShaking: true,
        /**
         * THE ENGINE THIS ARM IS BUILT AGAINST, WHICH IS NORMALLY THE ONE ON
         * DISK. An arm carrying an excision is handed the same files with named
         * fields and call sites taken out in memory — see `TBundleArm.excision`
         * for the one question that cannot be asked any other way, and
         * `createExcisionPlugin.ts` for why every rule is applied and counted
         * before a byte is bundled.
         */
        plugins: excision === undefined ? [] : [createExcisionPlugin(CORE_SRC, excision)],
        // A `@license` banner survives minification by default and would be
        // counted as engine bytes. There are none in this package today, so this
        // is here to keep the number stable the day somebody adds one.
        legalComments: 'none',
        sourcemap: false,
        logLevel: 'silent',
    });

    const output = result.outputFiles?.[0];
    if (output === undefined) {
        throw new Error(`bundle: esbuild produced no output for ${file}`);
    }

    // WHAT SURVIVED, NOT WHAT WAS PARSED. `outputs[…].inputs[…].bytesInOutput`
    // is the retained set, per module, in bytes contributed; a module shaken out
    // is absent or contributes zero, so one field answers WHICH and HOW MUCH.
    //
    // NOT `metafile.inputs`, which is the INPUT GRAPH — every file esbuild
    // opened, including every module it then dropped. Reading that made all four
    // arms report the same 61 modules and the same "diffOrderedList IS among
    // them" while their bundles differed by a factor of four, and contradicted
    // `packages/core/tests/what-an-import-retains.test.ts`. Two instruments
    // disagreeing meant one was wrong, and it was this one.
    const outputs = result.metafile?.outputs ?? {};
    const contributions = Object.values(outputs)[0]?.inputs ?? {};
    const retained: TBundleRetainedModule[] = [];
    for (const [input, contribution] of Object.entries(contributions)) {
        const path = resolve(process.cwd(), input);
        if (!path.startsWith(CORE_SRC)) continue;
        if (contribution.bytesInOutput <= 0) continue;
        retained.push({ module: relative(ROOT, path), bytes: contribution.bytesInOutput });
    }
    retained.sort((a, b) => b.bytes - a.bytes || a.module.localeCompare(b.module));

    return {
        bytes: output.contents.byteLength,
        gzipBytes: gzipSync(output.contents, { level: GZIP_LEVEL }).byteLength,
        retained,
    };
};

/** Bytes and files of the engine as it stands, so a moved number can be attributed. */
const sourceStats = (): { sourceBytes: number; sourceFiles: number } => {
    let sourceBytes = 0;
    let sourceFiles = 0;
    const walk = (at: string): void => {
        for (const entry of readdirSync(at, { withFileTypes: true })) {
            const path = join(at, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (path.endsWith('.ts')) {
                sourceBytes += readFileSync(path).byteLength;
                sourceFiles += 1;
            }
        }
    };
    walk(CORE_SRC);
    return { sourceBytes, sourceFiles };
};

/**
 * EVERY ARM, TWICE — minified and not. The unminified pass IS the minification
 * control, and a control not measured in the same run under the same settings as
 * the thing it attests is not a control.
 *
 * Sequentially, not for accuracy — bytes do not care — but so a failure in one
 * arm names that arm on a clean terminal.
 */
export const measureBundleArms = async (arms: readonly TBundleArm[]): Promise<TBundleRun> => {
    const readings: TBundleReading[] = [];

    for (const arm of arms) {
        const minified = await bundleOnce(arm.file, true, arm.excision);
        const bundled = await bundleOnce(arm.file, false, arm.excision);
        readings.push({
            id: arm.id,
            file: relative(ROOT, arm.file),
            what: arm.what,
            /**
             * FLATTENED INTO SENTENCES HERE, so `records.json` carries the
             * excision in the same file as the bytes it produced: every line
             * names a module and a thing taken out of it, and nothing else was.
             */
            excised: arm.excision?.flatMap(
                one => one.rules.map(rule => `${one.module} — ${rule.what} (×${rule.times})`),
            ),
            minifiedBytes: minified.bytes,
            minifiedGzipBytes: minified.gzipBytes,
            bundledBytes: bundled.bytes,
            bundledGzipBytes: bundled.gzipBytes,
            /**
             * THE BREAKDOWN KEPT IS THE MINIFIED PASS'S: a decomposition has to
             * sum toward the total printed next to it. The unminified pass
             * counts comments, which this package has about as many bytes of as
             * code, so a module's share of it would largely be its share of
             * PROSE. That pass is not wrong — its TOTAL is the minification
             * control — but a per-module version of it has no use.
             */
            retained: minified.retained,
        });
    }

    return {
        readings,
        toolchain: {
            bundler: 'esbuild',
            bundlerVersion: esbuildVersion,
            format: 'esm',
            platform: 'browser',
            target: TARGET,
            minifier: `esbuild ${esbuildVersion}`,
            gzipLevel: GZIP_LEVEL,
            node: process.version,
            ...sourceStats(),
        },
    };
};
