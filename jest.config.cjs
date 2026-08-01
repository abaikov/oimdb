// Every package owns a jest config with the right environment (node vs jsdom), the right matcher
// (.ts vs .tsx) and its own module mapping. The root run delegates to them instead of restating a
// generic one: a single root testMatch limited to `.ts` files silently skipped every JSX suite, so
// `npm test` reported green while react — and the JSX suites of redux-adapter and
// persist-integration-tests — never ran at all.
module.exports = {
    projects: ['<rootDir>/packages/*/jest.config.cjs'],

    // Each worker runs ts-jest, which type-checks — that is memory-hungry, and jest's default of
    // (cores - 1) workers is enough to take the whole machine down. Half the cores keeps the run
    // comfortably parallel while leaving the box usable, and recycling a worker once it balloons
    // stops one heavy suite from dragging the rest into swap.
    maxWorkers: '50%',
    workerIdleMemoryLimit: '512MB',
};
