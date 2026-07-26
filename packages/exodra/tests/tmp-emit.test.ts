import { exoSource } from '../src';

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

test('notification throughput', () => {
    const value = 0;
    let notify: () => void = () => undefined;
    const src = exoSource(
        () => value,
        on => {
            notify = on;
            return () => undefined;
        }
    );
    src.subscribe(() => value);

    // warm up
    for (let i = 0; i < 50_000; i++) notify();

    const runs: number[] = [];
    for (let r = 0; r < 7; r++) {
        const t0 = process.hrtime.bigint();
        for (let i = 0; i < 200_000; i++) notify();
        runs.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    const ms = median(runs);
    // eslint-disable-next-line no-console
    console.log(
        `200k emits, 1 subscriber = ${ms.toFixed(1)}ms  (${((ms * 1e6) / 200_000).toFixed(0)}ns per emit)`
    );
    expect(true).toBe(true);
});
