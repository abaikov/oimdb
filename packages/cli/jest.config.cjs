module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    watchman: false,
    roots: ['<rootDir>/tests', '<rootDir>/src'],
    testMatch: ['**/*.test.ts'],
    // Same reason the sibling packages give: ts-jest type-checks by default and
    // would build a full program per worker. Types are checked by the build and
    // by `type-check`, not once per jest worker.
    transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { isolatedModules: true } }] },
};
