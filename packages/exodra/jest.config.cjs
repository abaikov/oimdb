module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    watchman: false,
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    moduleNameMapper: { '^@oimdb/core$': '<rootDir>/../core/src' },
    collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
    transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { isolatedModules: true } }] },
};
