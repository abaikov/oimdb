/**
 * @deprecated This package has been split into separate packages.
 * Please use @oimdb/core and @oimdb/react instead.
 *
 * Migration guide:
 * - Core functionality: npm install @oimdb/core
 * - React integration: npm install @oimdb/react @oimdb/core
 *
 * See: https://github.com/abaikov/oimdb#readme
 */

function showDeprecationWarning() {
    console.warn(
        '⚠️  DEPRECATED: The "oimdb" package has been split into separate packages.\n' +
            '📦 Core functionality: npm install @oimdb/core\n' +
            '⚛️  React integration: npm install @oimdb/react @oimdb/core\n' +
            '📖 Migration guide: https://github.com/abaikov/oimdb#readme'
    );
}

// Show warning when imported
showDeprecationWarning();

// Re-export everything from @oimdb/core for compatibility
export * from '@oimdb/core';

// Default export with deprecation warning
export default {
    __deprecated: true,
    __message: 'This package has been split into @oimdb/core and @oimdb/react',
    showDeprecationWarning,
};
