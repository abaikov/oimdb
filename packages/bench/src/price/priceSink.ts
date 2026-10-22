/**
 * WHERE EVERY TIMED BODY PUTS ITS RESULT, so that V8 cannot delete the body. A
 * floor optimised away to zero makes every ratio infinite. One store to a
 * known-shape module-level field is the cheapest escape a JIT cannot prove away,
 * and is paid identically by both halves of every pair.
 *
 * ONE OBJECT AND NOT ONE PER FILE: two sink objects are two hidden shapes. The
 * shape settles once, at module load.
 *
 * THE TWO OBJECT FIELDS ARE SPLIT BY SIDE. Ours sinks a slot or an observable,
 * the floor sinks a plain row; through ONE field it would be monomorphic while
 * the first side was measured and polymorphic by the second — a systematic
 * difference between the halves of the ratio, introduced by the instrument.
 */
export const priceSink: {
    number: number;
    /** Nullable because half the reads in this suite can legitimately answer nothing. */
    text: string | undefined;
    flag: boolean;
    /** Sunk by the `@oimdb/core` half of a pair, and by nothing else. */
    ours: object | undefined;
    /** Sunk by the hand-written half of a pair, and by nothing else. */
    floor: object | undefined;
} = {
    number: 0,
    text: '',
    flag: false,
    ours: undefined,
    floor: undefined,
};
