import type { TBundleExcisionRule } from './TBundleExcisionRule';

/**
 * EVERYTHING ONE MODULE OF THE ENGINE LOSES, IN ONE OBJECT.
 *
 * The module is resolved EAGERLY, before any bundle is built: a spec naming a
 * module that has moved fails at startup rather than half way through an arm,
 * and — the half that matters — a rule whose module the bundler would never have
 * loaded still has its count asserted. A rule that silently never ran is an
 * excision nobody performed, backing a number somebody would quote.
 */
export type TBundleExcision = {
    /** Path under `packages/core/src`, e.g. `abstract/OIMCollection.ts`. */
    readonly module: string;
    /**
     * Applied in order, and the order is load-bearing where a call site sits
     * inside a row that is also going: the row rules come first, so the
     * statement counts below them are counts of what is LEFT, which is what a
     * reader of the rule can check against the file.
     */
    readonly rules: readonly TBundleExcisionRule[];
};
