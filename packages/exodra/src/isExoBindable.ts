import type { TOIMExodraReadable } from './types/TOIMExodraReadable';

/**
 * Narrow a `TKey | TOIMExodraReadable<TKey>` argument. A readable bindable is an object exposing
 * both `getValue` and `subscribe`; scalar keys (string/number) and composite key paths (arrays)
 * are not.
 */
export function isExoBindable<T>(value: unknown): value is TOIMExodraReadable<T> {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { getValue?: unknown }).getValue === 'function' &&
        typeof (value as { subscribe?: unknown }).subscribe === 'function'
    );
}
