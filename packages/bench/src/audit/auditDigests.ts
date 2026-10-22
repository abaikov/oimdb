import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { participantModuleOf } from '../harness/participantModules';
import type { TScenario } from '../harness/types';
import type { IFingerprintSource } from '../cells/fingerprint';
import { BENCH_SRC } from '../cells/paths';

const hashOf = (parts: readonly string[]): string => {
    const hash = createHash('sha256');
    for (const part of parts) hash.update(`${part}\0`);
    return hash.digest('hex').slice(0, 16);
};

export const participantAuditDigest = async (
    participant: string,
    fingerprintSource: IFingerprintSource
): Promise<string> => {
    const source = readFileSync(join(BENCH_SRC, participantModuleOf(participant).file), 'utf8');
    const { libraries } = await fingerprintSource.fingerprintOf(participant);
    const versions = Object.entries(libraries)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, version]) => `${name}@${version}`);
    return hashOf([source, ...versions]);
};

export const scenarioAuditDigest = (scenario: TScenario): string =>
    hashOf([
        scenario.key,
        scenario.label,
        scenario.description,
        String(scenario.steps),
        JSON.stringify({
            rebuild: scenario.rebuild,
            repeatable: scenario.repeatable,
            perGroup: scenario.perGroup,
            churn: scenario.churn,
            read: scenario.read,
            relation: scenario.relation,
            single: scenario.single,
            fromEmpty: scenario.fromEmpty,
            finalStateOnly: scenario.finalStateOnly,
        }),
        scenario.prepare.toString(),
        scenario.restore.toString(),
        scenario.run.toString(),
        scenario.check.toString(),
        scenario.oracle.toString(),
    ]);
