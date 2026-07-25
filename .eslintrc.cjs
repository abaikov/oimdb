/**
 * Strict lint for the whole monorepo.
 *
 * The invariant: this config is GREEN on the current tree. Every rule below is
 * either already satisfied everywhere or has its pre-existing violations pinned
 * with a local `eslint-disable` carrying a reason. That is what makes the linter
 * useful as a gate — a fresh error means new code drifted, not that the baseline
 * is noisy. Do not silence a rule repo-wide to make new code pass; fix the code
 * or pin the one line with a reason.
 *
 * Rules deliberately NOT enabled yet, with today's violation counts — turning any
 * of them on means fixing those first:
 *   @typescript-eslint/consistent-type-imports        782  (fully `--fix`-able)
 *   @typescript-eslint/explicit-member-accessibility  217
 *   @typescript-eslint/no-non-null-assertion           16  (each needs a real guard, not a mechanical edit)
 */
module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    plugins: ['@typescript-eslint'],
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
    },
    env: {
        node: true,
        browser: true,
        es2022: true,
    },
    ignorePatterns: [
        'dist/',
        'build/',
        'coverage/',
        'node_modules/',
        'website/',
        // Plain-JS Chrome extension, not part of the TS build.
        'packages/browser-extension/',
        '*.cjs',
        '*.mjs',
        '*.js',
    ],
    rules: {
        // --- correctness / no dead weight ---
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': [
            'error',
            {
                // `_name` marks a binding kept for signature shape (a mapper that
                // ignores its current state) — deliberate, not forgotten.
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            },
        ],
        // CLAUDE.md: no `any`. Use `unknown`, a generic, or a discriminated union.
        '@typescript-eslint/no-explicit-any': 'error',
        eqeqeq: ['error', 'smart'],
        'prefer-const': 'error',
        'no-var': 'error',

        // --- a published library must not print ---
        // `console.warn` / `console.error` stay allowed for genuine diagnostics.
        'no-console': ['error', { allow: ['warn', 'error'] }],

        // --- house style ---
        '@typescript-eslint/no-inferrable-types': 'error',
        // `curly` is deliberately NOT enabled. The codebase uses brace-less
        // `if (cond) return;` throughout, and with a condition wrapped across
        // lines the rule's fixer emits `{return;}` on its own line — worse than
        // what it replaces, for zero correctness gain.

        /**
         * CLAUDE.md prefix system, enforced on the PUBLIC surface only
         * (`modifiers: ['exported']`): class `OIM`, interface `IOIM`,
         * type `TOIM`, enum `EOIM`. Function-local aliases (`type TKey = …`)
         * are unaffected — the convention is about module exports.
         */
        '@typescript-eslint/naming-convention': [
            'error',
            {
                selector: 'class',
                modifiers: ['exported'],
                format: ['PascalCase'],
                custom: { regex: '^OIM', match: true },
            },
            {
                selector: 'interface',
                modifiers: ['exported'],
                format: ['PascalCase'],
                custom: { regex: '^IOIM', match: true },
            },
            {
                selector: 'typeAlias',
                modifiers: ['exported'],
                format: ['PascalCase'],
                custom: { regex: '^TOIM', match: true },
            },
            {
                selector: 'enum',
                modifiers: ['exported'],
                format: ['PascalCase'],
                custom: { regex: '^EOIM', match: true },
            },
        ],
    },
    overrides: [
        {
            /**
             * CLAUDE.md: "Style rules do NOT apply to tests, scripts, or bench
             * files." Correctness rules still do — only the conventions that exist
             * to keep the published surface coherent are lifted.
             */
            files: [
                '**/tests/**/*.{ts,tsx}',
                '**/bench/**/*.{ts,tsx}',
                '**/scripts/**/*.{ts,tsx}',
                '**/examples/**/*.{ts,tsx}',
                '**/*.test.{ts,tsx}',
                '**/*.spec.{ts,tsx}',
                '**/*.bench.{ts,tsx}',
            ],
            rules: {
                '@typescript-eslint/no-explicit-any': 'off',
                '@typescript-eslint/naming-convention': 'off',
                'no-console': 'off',
                '@typescript-eslint/no-var-requires': 'off',
            },
        },
    ],
};
