import { BenchLoad, MAX_FOREIGN_LOAD } from './harness/load';
import { reasonOf, runWorker } from './harness/measureBatch';
import type { TWorkerResult } from './harness/measureBatch';
import { ADAPTERS } from './harness/registry';
import { SCENARIOS, scenarioByKey } from './harness/scenarios';
import { answerOf } from './harness/signature';
import { wiringNameOf } from './harness/types';
import type { TScenario } from './harness/types';
import { CellStore } from './cells/cellStore';
import { cellStatuses } from './cells/cellStatus';
import type { TCellFilter } from './cells/cellStatus';
import { CellFingerprinter } from './cells/fingerprint';
import { formatDuration, parseDuration } from './cells/formatDuration';
import { formatReport } from './cells/formatReport';
import { formatStatus } from './cells/formatStatus';
import { eligibleOf } from './cells/participants';
import { POINTS, pointOf } from './cells/points';
import { publishResults } from './cells/publish';
import { runBatch } from './cells/runBatch';
import { scenarioTables } from './cells/scenarioTables';
import { estimateSeconds, planBatches } from './cells/selectBatches';
import type { TSelection } from './cells/selectBatches';
import type { TResolution } from './cells/types';
import { MemoryStore, isMemoryFresh, weighAdapter } from './cells/memoryCells';
import type { TPublishedMemoryRow } from './cells/publish';
import { cellShareOf, overallShare, progressSections } from './cells/progress';
import { auditEntries } from './audit/auditEntries';
import { auditFindingsOf } from './audit/auditFindings';

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
        try {
            process.kill(-process.pid, 'SIGKILL');
        } catch {
            process.exit(1);
        }
        process.exit(1);
    });
}

const USAGE = `npm run bench -- <command> [options]

commands
  status     which cells are fresh, stale, missing or declined, and how long the due ones take
  next       measure the due cells that fit in --budget (default 30m), then publish
  run        measure every selected cell, due or not (narrow it with the filters)
  verify     check every selected cell against the reference model; nothing is timed or stored
  report     print the tables assembled from the stored cells
  publish    write website/src/data/bench/results.json from the stored cells
  plan       re-calibrate the sampling plan of the selected scenarios (makes their cells stale)
  memory     weigh the heap each participant holds with the whole population loaded (default point;
             only stale or missing ones, all of them with --retry)
  progress   how much of ROADMAP.md is done, as one weighted percentage
  list       the points, scenarios and participants
  help       this text

options
  --point a,b       default, wide, small
  --scenario a,b    scenario keys (see list)
  --adapter a,b     participant names (see list)
  --budget 30m      measuring time to spend: 90s, 30m, 2h
  --processes 1     fewer processes per cell than the point asks for: a quick pass; such cells are
                    flagged \`shallow\`, are not ranked as finished, and \`next --retry\` deepens them
  --retry           next/status also count failed and flawed cells as due
  --wait            when the machine is busy, wait for it instead of stopping
  --dry-run         next/run print the batches they would run and stop`;

type TOptions = {
    command: string;
    filter: TCellFilter;
    budgetSeconds: number | undefined;
    processes: number | undefined;
    retry: boolean;
    wait: boolean;
    dryRun: boolean;
};

const listOf = (value: string | undefined): string[] =>
    value === undefined ? [] : value.split(',').map(part => part.trim()).filter(part => part.length > 0);

