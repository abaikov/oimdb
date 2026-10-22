import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Plugin } from 'esbuild';

import { exciseSource } from './exciseSource';
import type { TBundleExcision } from './TBundleExcision';

/**
 * THE ENGINE, MINUS SOMETHING, HANDED TO ESBUILD IN MEMORY.
 *
 * EVERY RULE IS APPLIED HERE, IN THE FACTORY, BEFORE A BYTE IS BUNDLED — not
 * lazily inside `onLoad`. Lazy application would let a rule for a module the
 * consumer's imports never reach silently never run, and a rule that never ran
 * is an excision nobody performed backing a number somebody would quote. It also
 * makes a spec pointed at a moved module fail at startup, by name.
 *
 * `onLoad` answers with `contents`, so `packages/core/src` is never written to
 * and no temporary copy is made. That is what lets both arms of a pair share ONE
 * consumer module, byte for byte, built in the same process.
 */
export const createExcisionPlugin = (
    coreSrc: string,
    excisions: readonly TBundleExcision[],
): Plugin => {
    const excised = new Map<string, string>();
    for (const excision of excisions) {
        const path = join(coreSrc, excision.module);
        const source = readFileSync(path, 'utf8');
        excised.set(path, exciseSource(source, excision));
    }

    return {
        name: 'oimdb-excision',
        setup(build): void {
            build.onLoad({ filter: /\.ts$/ }, args => {
                const contents = excised.get(args.path);
                if (contents === undefined) return null;
                // Stated rather than left to the default, so the relative
                // imports inside an excised module resolve against the module's
                // own directory and not against wherever the run started.
                return { contents, loader: 'ts' as const, resolveDir: dirname(args.path) };
            });
        },
    };
};
