import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ADAPTERS, CONTROLS } from '../src/harness/registry';
import { PARTICIPANT_MODULES, loadParticipant } from '../src/harness/participantModules';
import { SCENARIOS, isStoreless } from '../src/harness/scenarios';
import { eligibleOf } from '../src/cells/participants';
import { formatDuration, parseDuration } from '../src/cells/formatDuration';

describe('what the registry promises a worker', () => {
    it('lists every participant and control a worker can be asked for, under the same name', () => {
        const registered = [...ADAPTERS, ...CONTROLS].map(adapter => adapter.name).sort();
        const loadable = PARTICIPANT_MODULES.map(participantModule => participantModule.name).sort();
        assert.deepEqual(loadable, registered);
    });

    it('hands a worker the very object the registry holds', async () => {
        for (const adapter of [...ADAPTERS, ...CONTROLS]) {
            assert.equal(await loadParticipant(adapter.name), adapter, adapter.name);
        }
    });

    it('gives every comparison a scenario signs as met at least two sides', () => {
        for (const scenario of SCENARIOS) {
            if (isStoreless(scenario) || !scenario.standing.B1.met) continue;
            assert.ok(
                eligibleOf(scenario).length >= 2,
                `${scenario.key}: standing.B1 says MET and ${eligibleOf(scenario).length} participant(s) take part`
            );
        }
    });
});

describe('how a budget is written', () => {
    it('reads seconds, minutes and hours, and minutes when no unit is given', () => {
        assert.equal(parseDuration('90s'), 90);
        assert.equal(parseDuration('30m'), 1800);
        assert.equal(parseDuration('2h'), 7200);
        assert.equal(parseDuration('45'), 2700);
        assert.throws(() => parseDuration('soon'));
    });

    it('prints a duration in the largest unit that keeps it readable', () => {
        assert.equal(formatDuration(42), '42 s');
        assert.equal(formatDuration(1800), '30 min');
        assert.equal(formatDuration(7500), '2 h 05 min');
    });
});