const parseOptions = (argv: readonly string[]): TOptions => {
    const [command = 'status', ...rest] = argv;
    const values = new Map<string, string>();
    const flags = new Set<string>();
    for (let index = 0; index < rest.length; index++) {
        const argument = rest[index];
        if (!argument.startsWith('--')) throw new Error(`Unexpected argument "${argument}"\n\n${USAGE}`);
        const name = argument.slice(2);
        if (['retry', 'wait', 'dry-run'].includes(name)) {
            flags.add(name);
            continue;
        }
        const value = rest[index + 1];
        if (value === undefined) throw new Error(`--${name} needs a value\n\n${USAGE}`);
        values.set(name, value);
        index++;
    }
    const filter: TCellFilter = {
        points: listOf(values.get('point')),
        scenarios: listOf(values.get('scenario')),
        adapters: listOf(values.get('adapter')),
    };
    filter.points.forEach(pointOf);
    filter.scenarios.forEach(scenarioByKey);
    for (const name of filter.adapters) {
        if (!ADAPTERS.some(adapter => adapter.name === name)) throw new Error(`Unknown participant "${name}"`);
    }
    const budget = values.get('budget');
    const processes = values.get('processes');
    if (processes !== undefined && !/^[1-9]\d*$/.test(processes)) {
        throw new Error(`--processes needs a whole number of at least 1, got "${processes}"`);
    }
    return {
        command,
        filter,
        budgetSeconds: budget === undefined ? undefined : parseDuration(budget),
        processes: processes === undefined ? undefined : Number(processes),
        retry: flags.has('retry'),
        wait: flags.has('wait'),
        dryRun: flags.has('dry-run'),
    };
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const GATE_POLL_MS = 5_000;

const log = (...lines: string[]): void => {
    for (const line of lines) process.stdout.write(`${line}\n`);
};

const pairText = (name: string, pair: { gap: number; drift: number; resolved: boolean }): string =>
    `${name} ${(pair.gap * 100).toFixed(1)}% apart, drift ${(pair.drift * 100).toFixed(1)}% — ` +
    `${pair.resolved ? 'resolved' : 'NOT RESOLVED'}`;

const resolutionText = (resolution: TResolution | undefined): string => {
    if (resolution === undefined) return 'no control pair in this batch';
    const fine = resolution.fine === undefined ? 'no fine pair for this wiring' : pairText('fine pair', resolution.fine);
    return `${pairText('control', resolution)}; ${fine}`;
};

const measure = async (options: TOptions, selection: TSelection, budgetSeconds: number): Promise<void> => {
    const store = new CellStore();
    const fingerprinter = new CellFingerprinter();
    const statuses = await cellStatuses(store, fingerprinter, options.filter);
    const batches = planBatches(statuses, store, budgetSeconds, selection, options.processes);
    if (batches.length === 0) {
        log('Nothing is due for the selected cells.');
        return;
    }
    const planned = batches.reduce((sum, batch) => sum + batch.estimatedSeconds, 0);
    log(`${batches.length} batch(es), about ${formatDuration(planned)} of measuring:`);
    for (const batch of batches) {
        log(
            `  ${batch.point.key}/${batch.scenario.key}: ${batch.adapterNames.join(', ')}  ` +
                `(~${formatDuration(batch.estimatedSeconds)})`
        );
    }
    if (options.dryRun) return;

    const started = Date.now();
    let done = 0;
    for (const batch of batches) {
        log('', `── ${batch.point.key}/${batch.scenario.key}`);
        let waiting = false;
        for (;;) {
            const result = await runBatch(batch, store, fingerprinter, log);
            if (result.status === 'done') {
                log(`  done in ${formatDuration(result.batch.seconds)}; ${resolutionText(result.batch.resolution)}`);
                done++;
                break;
            }
            if (!waiting) log(`  refused: ${result.reason}`);
            if (!options.wait) {
                log(`Stopped after ${done} of ${batches.length} batch(es). Re-run with --wait to wait for an idle machine.`);
                publish(store, fingerprinter).catch(error => log(String(error)));
                return;
            }
            if (!waiting) log(`  waiting for the machine to quieten, checking every ${GATE_POLL_MS / 1000} s`);
            waiting = true;
            await sleep(GATE_POLL_MS);
        }
    }
    log('', `Measured ${done} batch(es) in ${formatDuration((Date.now() - started) / 1000)}.`);
    await publish(store, fingerprinter);
};

const publishedMemoryOf = async (fingerprinter: CellFingerprinter): Promise<TPublishedMemoryRow[]> => {
    const memoryStore = new MemoryStore();
    const rows: TPublishedMemoryRow[] = [];
    for (const point of POINTS) {
        for (const record of Object.values(memoryStore.recordsOf(point.key))) {
            rows.push({
                point: point.key,
                adapter: record.adapter,
                held: record.outcome.status === 'weighed' ? record.outcome.held : null,
                failure: record.outcome.status === 'failed' ? record.outcome.reason : null,
                measuredAt: record.measuredAt,
                fresh: await isMemoryFresh(record, point, fingerprinter),
            });
        }
    }
    return rows;
};

const publish = async (store: CellStore, fingerprinter: CellFingerprinter): Promise<void> => {
    const statuses = await cellStatuses(store, fingerprinter);
    log(`Published ${publishResults(scenarioTables(statuses), await publishedMemoryOf(fingerprinter))}`);
};

const weigh = async (options: TOptions): Promise<void> => {
    const fingerprinter = new CellFingerprinter();
    const memoryStore = new MemoryStore();
    const points = options.filter.points.length === 0 ? [pointOf('default')] : options.filter.points.map(pointOf);
    for (const point of points) {
        const records = memoryStore.recordsOf(point.key);
        for (const adapter of ADAPTERS) {
            if (options.filter.adapters.length > 0 && !options.filter.adapters.includes(adapter.name)) continue;
            if (!options.retry && (await isMemoryFresh(records[adapter.name], point, fingerprinter))) continue;
            let waiting = false;
            for (;;) {
                const record = await weighAdapter(adapter.name, point, fingerprinter);
                if ('refused' in record) {
                    if (!waiting) log(`  refused: ${record.refused}`);
                    if (!options.wait) return;
                    waiting = true;
                    await sleep(GATE_POLL_MS);
                    continue;
                }
                memoryStore.save(record);
                const reading =
                    record.outcome.status === 'weighed'
                        ? `${(record.outcome.held / 1024 / 1024).toFixed(2)} MB held`
                        : `failed — ${record.outcome.reason}`;
                log(`${point.key}/${adapter.name}: ${reading}`);
                break;
            }
        }
    }
    await publish(new CellStore(), fingerprinter);
};

const faultOf = (result: TWorkerResult, scenario: TScenario): string | undefined => {
    if (result.status !== 'ok') return reasonOf(result, 'verification');
    const answer = answerOf(result, scenario.finalStateOnly === true);
    if (answer.status === 'unanswerable') return answer.problem;
    return answer.signature === answer.oracle
        ? undefined
        : `disagrees with the reference model: ${answer.signature} against ${answer.oracle}`;
};

const verify = async (options: TOptions): Promise<void> => {
    let wrong = 0;
    const run = { load: new BenchLoad(1), gcMissing: false };
    for (const point of POINTS.filter(p => options.filter.points.length === 0 || options.filter.points.includes(p.key))) {
        for (const scenario of SCENARIOS) {
            if (options.filter.scenarios.length > 0 && !options.filter.scenarios.includes(scenario.key)) continue;
            for (const adapter of eligibleOf(scenario)) {
                if (options.filter.adapters.length > 0 && !options.filter.adapters.includes(adapter.name)) continue;
                const fault = faultOf(runWorker(adapter.name, scenario.key, 'verify', point, run), scenario);
                if (fault !== undefined) wrong++;
                log(`${fault === undefined ? '✓' : '✗'} ${point.key}/${scenario.key}/${adapter.name}${fault === undefined ? '' : `  ${fault}`}`);
            }
        }
    }
    if (wrong > 0) process.exitCode = 1;
};

const main = async (): Promise<void> => {
    const options = parseOptions(process.argv.slice(2));
    const selection: TSelection = options.retry ? 'due-and-failed' : 'due';
    if (options.command === 'status') {
        const store = new CellStore();
        const statuses = await cellStatuses(store, new CellFingerprinter(), options.filter);
        log(formatStatus(statuses, estimateSeconds(statuses, store, selection)));
        log(`load gate: ${MAX_FOREIGN_LOAD} foreign runnable processes`);
        return;
    }
    if (options.command === 'next') return measure(options, selection, options.budgetSeconds ?? 30 * 60);
    if (options.command === 'run') return measure(options, 'all', options.budgetSeconds ?? Number.POSITIVE_INFINITY);
    if (options.command === 'verify') return verify(options);
    if (options.command === 'report') {
        const statuses = await cellStatuses(new CellStore(), new CellFingerprinter(), options.filter);
        log(formatReport(scenarioTables(statuses)));
        return;
    }
    if (options.command === 'publish') return publish(new CellStore(), new CellFingerprinter());
    if (options.command === 'plan') return replan(options);
    if (options.command === 'memory') return weigh(options);
    if (options.command === 'progress') return progress();
    if (options.command === 'list') return list();
    if (options.command === 'help') return log(USAGE);
    throw new Error(`Unknown command "${options.command}"\n\n${USAGE}`);
};

const replan = async (options: TOptions): Promise<void> => {
    const store = new CellStore();
    for (const point of POINTS.filter(p => options.filter.points.length === 0 || options.filter.points.includes(p.key))) {
        for (const scenario of SCENARIOS) {
            if (options.filter.scenarios.length > 0 && !options.filter.scenarios.includes(scenario.key)) continue;
            store.forgetPlan(point.key, scenario.key);
            log(`forgot the plan of ${point.key}/${scenario.key}; the next batch re-calibrates it`);
        }
    }
};

const progress = async (): Promise<void> => {
    const fingerprinter = new CellFingerprinter();
    const store = new CellStore();
    const statuses = await cellStatuses(store, fingerprinter);
    const audit = await auditEntries(fingerprinter);
    const sections = progressSections({
        cells: cellShareOf(statuses),
        audit: {
            done: audit.filter(entry => entry.state === 'current').length,
            total: audit.length,
            open: audit.filter(entry => entry.state !== 'current').map(entry => `${entry.subject}: ${entry.state}`),
        },
        findings: auditFindingsOf(audit),
    });
    for (const section of sections) {
        const share = section.total === 0 ? 0 : section.done / section.total;
        log(
            `${`${Math.round(share * 100)}%`.padStart(5)}  ${section.title.padEnd(24)} ` +
                `${section.done} of ${section.total}, weight ${section.weight}`
        );
        for (const item of section.open.slice(0, 6)) log(`         · ${item}`);
        if (section.open.length > 6) log(`         · … ${section.open.length - 6} more in ROADMAP.md`);
    }
    log(
        '',
        `overall ${Math.round(overallShare(sections) * 100)}% — weighted by ROADMAP.md; measuring still due: ` +
            `about ${formatDuration(estimateSeconds(statuses, store, 'due'))}`
    );
};

const list = (): void => {
    log('points');
    for (const point of POINTS) log(`  ${point.key.padEnd(8)} n=${point.n} window=${point.window} processes=${point.processes}`);
    log('', 'scenarios');
    for (const scenario of SCENARIOS) log(`  ${scenario.key.padEnd(26)} ${(wiringNameOf(scenario) || 'bind').padEnd(14)} ${scenario.label}`);
    log('', 'participants');
    for (const adapter of ADAPTERS) log(`  ${adapter.name.padEnd(18)} ${adapter.version}`);
};

main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
