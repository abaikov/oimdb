module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    watchman: false,
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    passWithNoTests: true,
    moduleNameMapper: {
        '^@oimdb/core$': '<rootDir>/../core/src',
    },
    collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/index.ts'],
};
