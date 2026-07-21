/**
 * Minimal readable-bindable shape the bridge accepts as a reactive input. Any Exodra bindable
 * satisfies it regardless of its event type — the bridge ignores the emitted event and re-reads via
 * `getValue()`, so accepting `subscribe(update: () => void)` decouples inputs from Exodra's
 * `TExoBindable<TValue, TEvent>` event generic (a `TExoWritableBindable<string, string>` key would
 * not be assignable to `TExoBindable<string>` because their event types differ).
 */
export type TOIMExodraReadable<TValue> = {
    getValue(): TValue;
    subscribe(update: () => void): () => void;
};
