import type { TPriceDataRow } from './TPriceDataRow';

/**
 * The population every pair is priced over, and the two constants that shape it.
 *
 * DETERMINISTIC AND ALLOCATION-FREE AT USE TIME. Nothing here is random, so a
 * ratio is comparable against one measured yesterday. Values a timed body writes
 * come out of `titles` rather than being built per write — a `` `title ${i}` ``
 * inside the clock charges every write path for a concatenation and an
 * allocation neither the call nor the floor is responsible for.
 */
export const priceDataset = {
    /**
     * ROWS TOUCHED BETWEEN ONE FLUSH AND THE NEXT.
     *
     * `OIMChannel.writeWithoutFlushCheck` skips a slot's effects when the slot already
     * changed in this frame (`isChangedInCurrentFrame`), so a body writing the same slot twice in one frame would price
     * `update` at what the SECOND call costs. Every write body therefore walks a
     * batch of DISTINCT rows and then flushes.
     *
     * Eight thousand, so the closing flush is one part in eight thousand of the
     * row; `flush.empty-vs-noop` prices that flush directly so a reader can
     * subtract it.
     *
     * A POWER OF TWO, AND NOT COSMETIC. `i % count` is an integer division
     * charged IDENTICALLY to both sides — which is not harmless: the same
     * constant added to numerator and denominator pulls a ratio toward 1,
     * hardest on the cheapest pairs. A power of two makes the wrap
     * `i & (count - 1)`, one instruction.
     */
    batch: 8192,

    /**
     * How many groups the population is spread across — about a hundred and
     * thirty rows per bucket: big enough that iterating one is a real read,
     * small enough that the O(n) parts of a row set change are not the whole
     * row. A power of two for the reason above; the group cycle wraps on a mask.
     */
    groups: 64,

    /**
     * The values a write body rotates through. Eight, so consecutive frames
     * always write a value the store does not already hold — the in-place writer
     * gates each column on `oimSameValueZeroGuard` and the door returns early on a re-send, which is a DIFFERENT price
     * with its own row (`update.unchanged-vs-field-store`).
     */
    titles: [
        'alpha', 'bravo', 'charlie', 'delta',
        'echo', 'foxtrot', 'golf', 'hotel',
    ] as readonly string[],

    /**
     * A population of plain rows. Keys are strings because that is what a server
     * id is, and because a string key makes the `Map` floor pay the hash this
     * measurement is careful to disclose.
     */
    makeRows(count: number): TPriceDataRow[] {
        const rows: TPriceDataRow[] = [];
        for (let i = 0; i < count; i++) {
            rows.push({
                id: `row-${i}`,
                group: `group-${i % priceDataset.groups}`,
                rank: i,
                title: priceDataset.titles[i % priceDataset.titles.length],
                note: 'note',
            });
        }
        return rows;
    },

    /** The group names, in the order `makeRows` files rows into them. */
    groupNames(): string[] {
        const names: string[] = [];
        for (let i = 0; i < priceDataset.groups; i++) names.push(`group-${i}`);
        return names;
    },
};
