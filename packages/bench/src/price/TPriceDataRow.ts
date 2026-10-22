/**
 * The row every priced pair moves around — five columns, all scalars.
 *
 * Deliberately NOT the scenario benchmark's `TRow`, which changes for reasons a
 * price does not care about. What a price needs is that both sides of a pair
 * store the SAME columns, so a floor writing four fields is never compared
 * against a call writing five.
 */
export type TPriceDataRow = {
    id: string;
    group: string;
    rank: number;
    title: string;
    note: string;
};
