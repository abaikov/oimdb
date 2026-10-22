import { ADAPTERS } from '../harness/registry';
import { SCENARIOS } from '../harness/scenarios';
import type { IFingerprintSource } from '../cells/fingerprint';
import { participantAuditDigest, scenarioAuditDigest } from './auditDigests';
import { UNSTAMPED, readParticipantCards, readScenarioCards } from './auditCards';
import type { TAuditCard, TAuditEntry, TAuditState } from './types';

const stateOf = (card: TAuditCard | undefined, currentDigest: string): TAuditState => {
    if (card === undefined) return 'missing';
    if (card.digest === UNSTAMPED) return 'unstamped';
    return card.digest === currentDigest ? 'current' : 'stale';
};

export const auditEntries = async (fingerprintSource: IFingerprintSource): Promise<TAuditEntry[]> => {
    const participantCards = readParticipantCards();
    const scenarioCards = readScenarioCards();
    const entries: TAuditEntry[] = [];
    for (const adapter of ADAPTERS) {
        const card = participantCards.find(candidate => candidate.participant === adapter.name);
        const currentDigest = await participantAuditDigest(adapter.name, fingerprintSource);
        entries.push({
            subject: adapter.name,
            kind: 'participant',
            state: stateOf(card, currentDigest),
            currentDigest,
            card,
        });
    }
    for (const scenario of SCENARIOS) {
        const card = scenarioCards.find(candidate => candidate.scenario === scenario.key);
        const currentDigest = scenarioAuditDigest(scenario);
        entries.push({
            subject: scenario.key,
            kind: 'scenario',
            state: stateOf(card, currentDigest),
            currentDigest,
            card,
        });
    }
    return entries;
};
