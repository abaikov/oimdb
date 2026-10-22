import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BENCH_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BENCH = join(BENCH_SRC, '..');
export const REPO = join(BENCH, '..', '..');
export const RESULTS = process.env.BENCH_RESULTS ?? join(BENCH, 'results');
export const WEBSITE_DATA =
    process.env.BENCH_RESULTS === undefined
        ? join(REPO, 'website', 'src', 'data', 'bench')
        : join(RESULTS, 'published');
