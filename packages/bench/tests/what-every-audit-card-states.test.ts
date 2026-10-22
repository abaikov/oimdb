import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readParticipantCards, readScenarioCards } from '../src/audit/auditCards';
import { ADAPTERS } from '../src/harness/registry';
import { SCENARIOS } from '../src/harness/scenarios';
import { CHURN_SHAPES, READ_SHAPES } from '../src/harness/types';

describe('what every audit card states', () => {
    it('parses every card, so a malformed one fails here and not on the docs site', () => {
        assert.doesNotThrow(() => readParticipantCards());
        assert.doesNotThrow(() => readScenarioCards());
    });

    it('audits every participant, at the version the adapter declares', () => {
        const cards = readParticipantCards();
        for (const adapter of ADAPTERS) {
            const card = cards.find(candidate => candidate.participant === adapter.name);
            assert.ok(card !== undefined, `${adapter.name} has no card under audit/participants/`);
            assert.equal(card.version, adapter.version, `${card.file} audits a different version`);
        }
    });

    it('audits every scenario the report runs', () => {
        const cards = readScenarioCards();
        for (const scenario of SCENARIOS) {
            assert.ok(
                cards.some(card => card.scenario === scenario.key),
                `${scenario.key} has no card under audit/scenarios/`
            );
        }
    });

    it('keeps no card for a subject that no longer exists', () => {
        const participants = new Set(ADAPTERS.map(adapter => adapter.name));
        const scenarios = new Set(SCENARIOS.map(scenario => scenario.key as string));
        for (const card of readParticipantCards()) assert.ok(participants.has(card.participant), card.file);
        for (const card of readScenarioCards()) assert.ok(scenarios.has(card.scenario), card.file);
    });

    it('gives every wiring a participant declines the verdict `declined`, and no other wiring', () => {
        for (const card of readParticipantCards()) {
            const adapter = ADAPTERS.find(candidate => candidate.name === card.participant);
            if (adapter === undefined) continue;
            const declined = new Set<string>([
                ...CHURN_SHAPES.filter(shape => adapter.churn[shape].build === undefined).map(shape => `churn.${shape}`),
                ...READ_SHAPES.filter(shape => adapter.reads[shape].build === undefined).map(shape => `reads.${shape}`),
                ...(adapter.relations.build === undefined ? ['relations'] : []),
                ...(adapter.single.build === undefined ? ['single'] : []),
            ]);
            for (const [wiring, audit] of Object.entries(card.wirings)) {
                assert.equal(
                    audit.verdict === 'declined',
                    declined.has(wiring),
                    `${card.file}: wirings.${wiring} is "${audit.verdict}"`
                );
            }
        }
    });
});
