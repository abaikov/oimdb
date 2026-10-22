/**
 * ONE MODULE OF `@oimdb/core` THAT SURVIVED INTO A BUNDLE, AND WHAT IT COST
 * THERE. A PAIR AND NOT A NAME, because a list of names answers only "did the
 * bundler keep this", the one bit the reachability test already owns.
 *
 * THE BYTES ARE `bytesInOutput` FROM esbuild's metafile, not a file size: what
 * this module contributed to THIS bundle after tree-shaking and minification. So
 * the same module reads differently in two arms — an arm that reaches half its
 * exports carries half its bytes — and that is intended. A module shaken out
 * entirely never appears here at all: see the filter in `measureBundleArms.ts`.
 */
export type TBundleRetainedModule = {
    /** Repository-relative, so the artifact names a file a reader can open. */
    readonly module: string;
    /** Bytes this module contributed to the minified bundle of its arm. */
    readonly bytes: number;
};
