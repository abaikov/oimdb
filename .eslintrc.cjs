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
 * Rules deliberately NOT enabled, with their violation counts — turning any of
 * them on means fixing those first:
 *   @typescript-eslint/explicit-member-accessibility  217
 *   @typescript-eslint/no-non-null-assertion           16  (each needs a real guard, not a mechanical edit)
 *
 *   @typescript-eslint/consistent-type-definitions    192  — and it should stay off.
 *     It rewrites `type X = {…}` to `interface X {…}`, which this repo cannot do
 *     mechanically: the naming rules give types and interfaces DIFFERENT prefixes
 *     (`TOIM…` vs `IOIM…`), and `naming-convention` above enforces both on the
 *     exported surface. So every autofix turns a legal `TOIMFooOptions` into an
 *     interface that then violates the interface rule, and honouring it means
 *     renaming the export — a breaking change to the public API for a purely
 *     cosmetic gain. The two rules are in direct conflict; the naming convention
 *     wins.
 */
module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    plugins: ['@typescript-eslint', 'react-hooks'],
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
        // A value import meant as `import type` shows up only as a number in somebody else's bundle.
        '@typescript-eslint/consistent-type-imports': ['error', {
            prefer: 'type-imports',
            fixStyle: 'separate-type-imports',
        }],

        // A duplicated key in an object literal is silent: the last one wins and the earlier
        // implementation is dead code that still reads as live. The TS preset switches this off
        // (the compiler flags it in some positions, not all), and a benchmark adapter assembled by
        // editing blocks hit exactly the gap — several scenarios ran a stale shadowed version.
        'no-dupe-keys': 'error',

        // A component-owned computed whose options close over a prop missing from `deps` keeps
        // showing the old value with no error anywhere; only the call site can see that.
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': ['error', {
            additionalHooks: '^(useOIMSingleComputedValue|useOIMComputedCollection)$',
        }],

        // A private field or method nobody reads is dead weight that still reads
        // as live — and `@typescript-eslint/no-unused-vars` does not look inside
        // classes, so nothing else catches it. Refactors that move logic between
        // classes leave exactly this behind.
        'no-unused-private-class-members': 'error',

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
        // House rule: no `any`. Use `unknown`, a generic, or a discriminated union.
        '@typescript-eslint/no-explicit-any': 'error',
        eqeqeq: ['error', 'smart'],
        'prefer-const': 'error',
        'no-var': 'error',
        // Reassigning a parameter gives one name two meanings — the argument the
        // caller passed and the local working value — and the original is then
        // unrecoverable further down. `props: true` is deliberately NOT set: the
        // redux adapter and the persist strategies build their result by writing
        // into a draft/accumulator handed in as a parameter, which is the whole
        // point of those functions.
        'no-param-reassign': 'error',
        'no-else-return': ['error', { allowElseIf: false }],
        'no-lonely-if': 'error',
        'no-useless-rename': 'error',
        // `!!x` / `+x` / `'' + x` hide a type conversion in punctuation. Spell
        // the conversion out — `Boolean(x)`, `Number(x)`, `String(x)` — so the
        // reader sees which coercion is intended. Note `Boolean(x) && x.y` does
        // NOT narrow `x` the way `!!x && x.y` does; at those sites write the
        // explicit `x !== undefined` instead of reaching for `Boolean`.
        'no-implicit-coercion': 'error',
        'prefer-template': 'error',
        // An empty body is either an unfinished stub or a deliberate no-op, and
        // the two look identical. A real no-op keeps its body and takes an
        // `eslint-disable-next-line` naming why doing nothing is correct.
        'no-empty-function': 'off',
        '@typescript-eslint/no-empty-function': 'error',

        // --- a published library must not print ---
        // `console.warn` / `console.error` stay allowed for genuine diagnostics.
        'no-console': ['error', { allow: ['warn', 'error'] }],

        // --- house style ---
        '@typescript-eslint/no-inferrable-types': 'error',
        'object-shorthand': ['error', 'always'],
        // `curly` is deliberately NOT enabled. The codebase uses brace-less
        // `if (cond) return;` throughout, and with a condition wrapped across
        // lines the rule's fixer emits `{return;}` on its own line — worse than
        // what it replaces, for zero correctness gain.

        /**
         * The prefix system, enforced on the PUBLIC surface only
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
             * House rule: "Style rules do NOT apply to tests, scripts, or bench
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
