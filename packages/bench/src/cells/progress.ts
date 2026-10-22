import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isStoreless, scenarioByKey } from '../harness/scenarios';
import { BENCH } from './paths';
import { qualityIssuesOf } from './quality';
import type { TCellStatus } from './types';

type TComputedShare = { done: number; total: number; open?: readonly string[] };

export type TComputedShares = {
    cells: TComputedShare;
    audit: TComputedShare;
    findings: TComputedShare;
};

export type TProgressSection = {
    title: string;
    weight: number;
    done: number;
    total: number;
    open: readonly string[];
};

const SECTION = /^## (.+?) — weight (\d+)(?: — computed: (\w+))?\s*$/;
const ITEM = /^- \[( |x)\] (.+)$/;

export const cellShareOf = (statuses: readonly TCellStatus[]): { done: number; total: number } => {
    let done = 0;
    let total = 0;
    for (const { key, state } of statuses) {
        if (state.status === 'declined') continue;
        total++;
        if (state.status !== 'fresh' || state.record.outcome.status !== 'measured') continue;
        if (qualityIssuesOf(state.record, isStoreless(scenarioByKey(key.scenario))).length === 0) done++;
    }
    return { done, total };
};

export const progressSections = (computed: TComputedShares): TProgressSection[] => {
    const sections: TProgressSection[] = [];
    let current: (TProgressSection & { open: string[] }) | undefined;
    for (const line of readFileSync(join(BENCH, 'ROADMAP.md'), 'utf8').split('\n')) {
        const header = SECTION.exec(line);
        if (header !== null) {
            const source = header[3] as keyof TComputedShares | undefined;
            const share = source === undefined ? { done: 0, total: 0 } : computed[source];
            if (source !== undefined && share === undefined) throw new Error(`ROADMAP.md: unknown source "${header[3]}"`);
            current = {
                title: header[1],
                weight: Number(header[2]),
                done: share.done,
                total: share.total,
                open: [...(share.open ?? [])],
            };
            sections.push(current);
            continue;
        }
        const item = ITEM.exec(line);
        if (item === null || current === undefined) continue;
        current.total++;
        if (item[1] === 'x') current.done++;
        else current.open.push(item[2]);
    }
    return sections;
};

export const overallShare = (sections: readonly TProgressSection[]): number => {
    const weight = sections.reduce((sum, section) => sum + section.weight, 0);
    const done = sections.reduce(
        (sum, section) => sum + (section.total === 0 ? 0 : (section.weight * section.done) / section.total),
        0
    );
    return weight === 0 ? 0 : done / weight;
};
