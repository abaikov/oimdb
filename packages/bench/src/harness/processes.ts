// Independent processes per row; read by the runner and by the load gate — `README.md#processes`.
export const PROCESSES_PER_VARIANT = Number(process.env.BENCH_PROCESSES ?? 3);
if (!Number.isFinite(PROCESSES_PER_VARIANT) || PROCESSES_PER_VARIANT < 1) {
    throw new Error(
        `BENCH_PROCESSES must be a number of at least 1 (independent processes per row); ` +
            `got ${process.env.BENCH_PROCESSES}`
    );
}
