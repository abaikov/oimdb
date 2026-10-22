import type { TBundleRetainedModule } from './TBundleRetainedModule';

/**
 * WHAT ONE BUNDLE OF ONE ARM CAME OUT AT.
 *
 * FOUR BYTE COUNTS AND NOT ONE. The two minified counts are the shipped figures
 * and the claim is about them; the two unminified ones are the control — a
 * minifier that silently did nothing reports `minified === bundled`, and every
 * difference below it was then measured over comments and whitespace.
 *
 * `retained` IS THE LINK TO THE OTHER INSTRUMENT: the bundler's own answer to
 * what it KEPT, checkable against
 * `packages/core/tests/what-an-import-retains.test.ts`, which reaches the same
 * answer by reading import statements with no toolchain at all.
 *
 * IT IS RECORDED IN FULL, PER ARM, BECAUSE THE REPORT IS NOT THE ARTIFACT — the
 * terminal copy truncates the long arms and `records.json` does not.
 */
export type TBundleReading = {
    readonly id: string;
    /** Repository-relative, so the artifact names a file a reader can open. */
    readonly file: string;
    readonly what: string;

    readonly minifiedBytes: number;
    readonly minifiedGzipBytes: number;
    /** The identical bundle with the minifier off. Control, not a shipped figure. */
    readonly bundledBytes: number;
    readonly bundledGzipBytes: number;

    /**
     * Every module of `@oimdb/core` the bundler kept for this arm, with the
     * bytes each contributed, sorted largest first. Unrounded and complete on
     * purpose: this is what somebody disputing a byte count reads first, because
     * a total can only be argued about and a decomposition can be checked.
     *
     * From the MINIFIED pass, so these bytes are of the same output the
     * `minifiedBytes` above measures — see `measureBundleArms.ts` for why the
     * unminified pass's breakdown is not the one worth keeping.
     */
    readonly retained: readonly TBundleRetainedModule[];

    /**
     * WHAT WAS TAKEN OUT OF THE ENGINE BEFORE THIS ARM WAS BUILT — absent on
     * every arm that measures `packages/core/src` as it stands.
     *
     * One line per rule, naming the module and the row or call site it
     * removed. It is here rather than only in the source of the excision because
     * an artifact has to be checkable on its own: a counterfactual bundle whose
     * counterfactual is described in a file the reader does not have is a byte
     * count with a story attached, and this repository has been burnt by exactly
     * that. An arm with this field is NOT a bundle anybody can produce from a
     * published `@oimdb/core`, and any figure quoted from it says so.
     */
    readonly excised?: readonly string[];
};
