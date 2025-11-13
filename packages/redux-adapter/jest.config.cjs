module.exports = {
    roots: ['<rootDir>/tests'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/*.test.ts',
        '!src/**/*.spec.ts',
    ],
    projects: [
        {
            displayName: 'node',
            preset: 'ts-jest',
            testEnvironment: 'node',
            testMatch: ['**/*.test.ts'],
            roots: ['<rootDir>/tests'],
            moduleFileExtensions: ['ts', 'js', 'json'],
        },
        {
            displayName: 'jsdom',
            preset: 'ts-jest',
            testEnvironment: 'jsdom',
            testMatch: ['**/*.test.tsx'],
            roots: ['<rootDir>/tests'],
            moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
            transform: {
                '^.+\\.tsx?$': [
                    'ts-jest',
                    {
                        tsconfig: {
                            jsx: 'react-jsx',
                        },
                    },
                ],
            },
            moduleNameMapper: {
                '^react$': '<rootDir>/node_modules/react',
                '^react-dom$': '<rootDir>/node_modules/react-dom',
                '^@oimdb/core$': '<rootDir>/../core/src',
                '^@oimdb/react$': '<rootDir>/../react/src',
            },
        },
    ],
};

