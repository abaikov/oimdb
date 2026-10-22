module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    watchman: false,
    roots: ['<rootDir>/tests', '<rootDir>/src'],
    testMatch: ['**/*.test.ts'],
    moduleNameMapper: { '^@oimdb/core$': '<rootDir>/../core/src' },
    collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
    // ts-jest type-checks by default, and every package maps `@oimdb/core` to
    // `../core/src` — so each worker built a full TypeScript program over the
    // whole core tree just to run assertions that take microseconds. Under
    // `isolatedModules` ts-jest transpiles file-by-file instead, with no
    // language service and no program: the compile cost and the memory that
    // came with it disappear. Types are still checked, by `npm run type-check`
    // and by the build — not once per jest worker.
    transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { isolatedModules: true } }] },
};
