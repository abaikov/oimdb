/**
 * HOW MANY TIMES A RETENTION IS PAID — the column without which a byte count
 * means nothing. 16 KiB held once per process is a rounding error, 16 KiB held
 * per row is a budget. Ordered cheapest multiplier first.
 */
export enum ERetainedPath {
    /** Held once for the life of the process, whatever the application does. */
    PerProcess = 'per process',
    /**
     * Held once per DERIVATION — one per key a consumer reads, and never one per
     * row. It sits here because a screen holds derivations for the keys it shows
     * and rows for everything behind them, so K is a count of what is being looked
     * at where the multiplier below is a count of what is stored.
     */
    PerDerivation = 'per derivation',
    /** Held for every row in the population. The most expensive multiplier here. */
    PerRow = 'per row',
}
