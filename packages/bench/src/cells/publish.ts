import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADAPTERS, EXCLUDED } from '../harness/registry';
import { SCENARIOS, isStoreless } from '../harness/scenarios';
import { wiringNameOf } from '../harness/types';
import { CURRENT_ENVIRONMENT } from './environment';
import { WEBSITE_DATA } from './paths';
import { POINTS } from './points';
import { runCountOf } from './runCount';
import type { TScenarioTable } from './scenarioTables';
import { participantCodeVolumes } from '../lines/participantCodeVolume';
import { shapeOfScenario } from '../lines/wiringCodeVolume';
import type { TWiringShape } from '../lines/wiringCodeVolume';

export type TPublishedRow = {
    adapter: string;
    place: number | null;
    ms: number;
    ratio: number | null;
    drift: number;
    processes: number;
    samples: number;
    repeat: number;
    runs: number;
    batchSeconds: number;
    deliveries: [number, number];
    distinct: [number, number];
    redundant: [number, number];
    measuredAt: string;
    stale: readonly string[];
    issues: readonly string[];
    foreignLoad: number;
};

export type TPublishedResults = {
    format: 1;
    memory: readonly TPublishedMemoryRow[];
    codeLines: Readonly<Record<string, Partial<Record<TWiringShape, number>>>>;
    generatedAt: string;
    environment: typeof CURRENT_ENVIRONMENT;
    points: typeof POINTS;
    participants: readonly { name: string; version: string; docs: string; admission: string; departure: string }[];
    excluded: readonly { name: string; version: string; reason: string }[];
    scenarios: readonly {
        key: string;
        label: string;
        description: string;
        wiring: string;
        shape: TWiringShape;
        floor: boolean;
    }[];
    tables: readonly {
        point: string;
        scenario: string;
        rows: readonly TPublishedRow[];
        problems: readonly { adapter: string; text: string }[];
        declined: readonly { adapter: string; reason: string }[];
        missing: readonly string[];
    }[];
};

export type TPublishedMemoryRow = {
    point: string;
    adapter: string;
    held: number | null;
    failure: string | null;
    measuredAt: string;
    fresh: boolean;
};

const publishedCodeLinesOf = (): Record<string, Partial<Record<TWiringShape, number>>> =>
    Object.fromEntries(
        participantCodeVolumes().map(volume => [
            volume.participant,
            Object.fromEntries(volume.shapes.map(entry => [entry.shape, entry.codeLines])),
        ])
    );

export const publishedResultsOf = (
    tables: readonly TScenarioTable[],
    memory: readonly TPublishedMemoryRow[] = []
): TPublishedResults => ({
    memory,
    codeLines: publishedCodeLinesOf(),
    format: 1,
    generatedAt: new Date().toISOString(),
    environment: CURRENT_ENVIRONMENT,
    points: POINTS,
    participants: ADAPTERS.map(adapter => ({
        name: adapter.name,
        version: adapter.version,
        docs: adapter.docs,
        admission: adapter.admission,
        departure: adapter.departure,
    })),
    excluded: EXCLUDED.map(library => ({ name: library.name, version: library.version, reason: library.reason })),
    scenarios: SCENARIOS.map(scenario => ({
        key: scenario.key,
        label: scenario.label,
        description: scenario.description,
        wiring: wiringNameOf(scenario) || 'bind',
        shape: shapeOfScenario(scenario),
        floor: isStoreless(scenario),
    })),
    tables: tables.filter(table => table.rows.length > 0 || table.problems.length > 0).map(table => ({
        point: table.point,
        scenario: table.scenario,
        rows: table.rows.map(row => ({
            adapter: row.adapter,
            place: row.place ?? null,
            ms: row.measured.min,
            ratio: row.measured.ratioToAnchor ?? null,
            drift: row.measured.drift,
            ...runCountOf(row.measured),
            batchSeconds: row.record.batch.seconds,
            deliveries: [row.measured.a.deliveries, row.measured.b.deliveries],
            distinct: [row.measured.a.distinct, row.measured.b.distinct],
            redundant: [row.measured.a.redundant, row.measured.b.redundant],
            measuredAt: row.record.measuredAt,
            stale: row.stale,
            issues: row.issues,
            foreignLoad: row.record.batch.load.foreignPeak,
        })),
        problems: table.problems,
        declined: table.declined,
        missing: table.missing,
    })),
});

export const publishResults = (
    tables: readonly TScenarioTable[],
    memory: readonly TPublishedMemoryRow[]
): string => {
    mkdirSync(WEBSITE_DATA, { recursive: true });
    const path = join(WEBSITE_DATA, 'results.json');
    writeFileSync(path, `${JSON.stringify(publishedResultsOf(tables, memory), undefined, 2)}\n`);
    return path;
};
