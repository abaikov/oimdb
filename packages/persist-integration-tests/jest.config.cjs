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
        '^@oimdb/persist-idb$': '<rootDir>/../persist-idb/src',
        '^@oimdb/react$': '<rootDir>/../react/src',
    },
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                tsconfig: '<rootDir>/tsconfig.json',
            },
        ],
    },
};
