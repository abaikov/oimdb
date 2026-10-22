import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { BENCH } from '../cells/paths';
import type {
    TAuditCard,
    TParticipantCard,
    TParticipantVerdict,
    TScenarioCard,
    TScenarioVerdict,
    TWiringAudit,
} from './types';

export const AUDIT = join(BENCH, 'audit');
export const PARTICIPANT_CARDS = join(AUDIT, 'participants');
export const SCENARIO_CARDS = join(AUDIT, 'scenarios');

export const PARTICIPANT_VERDICTS: readonly TParticipantVerdict[] = ['idiomatic', 'improvable', 'handicapped', 'advantaged'];
export const SCENARIO_VERDICTS: readonly TScenarioVerdict[] = ['representative', 'narrow', 'synthetic', 'misleading'];
export const UNSTAMPED = 'unstamped';

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

type TRaw = Record<string, unknown>;

const text = (raw: TRaw, field: string, file: string): string => {
    const value = raw[field];
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${file}: \`${field}\` must be a non-empty string`);
    }
    return value.trim();
};

const texts = (raw: TRaw, field: string, file: string): string[] => {
    const value = raw[field] ?? [];
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
        throw new Error(`${file}: \`${field}\` must be a list of strings`);
    }
    return value as string[];
};

const oneOf = <T extends string>(raw: TRaw, field: string, allowed: readonly T[], file: string): T => {
    const value = text(raw, field, file);
    if (!(allowed as readonly string[]).includes(value)) {
        throw new Error(`${file}: \`${field}\` is "${value}", expected one of ${allowed.join(', ')}`);
    }
    return value as T;
};

const wiringsOf = (raw: TRaw, file: string): Record<string, TWiringAudit> => {
    const value = raw.wirings;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${file}: \`wirings\` must be a map of wiring name to { verdict, note }`);
    }
    const wirings: Record<string, TWiringAudit> = {};
    for (const [name, entry] of Object.entries(value as TRaw)) {
        const where = `${file} wirings.${name}`;
        const wiring = (entry ?? {}) as TRaw;
        wirings[name] = {
            verdict: oneOf(wiring, 'verdict', [...PARTICIPANT_VERDICTS, 'declined'], where),
            note: text(wiring, 'note', where),
        };
    }
    return wirings;
};

const parseCard = (path: string): TAuditCard => {
    const file = path.slice(BENCH.length + 1);
    const match = FRONTMATTER.exec(readFileSync(path, 'utf8'));
    if (match === null) throw new Error(`${file}: no frontmatter`);
    const raw = (parse(match[1]) ?? {}) as TRaw;
    const body = match[2].trim();
    const common = {
        auditedAt: text(raw, 'auditedAt', file),
        auditedBy: text(raw, 'auditedBy', file),
        digest: text(raw, 'digest', file),
        summary: text(raw, 'summary', file),
        body,
        file,
    };
    if (raw.participant !== undefined) {
        const card: TParticipantCard = {
            kind: 'participant',
            participant: text(raw, 'participant', file),
            version: text(raw, 'version', file),
            verdict: oneOf(raw, 'verdict', PARTICIPANT_VERDICTS, file),
            wirings: wiringsOf(raw, file),
            improvements: texts(raw, 'improvements', file),
            ...common,
        };
        return card;
    }
    const card: TScenarioCard = {
        kind: 'scenario',
        scenario: text(raw, 'scenario', file),
        verdict: oneOf(raw, 'verdict', SCENARIO_VERDICTS, file),
        models: text(raw, 'models', file),
        measures: text(raw, 'measures', file),
        favours: texts(raw, 'favours', file),
        biases: texts(raw, 'biases', file),
        ...common,
    };
    return card;
};

const cardsIn = (directory: string): TAuditCard[] =>
    existsSync(directory)
        ? readdirSync(directory)
              .filter(name => name.endsWith('.md') && name !== 'README.md')
              .sort()
              .map(name => parseCard(join(directory, name)))
        : [];

export const readParticipantCards = (): TParticipantCard[] =>
    cardsIn(PARTICIPANT_CARDS).filter((card): card is TParticipantCard => card.kind === 'participant');

export const readScenarioCards = (): TScenarioCard[] =>
    cardsIn(SCENARIO_CARDS).filter((card): card is TScenarioCard => card.kind === 'scenario');

export const stampCard = (card: TAuditCard, digest: string): void => {
    const path = join(BENCH, card.file);
    const source = readFileSync(path, 'utf8');
    const stamped = source.replace(/^digest:.*$/m, `digest: "${digest}"`);
    if (stamped === source && card.digest !== digest) throw new Error(`${card.file}: no \`digest:\` line to stamp`);
    writeFileSync(path, stamped);
};
