/**
 * HOW OFTEN A PRICE IS PAID — the column without which a ratio means nothing.
 * A charge on a once-per-startup path and one on a per-row-per-frame path are
 * not comparable, so every row carries its path and the report prints it beside
 * the ratio.
 *
 * Ordered rarest to hottest — the order a reader should discount them in.
 */
export enum EPricePath {
    /** Once per application, screen or module. Startup, not steady state. */
    PerDeclaration = 'per declaration',
    /** Once when a reader and a piece of data are joined — a mount, a resolve. */
    PerRelationship = 'per relationship',
    /** Once per frame, however many rows moved in it. */
    PerFrame = 'per frame',
    /** Once per call a consumer makes to change something. */
    PerWrite = 'per write',
    /** Once for every row a write touches. The hottest path there is. */
    PerRowPerWrite = 'per row per write',
    /** Once for every value a reader takes out. */
    PerRead = 'per read',
}
