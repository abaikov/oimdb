/**
 * Minimal subset of the Web Storage API used by the localStorage backend.
 *
 * Matches the shape of `globalThis.localStorage`, but is narrowed to the three
 * operations actually used so that custom in-memory mocks can be supplied.
 */
export type TOIMLocalStorageLike = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
};
