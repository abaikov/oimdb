module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    watchman: false,
    roots: ['<rootDir>/tests', '<rootDir>/src'],
    testMatch: ['**/*.test.ts'],
    collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/*.test.ts', '!src/**/*.type-test.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    // A GREEN RUN OF THIS CONFIG SAYS NOTHING ABOUT TYPES, and that is not a
    // hedge — it is the literal contract of the line below. `isolatedModules`
    // makes ts-jest TRANSPILE each file on its own: no program, no language
    // service, no checker. Every assignability error in `tests/` is invisible
    // here and always has been.
    //
    // WHY IT IS STILL ON. ts-jest's default is to check, and every package maps
    // `@oimdb/core` to `../core/src` — so each worker built a full TypeScript
    // program over the whole core tree to run assertions that take microseconds,
    // and the react suite alone peaked at 233 MB of heap against 118 MB
    // transpiling. Worse, it is not even the checker you want: a worker only
    // ever sees the files its own suites import, so a type error in a file no
    // suite reaches stays invisible either way. Paying 2x the memory for a
    // partial answer is the trade this line refuses.
    //
    // WHAT DOES CHECK THEM, and it is one command over one program:
    //
    //     npm run type-check          # tsc --noEmit -p tsconfig.all.json
    //
    // `tsconfig.all.json` is the tests gate: it includes `src/**/*`,
    // `tests/**/*` and `scripts/**/*.ts` in a single program under the root
    // `strict`. CI runs it BEFORE the tests (.github/workflows/ci.yml) so a type
    // error is reported as one. The build does NOT stand in for it — `tsup
    // src/index.ts --dts` starts at the entry point and never reaches `tests/`.
    transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { isolatedModules: true } }] },
};
