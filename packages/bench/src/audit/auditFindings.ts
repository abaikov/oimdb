import type { TAuditCard, TAuditEntry } from './types';

export type TAuditFindings = { done: number; total: number; open: readonly string[] };

const findingsOfCard = (card: TAuditCard): string[] => {
    if (card.kind === 'scenario') {
        return card.verdict === 'misleading' ? [`${card.scenario}: misleading`] : [];
    }
    const findings: string[] = [];
    if (card.verdict !== 'idiomatic') findings.push(`${card.participant}: ${card.verdict}`);
    for (const [wiring, audit] of Object.entries(card.wirings)) {
        if (audit.verdict === 'handicapped' || audit.verdict === 'advantaged') {
            findings.push(`${card.participant} ${wiring}: ${audit.verdict}`);
        }
    }
    return findings;
};

export const auditFindingsOf = (entries: readonly TAuditEntry[]): TAuditFindings => {
    const open: string[] = [];
    let done = 0;
    for (const entry of entries) {
        if (entry.card === undefined) {
            open.push(`${entry.subject}: no card`);
            continue;
        }
        const findings = findingsOfCard(entry.card);
        if (findings.length === 0) done++;
        else open.push(...findings);
    }
    return { done, total: entries.length, open };
};
