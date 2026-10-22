import type { TPriceSide } from './TPriceSide';

export const priceRoundSide = (
    count: number,
    runRound: (upTo: number, round: number) => void,
    flush?: () => void,
): TPriceSide => {
    let round = 0;
    return {
        reset: () => undefined,
        run: times => {
            let done = 0;
            while (done < times) {
                const upTo = Math.min(count, times - done);
                runRound(upTo, round++);
                flush?.();
                done += upTo;
            }
        },
    };
};
