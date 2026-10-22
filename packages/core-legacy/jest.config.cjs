module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    watchman: false,
    roots: ['<rootDir>/tests'],
    coveragePathIgnorePatterns: ['<rootDir>/src/'],
    testMatch: ['**/*.test.ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/*.test.ts',
        '!src/**/*.spec.ts',
    ],
    moduleFileExtensions: ['ts', 'js', 'json'],
};

