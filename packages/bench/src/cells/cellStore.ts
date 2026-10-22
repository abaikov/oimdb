import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TScenarioKey } from '../harness/types';
import { RESULTS } from './paths';
import type { TBatchRecord, TCellRecord, TPlanRecord, TPointKey } from './types';

type TCellFile = {
    format: 2;
    cells: Record<string, TCellRecord>;
};

const readJson = <T>(path: string): T | undefined =>
    existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : undefined;

const writeJsonAtomically = (path: string, value: unknown): void => {
    mkdirSync(join(path, '..'), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(value, undefined, 2)}\n`);
    renameSync(temporary, path);
};

export class CellStore {
    private readonly cellFiles = new Map<string, TCellFile>();

    public constructor(private readonly directory: string = RESULTS) {}

    public cellsOf(point: TPointKey, scenario: TScenarioKey): Readonly<Record<string, TCellRecord>> {
        return this.cellFile(point, scenario).cells;
    }

    public cellOf(point: TPointKey, scenario: TScenarioKey, adapter: string): TCellRecord | undefined {
        return this.cellFile(point, scenario).cells[adapter];
    }

    public saveCells(records: readonly TCellRecord[]): void {
        const touched = new Map<string, { point: TPointKey; scenario: TScenarioKey }>();
        for (const record of records) {
            const { point, scenario, adapter } = record.key;
            this.cellFile(point, scenario).cells[adapter] = record;
            touched.set(`${point}--${scenario}`, { point, scenario });
        }
        for (const { point, scenario } of touched.values()) {
            writeJsonAtomically(this.cellPathOf(point, scenario), this.cellFile(point, scenario));
        }
    }

    public planOf(point: TPointKey, scenario: TScenarioKey): TPlanRecord | undefined {
        const plan = readJson<TPlanRecord>(this.planPathOf(point, scenario));
        return plan?.format === 2 ? plan : undefined;
    }

    public savePlan(plan: TPlanRecord): void {
        writeJsonAtomically(this.planPathOf(plan.point.key, plan.scenario), plan);
    }

    public forgetPlan(point: TPointKey, scenario: TScenarioKey): void {
        rmSync(this.planPathOf(point, scenario), { force: true });
    }

    public appendBatch(batch: TBatchRecord): void {
        mkdirSync(this.directory, { recursive: true });
        appendFileSync(this.batchesPath(), `${JSON.stringify(batch)}\n`);
    }

    public batches(): TBatchRecord[] {
        if (!existsSync(this.batchesPath())) return [];
        return readFileSync(this.batchesPath(), 'utf8')
            .split('\n')
            .filter(line => line.length > 0)
            .map(line => JSON.parse(line) as TBatchRecord);
    }

    private cellPathOf(point: TPointKey, scenario: TScenarioKey): string {
        return join(this.directory, 'cells', `${point}--${scenario}.json`);
    }

    private planPathOf(point: TPointKey, scenario: TScenarioKey): string {
        return join(this.directory, 'plans', `${point}--${scenario}.json`);
    }

    private batchesPath(): string {
        return join(this.directory, 'batches.jsonl');
    }

    private cellFile(point: TPointKey, scenario: TScenarioKey): TCellFile {
        const id = `${point}--${scenario}`;
        let file = this.cellFiles.get(id);
        if (file === undefined) {
            const stored = readJson<TCellFile>(this.cellPathOf(point, scenario));
            file = stored?.format === 2 ? stored : { format: 2, cells: {} };
            this.cellFiles.set(id, file);
        }
        return file;
    }
}
