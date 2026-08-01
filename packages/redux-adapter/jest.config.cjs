// One project, not two. The JSX suite declares its own environment with a
// `@jest-environment jsdom` docblock, which is all the split was ever for — and unlike nested
// `projects`, a plain config still carries its preset and transform when the root run loads it.
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    watchman: false,
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts', '**/*.test.tsx'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            { tsconfig: { jsx: 'react-jsx' } },
        ],
    },
    moduleNameMapper: {
        '^react$': '<rootDir>/node_modules/react',
        '^react-dom$': '<rootDir>/node_modules/react-dom',
        '^@oimdb/core$': '<rootDir>/../core/src',
        '^@oimdb/react$': '<rootDir>/../react/src',
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/*.test.ts',
        '!src/**/*.spec.ts',
    ],
};
