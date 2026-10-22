import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BenchLoad } from '../harness/load';
import type { TLoadSummary } from '../harness/load';
import { reasonOf, runWorker } from '../harness/measureBatch';
import { NO_SCENARIO } from '../harness/memoryPass';
import { CURRENT_ENVIRONMENT, sameEnvironment } from './environment';
import type { IFingerprintSource } from './fingerprint';
import { RESULTS } from './paths';
import { samePoint } from './points';
import type { TEnvironment, TFingerprint, TPoint, TPointKey } from './types';

export type TMemoryRecord = {
    adapter: string;
    point: TPoint;
    fingerprint: TFingerprint;
    environment: TEnvironment;
    load: TLoadSummary;
    measuredAt: string;
    outcome: { status: 'weighed'; baseline: number; held: number } | { status: 'failed'; reason: string };
};

type TMemoryFile = { format: 2; records: Record<string, TMemoryRecord> };

const memoryPathOf = (directory: string, point: TPointKey): string => join(directory, 'memory', `${point}.json`);

export class MemoryStore {
    public constructor(private readonly directory: string = RESULTS) {}

    public recordsOf(point: TPointKey): Record<string, TMemoryRecord> {
        const path = memoryPathOf(this.directory, point);
        if (!existsSync(path)) return {};
        const file = JSON.parse(readFileSync(path, 'utf8')) as TMemoryFile;
        return file.format === 2 ? file.records : {};
    }

    public save(record: TMemoryRecord): void {
        const records = { ...this.recordsOf(record.point.key), [record.adapter]: record };
        const path = memoryPathOf(this.directory, record.point.key);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(`${path}.tmp`, `${JSON.stringify({ format: 2, records }, undefined, 2)}\n`);
        renameSync(`${path}.tmp`, path);
    }
}

export const isMemoryFresh = async (
    record: TMemoryRecord | undefined,
    point: TPoint,
    fingerprintSource: IFingerprintSource
): Promise<boolean> => {
    if (record === undefined) return false;
    const current = await fingerprintSource.fingerprintOf(record.adapter);
    return (
        JSON.stringify(record.fingerprint) === JSON.stringify(current) &&
        samePoint(record.point, point) &&
        sameEnvironment(record.environment, CURRENT_ENVIRONMENT)
    );
};

export const weighAdapter = async (
    adapter: string,
    point: TPoint,
    fingerprintSource: IFingerprintSource
): Promise<TMemoryRecord | { refused: string }> => {
    const load = new BenchLoad(1);
    const refusal = load.refusal();
    if (refusal !== undefined) return { refused: refusal };
    const fingerprint = await fingerprintSource.fingerprintOf(adapter);
    const result = runWorker(adapter, NO_SCENARIO, 'memory', point, { load, gcMissing: false });
    return {
        adapter,
        point,
        fingerprint,
        environment: CURRENT_ENVIRONMENT,
        load: load.summary(),
        measuredAt: new Date().toISOString(),
        outcome:
            result.status === 'weighed'
                ? { status: 'weighed', baseline: result.baseline, held: result.held }
                : { status: 'failed', reason: reasonOf(result, 'memory') },
    };
};
