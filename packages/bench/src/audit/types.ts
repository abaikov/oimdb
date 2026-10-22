export type TParticipantVerdict = 'idiomatic' | 'improvable' | 'handicapped' | 'advantaged';

export type TScenarioVerdict = 'representative' | 'narrow' | 'synthetic' | 'misleading';

export type TWiringAudit = {
    verdict: TParticipantVerdict | 'declined';
    note: string;
};

export type TParticipantCard = {
    kind: 'participant';
    participant: string;
    version: string;
    auditedAt: string;
    auditedBy: string;
    digest: string;
    verdict: TParticipantVerdict;
    summary: string;
    wirings: Readonly<Record<string, TWiringAudit>>;
    improvements: readonly string[];
    body: string;
    file: string;
};

export type TScenarioCard = {
    kind: 'scenario';
    scenario: string;
    auditedAt: string;
    auditedBy: string;
    digest: string;
    verdict: TScenarioVerdict;
    models: string;
    measures: string;
    favours: readonly string[];
    biases: readonly string[];
    summary: string;
    body: string;
    file: string;
};

export type TAuditCard = TParticipantCard | TScenarioCard;

export type TAuditState = 'current' | 'stale' | 'unstamped' | 'missing';

export type TAuditEntry = {
    subject: string;
    kind: 'participant' | 'scenario';
    state: TAuditState;
    currentDigest: string;
    card: TAuditCard | undefined;
};
