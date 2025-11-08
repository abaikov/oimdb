module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts', '**/*.test.tsx'],
    passWithNoTests: true,
    moduleNameMapper: {
        '^@oimdb/core$': '<rootDir>/../core/src',
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        'src/**/*.tsx',
        '!src/**/*.d.ts',
        '!src/index.ts',
    ],
};

