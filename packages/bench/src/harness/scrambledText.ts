const SCRAMBLE_SPAN = 36 ** 4;
const SCRAMBLE_STEP = 2_654_435_761;
const SCRAMBLE_OFFSET = 19_088_743;
const DECIMAL_TAIL = 1000;

export const scrambledText = (prefix: string, ordinal: number): string => {
    const scrambled = (ordinal * SCRAMBLE_STEP + SCRAMBLE_OFFSET) % SCRAMBLE_SPAN;
    return (
        prefix +
        scrambled.toString(36).padStart(4, '0') +
        String(ordinal % DECIMAL_TAIL).padStart(3, '0')
    );
};
