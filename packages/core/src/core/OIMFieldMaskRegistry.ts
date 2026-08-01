/**
 * Assigns each entity field a bit, so "which fields changed" is one number
 * instead of a set of strings.
 *
 * A mask is what makes field tracking affordable: recording a write is an OR,
 * asking "did any field I depend on change" is an AND, and the whole record for
 * one key is a machine word rather than an allocated `Set`. Measured against a
 * `Set<string>` on the write path, the mask costs about half.
 *
 * Bits are handed out on first sight and never reused, so a mask taken before a
 * new field appeared stays valid. Field 33 and beyond fall back to
 * {@link ALL_FIELDS}: past 32 bits the mask stops discriminating and every
 * consumer conservatively sees "something changed", which is correct — only
 * less selective. An entity with more than 32 fields is outside what this
 * optimisation targets, and silently narrowing would be a correctness bug.
 */
export const ALL_FIELDS = -1;
export const NO_FIELDS = 0;

/** Number of distinct fields a mask can address before it saturates. */
export const MASK_CAPACITY = 32;

export class OIMFieldMaskRegistry {
    private readonly bitByField = new Map<string, number>();
    private nextBit = 0;

    /**
     * The bit for `field`, assigning one if this is the first time it is seen.
     * Returns {@link ALL_FIELDS} once capacity is exhausted, which makes every
     * subsequent test match rather than silently miss a change.
     */
    public bitOf(field: string): number {
        const existing = this.bitByField.get(field);
        if (existing !== undefined) return existing;
        if (this.nextBit >= MASK_CAPACITY) return ALL_FIELDS;
        const index = this.nextBit++;
        const bit = 1 << index;
        this.bitByField.set(field, bit);
        return bit;
    }

    /** Combined mask for a set of field names — used to declare what a reader depends on. */
    public maskOf(fields: Iterable<string>): number {
        let mask = NO_FIELDS;
        for (const field of fields) mask |= this.bitOf(field);
        return mask;
    }

    /**
     * Mask for the keys of a patch object. This is the hot path: a write hands
     * over the patch it already built, and no diffing against the previous
     * entity is needed — the caller said what it is setting.
     */
    public maskOfPatch(patch: object): number {
        let mask = NO_FIELDS;
        for (const field in patch) mask |= this.bitOf(field);
        return mask;
    }



    /** True once the registry has run out of bits and returns `ALL_FIELDS`. */
    public get isSaturated(): boolean {
        return this.nextBit >= MASK_CAPACITY;
    }
}
