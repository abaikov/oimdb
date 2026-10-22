module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    watchman: false,
    setupFiles: ['<rootDir>/jest.setup.cjs'],
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts', '**/*.test.tsx'],
    moduleNameMapper: {
        '^@oimdb/core$': '<rootDir>/../core/src',
        '^@oimdb/persist$': '<rootDir>/../persist/src',
        '^@oimdb/persist-json$': '<rootDir>/../persist-json/src',
        '^@oimdb/persist-memory$': '<rootDir>/../persist-memory/src',
        '^@oimdb/persist-idb$': '<rootDir>/../persist-idb/src',
    },
    // ts-jest type-checks by default, and every package maps `@oimdb/core` to
    // `../core/src` — so each worker built a full TypeScript program over the
    // whole core tree just to run assertions that take microseconds. Under
    // `isolatedModules` ts-jest transpiles file-by-file instead, with no
    // language service and no program: the compile cost and the memory that
    // came with it disappear. Types are still checked, by `npm run type-check`
    // and by the build — not once per jest worker.
    transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', isolatedModules: true } }] },
};
