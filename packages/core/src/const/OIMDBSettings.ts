/**
 * Static class containing OIMDB settings and constants.
 * Provides access to configuration values used throughout the library.
 */
export class OIMDBSettings {
    /**
     * Fixed key used in the manual index to store updated keys set in coalescers.
     * This constant is exported so users can create their own indexes and pass them to coalescers.
     */
    public static readonly UPDATED_KEYS_INDEX_KEY = '__updatedKeys__' as const;
}
