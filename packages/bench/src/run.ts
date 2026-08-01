/**
 * Runs every (adapter, scenario) pair in its own process and prints the comparison.
 *
 * Nothing is measured in this process — see `worker.ts` for why isolation is required rather than
 * merely nice.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { formatBytes, formatMs } from './harness/measure';
import { ADAPTERS, SCENARIOS } from './harness/registry';

// Kill the whole process group if this runner is interrupted. Killing the parent alone leaves the
// current worker alive, and an orphaned worker keeps burning CPU — three of them at once is what
// made an earlier run take an hour and produced numbers measured against my own leftovers.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
        try {
            process.kill(-process.pid, 'SIGKILL');
        } catch {
            // Already gone.
        }
        process.exit(1);
    });
}

const here = dirname(fileURLToPath(import.meta.url));
const workerPath = join(here, 'worker.ts');

const N = Number(process.env.BENCH_N ?? 10_000);
const QUERIES = 1_000;
const READS = 100_000;
const CHAIN_UPDATES = 10_000;
const INSERTS = 1_000;
const CHURN_ROWS = 100;
const REWRITES = 10;
const INTERACTIONS = 20;
const CARD_UPDATES = 100;
const SEARCHES = 50;

type TResult =
    | {
          status: 'ok';
          median?: number;
          best?: number;
          spread?: number;
          counter?: number;
          bytes?: number;
          reactive?: { recomputes: number; wakeups: number; inconsistencies?: number };
      }
    | { status: 'unsupported' }
    | { status: 'failed'; reason?: string }
    | { status: 'crashed'; message: string };

const runOne = (adapter: string, scenario: string): TResult => {
    try {
        const out = execFileSync(
            process.execPath,
            [
                '--expose-gc',
                '--import',
                'tsx',
                workerPath,
                adapter,
                scenario,
                String(N),
            ],
            {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                maxBuffer: 64 * 1024 * 1024,
                // No measurement may run forever. A scenario that cannot finish in five minutes is
                // reported as a timeout, which is information; hanging is not.
                timeout: 5 * 60 * 1000,
                killSignal: 'SIGKILL',
        }
        );
        const line = out.trim().split('\n').filter(Boolean).pop();
        if (!line) return { status: 'crashed', message: 'no output' };
        return JSON.parse(line) as TResult;
    } catch (error) {
        return { status: 'crashed', message: (error as Error).message.split('\n')[0] };
    }
};

const detail = (label: string): string => {
    switch (label) {
        case 'read by pk':
            return `×${READS.toLocaleString()}`;
        case 'query cold':
        case 'query hot':
        case 'faceted filter':
        case 'related lookup':
            return `×${QUERIES.toLocaleString()}`;
        case 'computed chain':
            return `×${CHAIN_UPDATES.toLocaleString()}`;
        case 'ordered insert':
            return `×${INSERTS.toLocaleString()}`;
        case 'subscription churn':
            return `×${CHURN_ROWS}`;
        case 'burst (same rows)':
            return `×${REWRITES}`;
        case 'task: table':
            return `×${INTERACTIONS}`;
        case 'task: detail card':
            return `×${CARD_UPDATES}`;
        case 'task: facet search':
            return `×${SEARCHES}`;
        case 'point update':
        case 'effect dispatch':
        case 'graph: fan-out':
        case 'graph: diamond':
        case 'graph: deep diamond':
        case 'graph: dep granularity':
            return 'per write';
        default:
            return '';
    }
};

const counterNote = (
    scenarioKey: string,
    counter: number | undefined
): string => {
    if (counter === undefined) return '';
    switch (scenarioKey) {
        case 'taskFeedPush':
            return `${counter} of 200 visible rows woke (12 were affected)`;
        case 'pointUpdate':
            return `${counter} of ${N.toLocaleString()} subscribers woke`;
        case 'effectDispatch':
            return `${counter} of ${N.toLocaleString()} effects ran`;
        case 'batchUpdate':
            return `${counter.toLocaleString()} notifications / ${(N / 10).toLocaleString()} writes`;
        case 'burstCoalescing':
            return `${counter.toLocaleString()} notifications / ${(100 * REWRITES).toLocaleString()} writes to 100 rows`;
        default:
            return String(counter);
    }
};

const pad = (s: string, n: number) => s.padEnd(n);
const padL = (s: string, n: number) => s.padStart(n);

console.log(`\nDataset: ${N.toLocaleString()} users`);
console.log(`Node ${process.version} — one process per measurement\n`);

for (const adapter of ADAPTERS) {
    console.log(`── ${adapter.name} v${adapter.version}`);
    console.log(`   recipe: ${adapter.docs}\n`);

    for (const scenario of SCENARIOS) {
        const result = runOne(adapter.name, scenario.key);
        const label = `${scenario.label} ${detail(scenario.label)}`.trim();
        let value: string;
        let note = '';

        if (result.status === 'unsupported') {
            value = 'n/a';
            note = scenario.unsupported;
        } else if (result.status === 'failed') {
            value = 'FAILED';
            note = result.reason ?? 'verification did not pass';
        } else if (result.status === 'crashed') {
            value = 'ERROR';
            note = result.message;
        } else if ('memory' in scenario && scenario.memory) {
            value = formatBytes(result.bytes ?? 0);
        } else {
            value = formatMs(result.median ?? 0);
            const noisy = (result.spread ?? 0) > 0.5 ? '  ⚠ noisy' : '';
            note = `best ${formatMs(result.best ?? 0)}${noisy}`;
            const extra = counterNote(scenario.key, result.counter);
            if (extra) note = extra;
            if (result.reactive) {
                const { recomputes, wakeups, inconsistencies } = result.reactive;
                note = `${recomputes} recomputed, ${wakeups} woken`;
                if (inconsistencies !== undefined) {
                    note += inconsistencies > 0
                        ? `, ⚠ ${inconsistencies} TORN`
                        : ', 0 torn';
                }
            }
        }

        console.log(
            `  ${pad(label, 34)}${padL(value, 12)}${note ? `  ${note}` : ''}`
        );
    }

    console.log('');
}
