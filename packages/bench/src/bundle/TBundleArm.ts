import type { TBundleExcision } from './TBundleExcision';

/**
 * ONE APPLICATION, WRITTEN OUT AS A REAL MODULE. `file` is a path and never a
 * body: source in a template literal is not type-checked and the bundler does
 * not type-check either, so a held-in-source arm would go on measuring happily
 * after the API it names had been renamed. The arms are files under `consumers/`
 * inside this package's `tsconfig`, so `npm run type-check` fails the day one
 * stops being a real application.
 */
export type TBundleArm = {
    /** Printed in the table; also the key every finding names its sides by. */
    readonly id: string;
    readonly file: string;
    /** One line, printed under the arm in the report. What application this is. */
    readonly what: string;
    /**
     * WHAT THIS ARM TOOK OUT OF THE ENGINE BEFORE BUNDLING IT — absent on every
     * arm that measures `packages/core/src` as it stands. In memory, for the
     * length of one build, never on disk; the consumer module is shared with the
     * arm's pair byte for byte. Why an engine-editing instrument exists at all is
     * in `TBundleExcisionRule.ts`.
     *
     * AN ARM THAT CARRIES THIS IS A COUNTERFACTUAL AND MUST SAY SO WHEREVER IT
     * IS QUOTED. Its bundle is not one anybody can produce from a published
     * `@oimdb/core`, and the difference it measures is a bound rather than a
     * reading — which direction is the piece's to state, from what its excision
     * deliberately leaves in.
     */
    readonly excision?: readonly TBundleExcision[];
};
